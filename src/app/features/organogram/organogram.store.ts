import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { debounceTime, filter, finalize, Subject } from 'rxjs';
import { OrgDataService } from '../../core/data/org-data.service';
import { OrganogramApiService } from './organogram-api.service';
import { buildHierarchy, matchesNode } from './hierarchy-builder';
import { OrganogramNode, OrganogramResponse, OrganogramView } from './organogram.models';
import { OrganogramRealtimeService } from './organogram-realtime.service';

@Injectable()
export class OrganogramStore implements OnDestroy {
  private readonly api = inject(OrganogramApiService);
  private readonly org = inject(OrgDataService);
  private readonly realtime = inject(OrganogramRealtimeService);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloads = new Subject<void>();
  private connectedCompanyId: number | null = null;
  readonly data = signal<OrganogramResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly conflict = signal(false);
  readonly disconnected = signal(false);
  readonly companyId = signal<number | null>(null);
  readonly view = signal<OrganogramView>('EMPLOYEE');
  readonly includeVacancies = signal(true);
  readonly departmentId = signal<number | null>(null);
  readonly search = signal('');
  readonly searchIndex = signal(0);
  readonly selectedId = signal<number | null>(null);
  readonly collapsed = signal(new Set<number>());
  readonly zoom = signal(1);
  readonly pan = signal({ x: 0, y: 0 });
  readonly editMode = signal(false);
  readonly undoChange = signal<{ person: OrganogramNode; managerId: number | null } | null>(null);
  readonly companyOptions = computed(() => this.org.companyOptions());
  readonly departments = computed(() => this.data()?.departments ?? []);
  readonly hierarchy = computed(() =>
    buildHierarchy(this.filteredNodes(), this.data()?.rootIds ?? []),
  );
  readonly selected = computed(() =>
    this.selectedId() == null
      ? null
      : (this.hierarchy().byId.get(this.selectedId()!)?.data ?? null),
  );
  readonly filteredNodes = computed(() => {
    const all = this.data()?.nodes ?? [];
    const dept = this.departmentId();
    return dept == null ? all : all.filter((n) => n.departmentId === dept);
  });
  readonly matches = computed(() => {
    const q = this.search();
    if (!q.trim()) return [];
    const names = new Map(this.departments().map((d) => [d.id, d.name]));
    return this.filteredNodes().filter((n) =>
      matchesNode(n, q, names.get(n.departmentId ?? -1) ?? ''),
    );
  });
  readonly activeMatch = computed(() => this.matches()[this.searchIndex()] ?? null);

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    const company = Number(q.get('company'));
    const selected = Number(q.get('employee'));
    const mode = q.get('view');
    const dept = Number(q.get('department'));
    this.companyId.set(
      Number.isFinite(company) && company > 0
        ? company
        : (this.org.companyOptions()[0]?.value ?? null),
    );
    if (mode === 'POSITION') this.view.set('POSITION');
    if (Number.isFinite(selected) && selected > 0) this.selectedId.set(selected);
    if (Number.isFinite(dept) && dept > 0) this.departmentId.set(dept);
    this.reloads
      .pipe(debounceTime(180), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load(true));
    this.realtime.events
      .pipe(
        filter((e) => e.companyId === this.companyId()),
        debounceTime(250),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.messages.add({
          severity: 'info',
          summary: 'Organogram updated',
          detail: 'Another administrator changed the hierarchy.',
        });
        this.load(true);
      });
    this.realtime.connection
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => this.disconnected.set(s === 'disconnected'));
    if (this.companyId() != null) this.load();
  }
  load(preserveView = false) {
    const company = this.companyId();
    if (company == null) return;
    this.loading.set(true);
    this.error.set(null);
    this.api
      .get(company, this.view(), this.includeVacancies())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.conflict.set(false);
          if (!preserveView) this.fit();
          if (this.connectedCompanyId !== company) {
            this.realtime.connect(company);
            this.connectedCompanyId = company;
          }
          this.syncQuery();
        },
        error: () =>
          this.error.set(
            'The organogram could not be loaded. Check your connection and try again.',
          ),
      });
  }
  selectCompany(id: number | null) {
    this.companyId.set(id);
    this.selectedId.set(null);
    this.departmentId.set(null);
    this.collapsed.set(new Set());
    this.load();
  }
  setView(view: OrganogramView) {
    if (this.view() === view) return;
    this.view.set(view);
    this.selectedId.set(null);
    this.load();
  }
  select(node: OrganogramNode | null) {
    this.selectedId.set(node?.id ?? null);
    this.syncQuery();
  }
  nextMatch(delta = 1) {
    const matches = this.matches();
    if (!matches.length) return;
    this.searchIndex.set((this.searchIndex() + delta + matches.length) % matches.length);
    this.focusNode(matches[this.searchIndex()].id);
  }
  focusNode(id: number) {
    for (const a of this.hierarchy().ancestors.get(id) ?? [])
      this.collapsed.update((s) => {
        const n = new Set(s);
        n.delete(a);
        return n;
      });
    this.selectedId.set(id);
    queueMicrotask(() =>
      document
        .querySelector(`[data-org-node="${id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
    );
    this.syncQuery();
  }
  collapseAll() {
    this.collapsed.set(
      new Set(
        [...this.hierarchy().byId.values()].filter((n) => n.children.length).map((n) => n.data.id),
      ),
    );
  }
  expandAll() {
    this.collapsed.set(new Set());
  }
  toggle(id: number) {
    this.collapsed.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  fit() {
    this.zoom.set(1);
    this.pan.set({ x: 0, y: 0 });
  }
  zoomBy(delta: number) {
    this.zoom.set(Math.min(2, Math.max(0.3, +(this.zoom() + delta).toFixed(2))));
  }
  changeManager(person: OrganogramNode, manager: OrganogramNode | null) {
    const previous = person.parentId;
    this.api
      .changeManager(
        person.staffId ?? person.id,
        manager?.staffId ?? manager?.id ?? null,
        person.version,
      )
      .subscribe({
        next: (updated) => {
          this.undoChange.set({ person: updated, managerId: previous });
          this.data.update((d) =>
            d ? { ...d, nodes: d.nodes.map((n) => (n.id === person.id ? updated : n)) } : d,
          );
          this.messages.add({
            severity: 'success',
            summary: 'Hierarchy updated',
            detail: `${person.name} now reports to ${manager?.name ?? 'no manager'}.`,
            life: 5000,
          });
          this.conflict.set(false);
        },
        error: (e: HttpErrorResponse) => {
          if (e.status === 409) {
            this.conflict.set(true);
            this.messages.add({
              severity: 'warn',
              summary: 'Hierarchy changed',
              detail: 'Your change was not saved. Refresh and try again.',
            });
          }
          this.data.update((d) =>
            d
              ? {
                  ...d,
                  nodes: d.nodes.map((n) =>
                    n.id === person.id ? { ...n, parentId: previous } : n,
                  ),
                }
              : d,
          );
        },
      });
  }
  requestReload() {
    this.reloads.next();
  }
  undo() {
    const change = this.undoChange();
    if (!change) return;
    const manager = this.data()?.nodes.find((n) => n.id === change.managerId) ?? null;
    this.undoChange.set(null);
    this.changeManager(change.person, manager);
  }
  companyForStaff(staffId: number) {
    return this.org.staff.snapshot().find((x) => x.id === staffId)?.companyId ?? null;
  }
  ngOnDestroy(): void {
    this.realtime.disconnect();
    this.connectedCompanyId = null;
    this.reloads.complete();
  }
  private syncQuery() {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParamsHandling: 'merge',
      queryParams: {
        company: this.companyId(),
        employee: this.selectedId(),
        view: this.view(),
        department: this.departmentId(),
      },
    });
  }
}
