import { Component, ElementRef, HostListener, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { OrganogramFocusService } from '../../shared/ai/organogram-focus.service';
import { OrganogramCanvas } from './organogram-canvas';
import { OrganogramDetailsDrawer } from './organogram-details-drawer';
import { OrganogramExportService } from './organogram-export.service';
import { OrganogramNode } from './organogram.models';
import { OrganogramStore } from './organogram.store';
import { OrganogramToolbar } from './organogram-toolbar';
@Component({
  selector: 'app-organogram-viewer',
  providers: [OrganogramStore],
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    SelectModule,
    OrganogramToolbar,
    OrganogramCanvas,
    OrganogramDetailsDrawer,
  ],
  template: `<section #shell class="shell" [class.disconnected]="s.disconnected()">
      <app-organogram-toolbar (fullscreen)="fullscreen()" (exportMenu)="exportVisible = true" />
      @if (s.disconnected()) {
        <div class="connection">
          <i class="pi pi-wifi"></i>Live updates disconnected — reconnecting…
        </div>
      }
      @if (s.conflict()) {
        <div class="conflict" role="alert">
          The hierarchy changed while you were editing.
          <button (click)="s.load(true)">Refresh now</button>
        </div>
      }
      @if (s.loading() && !s.data()) {
        <div class="state" aria-live="polite">
          <i class="pi pi-spin pi-spinner"></i>
          <h2>Loading organogram</h2>
        </div>
      } @else if (s.error()) {
        <div class="state">
          <i class="pi pi-exclamation-circle"></i>
          <h2>Unable to load organogram</h2>
          <p>{{ s.error() }}</p>
          <p-button label="Retry" icon="pi pi-refresh" (onClick)="s.load()" />
        </div>
      } @else if (!s.data()?.nodes?.length) {
        <div class="state">
          <i class="pi pi-sitemap"></i>
          <h2>This company has no hierarchy yet</h2>
          <p>Add active employees or positions to begin.</p>
        </div>
      } @else if (s.departmentId() != null && !s.filteredNodes().length) {
        <div class="state">
          <i class="pi pi-filter-slash"></i>
          <h2>No results in this department</h2>
          <button (click)="s.departmentId.set(null)">Clear filter</button>
        </div>
      } @else {
        <app-organogram-canvas (managerChange)="confirmChange($event.person, $event.manager)" />
      }
      <app-organogram-details-drawer [node]="s.selected()" />
    </section>
    <p-dialog
      [(visible)]="managerVisible"
      header="Change manager"
      [modal]="true"
      [style]="{ width: '34rem', maxWidth: '95vw' }"
      ><p>
        Move <strong>{{ managerPerson?.name }}</strong> from
        <strong>{{ oldManagerName() }}</strong> to:
      </p>
      <p-select
        [(ngModel)]="newManagerId"
        [options]="managerOptions()"
        optionLabel="label"
        optionValue="value"
        [filter]="true"
        [showClear]="true"
        placeholder="No manager (root)"
        appendTo="body"
        ariaLabel="New manager" /><ng-template #footer
        ><p-button
          label="Cancel"
          severity="secondary"
          [text]="true"
          (onClick)="managerVisible = false" /><p-button
          label="Confirm change"
          icon="pi pi-check"
          (onClick)="saveManager()" /></ng-template></p-dialog
    ><p-dialog
      [(visible)]="exportVisible"
      header="Export organogram"
      [modal]="true"
      [style]="{ width: '28rem' }"
      ><div class="exports">
        <button (click)="png()">
          <i class="pi pi-image"></i><strong>PNG image</strong
          ><span>Current rendered hierarchy</span></button
        ><button (click)="print()">
          <i class="pi pi-file-pdf"></i><strong>PDF / branded print</strong
          ><span>Use your browser's PDF printer</span></button
        ><button (click)="csv()">
          <i class="pi pi-table"></i><strong>CSV hierarchy</strong
          ><span>Complete hierarchy data</span>
        </button>
      </div></p-dialog
    >`,
  styles: [
    `
      .shell {
        display: flex;
        flex-direction: column;
        height: calc(100vh - var(--oms-topbar-height) - 47px);
        position: relative;
      }
      .state {
        flex: 1;
        display: grid;
        place-content: center;
        text-align: center;
        color: var(--p-text-muted-color);
      }
      .state i {
        font-size: 2.5rem;
      }
      .state h2 {
        color: var(--p-text-color);
      }
      .connection,
      .conflict {
        padding: 0.4rem 1rem;
        font-size: 0.75rem;
      }
      .connection {
        background: color-mix(in srgb, #f59e0b 15%, var(--p-content-background));
      }
      .conflict {
        background: color-mix(in srgb, #ef4444 15%, var(--p-content-background));
      }
      .conflict button {
        margin-left: 0.5rem;
      }
      .exports {
        display: grid;
        gap: 0.6rem;
      }
      .exports button {
        display: grid;
        grid-template-columns: 2rem 1fr;
        text-align: left;
        gap: 0.1rem 0.5rem;
        padding: 0.8rem;
        border: 1px solid var(--p-content-border-color);
        border-radius: 10px;
        background: transparent;
        color: var(--p-text-color);
      }
      .exports button i {
        grid-row: span 2;
        font-size: 1.3rem;
        color: var(--p-primary-color);
      }
      .exports button span {
        font-size: 0.72rem;
        color: var(--p-text-muted-color);
      }
      @media (max-width: 760px) {
        .shell {
          height: calc(100vh - var(--oms-topbar-height));
        }
      }
      @media print {
        app-organogram-toolbar,
        .connection,
        .conflict,
        app-organogram-details-drawer {
          display: none;
        }
        .shell {
          height: auto;
        }
      }
    `,
  ],
})
export class OrganogramViewer {
  @ViewChild(OrganogramCanvas) canvas?: OrganogramCanvas;
  @ViewChild('shell') shell?: ElementRef<HTMLElement>;
  readonly s = inject(OrganogramStore);
  private focus = inject(OrganogramFocusService);
  private confirm = inject(ConfirmationService);
  private exports = inject(OrganogramExportService);
  managerVisible = false;
  exportVisible = false;
  managerPerson?: OrganogramNode;
  newManagerId: number | null = null;
  constructor() {
    effect(() => {
      const req = this.focus.request();
      if (!req) return;
      const local = this.s.data()?.nodes.find((n) => n.staffId === req.staffId);
      if (local) {
        this.s.focusNode(local.id);
        this.focus.clear();
        return;
      }
      const company = this.s.companyForStaff(req.staffId);
      if (company) {
        this.s.selectCompany(company);
        setTimeout(() => {
          const node = this.s.data()?.nodes.find((n) => n.staffId === req.staffId);
          if (node) this.s.focusNode(node.id);
          this.focus.clear();
        }, 500);
      }
    });
  }
  confirmChange(person: OrganogramNode, manager: OrganogramNode | null) {
    if (!this.s.editMode()) return;
    this.managerPerson = person;
    this.newManagerId = manager?.id ?? null;
    this.managerVisible = true;
  }
  managerOptions() {
    const person = this.managerPerson;
    if (!person) return [];
    const blocked = this.s.hierarchy().descendants.get(person.id) ?? new Set();
    return (this.s.data()?.nodes ?? [])
      .filter((n) => n.id !== person.id && !blocked.has(n.id) && !n.vacant)
      .map((n) => ({ label: `${n.name} — ${n.title || 'No title'}`, value: n.id }));
  }
  oldManagerName() {
    return (
      this.s.data()?.nodes.find((n) => n.id === this.managerPerson?.parentId)?.name ?? 'No manager'
    );
  }
  saveManager() {
    const person = this.managerPerson;
    if (!person) return;
    const manager = this.s.data()?.nodes.find((n) => n.id === this.newManagerId) ?? null;
    this.confirm.confirm({
      header: 'Confirm reporting-line change',
      message: `Move ${person.name} from ${this.oldManagerName()} to ${manager?.name ?? 'no manager'}?`,
      acceptLabel: 'Change manager',
      rejectLabel: 'Cancel',
      accept: () => {
        this.managerVisible = false;
        this.s.changeManager(person, manager);
      },
    });
  }
  fullscreen() {
    const el = this.shell?.nativeElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }
  png() {
    const stage = this.canvas?.stage?.nativeElement;
    const data = this.s.data();
    if (stage && data) void this.exports.png(stage, data);
    this.exportVisible = false;
  }
  csv() {
    const data = this.s.data();
    if (data) this.exports.csv(data);
    this.exportVisible = false;
  }
  print() {
    this.exports.print();
    this.exportVisible = false;
  }
  @HostListener('document:keydown.escape') escape() {
    if (this.managerVisible) this.managerVisible = false;
    else if (this.exportVisible) this.exportVisible = false;
    else this.s.select(null);
  }
}
