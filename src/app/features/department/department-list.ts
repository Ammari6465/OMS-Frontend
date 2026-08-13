import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { TableLazyLoadEvent } from 'primeng/types/table';
import { finalize } from 'rxjs';

import { Option, OrgDataService } from '../../core/data/org-data.service';
import { EntityStatus } from '../../core/models/enums';
import { Department } from '../../core/models/organization.model';
import { AuthService } from '../../core/services/auth.service';
import { DepartmentCreateRequest, DepartmentService } from './department.service';

@Component({
  selector: 'app-department-list',
  imports: [
    ReactiveFormsModule, FormsModule, TableModule, ButtonModule, InputTextModule, TextareaModule,
    DialogModule, SelectModule, TagModule, TooltipModule, ToggleSwitchModule,
  ],
  template: `
    <div class="oms-page">
      <div class="oms-page-header">
        <div>
          <h1 class="oms-page-title">Departments</h1>
          <p class="oms-page-subtitle">Configure departments and sub-departments per company.</p>
        </div>
        @if (canManage()) {
          <p-button label="New department" icon="pi pi-plus" (onClick)="openCreate()" />
        }
      </div>

      <div class="oms-surface-card">
        <p-table [value]="rows()" [loading]="loading()" [paginator]="true" [rows]="pageSize()"
          [rowsPerPageOptions]="[10, 20, 50]" [lazy]="true" [totalRecords]="totalRecords()"
          [first]="page() * pageSize()" (onLazyLoad)="onLazyLoad($event)"
          [sortField]="sortField()" [sortOrder]="sortDirection() === 'asc' ? 1 : -1"
          dataKey="id" [showCurrentPageReport]="true"
          currentPageReportTemplate="Showing {first}–{last} of {totalRecords}" styleClass="p-datatable-sm">
          <ng-template #caption>
            <div class="crud-toolbar">
              <span class="crud-search"><i class="pi pi-search"></i>
                <input pInputText type="text" placeholder="Search departments…"
                  [ngModel]="search()" (ngModelChange)="applySearch($event)"
                  [ngModelOptions]="{ standalone: true }" /></span>
              <p-select [ngModel]="companyFilter()" (ngModelChange)="applyCompanyFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="companyFilterOptions()"
                optionLabel="label" optionValue="value" placeholder="All companies" styleClass="crud-filter" />
              <p-select [ngModel]="statusFilter()" (ngModelChange)="applyStatusFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="statusFilterOptions"
                optionLabel="label" optionValue="value" placeholder="All statuses" styleClass="crud-filter" />
              <label class="crud-archived-toggle">
                <p-toggleswitch [ngModel]="showArchived()" (ngModelChange)="toggleArchived($event)"
                  [ngModelOptions]="{ standalone: true }" />
                Show archived
              </label>
            </div>
          </ng-template>
          <ng-template #header>
            <tr>
              <th pSortableColumn="name">Name</th>
              <th>Company</th>
              <th>Parent</th>
              <th>Head</th>
              <th pSortableColumn="status">Status</th>
              <th style="width:7rem"></th>
            </tr>
          </ng-template>
          <ng-template #body let-d>
            <tr [class.crud-archived-row]="d.isDeleted">
              <td><span class="crud-cell-strong">{{ d.name }}</span>
                @if (d.description) { <div class="crud-muted" style="font-size:.78rem">{{ d.description }}</div> }
              </td>
              <td>{{ d.companyName || org.companyName(d.companyId) }}</td>
              <td>{{ departmentName(d.parentDeptId) }}</td>
              <td>{{ org.staffName(d.headStaffId) }}</td>
              <td>
                @if (d.isDeleted) { <p-tag value="Archived" severity="secondary" /> }
                @else { <p-tag [value]="d.status === 'ACTIVE' ? 'Active' : 'Inactive'" [severity]="d.status === 'ACTIVE' ? 'success' : 'warn'" /> }
              </td>
              <td>
                <div class="crud-actions">
                @if (!d.isDeleted && canManage()) {
                    <button type="button" class="crud-icon-act" pTooltip="Edit" (click)="openEdit(d)"><i class="pi pi-pencil"></i></button>
                    <button type="button" class="crud-icon-act danger" pTooltip="Archive" (click)="confirmDelete(d)"><i class="pi pi-trash"></i></button>
                } @else if (d.isDeleted && canManage()) {
                    <button type="button" class="crud-icon-act" pTooltip="Restore" (click)="restore(d)"><i class="pi pi-refresh"></i></button>
                  }
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="6"><div class="crud-empty"><i class="pi pi-briefcase"></i><p>No departments found</p><span>Create one to organise your staff.</span></div></td></tr>
          </ng-template>
        </p-table>
      </div>

      <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '34rem' }"
        [header]="editingId() ? 'Edit department' : 'New department'" [draggable]="false">
        <form [formGroup]="form" class="crud-form">
          <div class="field">
            <label>Company *</label>
            <p-select formControlName="companyId" [options]="companyOptions()" optionLabel="label" optionValue="value"
              placeholder="Select company" styleClass="w-full" appendTo="body" />
            @if (invalid('companyId')) { <small class="err">Company is required.</small> }
          </div>
          <div class="field">
            <label>Department name *</label>
            <input pInputText formControlName="name" class="w-full" placeholder="e.g. Finance" />
            @if (invalid('name')) { <small class="err">Name is required and must be at most 200 characters.</small> }
          </div>
          <div class="field">
            <label>Description</label>
            <textarea pTextarea formControlName="description" rows="2" maxlength="1000" class="w-full"></textarea>
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Parent department</label>
              <p-select formControlName="parentDeptId" [options]="parentOptions()" optionLabel="label" optionValue="value"
                placeholder="None" [showClear]="true" styleClass="w-full" appendTo="body" />
            </div>
            <div class="field">
              <label>Department head</label>
              <p-select formControlName="headStaffId" [options]="staffOptions()" optionLabel="label" optionValue="value"
                placeholder="Unassigned" [showClear]="true" styleClass="w-full" appendTo="body" />
            </div>
          </div>
          <div class="field">
            <label>Status</label>
            <p-select formControlName="status" [options]="statusOptions" optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
          </div>
        </form>
        <ng-template #footer>
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
          <p-button [label]="editingId() ? 'Save changes' : 'Create'" icon="pi pi-check"
            (onClick)="save()" [loading]="saving()" [disabled]="saving()" />
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class DepartmentList {
  readonly org = inject(OrgDataService);
  private readonly auth = inject(AuthService);
  private readonly departments = inject(DepartmentService);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly rows = signal<Department[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showArchived = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly totalRecords = signal(0);
  readonly page = signal(0);
  readonly pageSize = signal(20);
  readonly search = signal('');
  readonly statusFilter = signal<EntityStatus | null>(null);
  readonly companyFilter = signal<number | null>(null);
  readonly sortField = signal<'name' | 'status' | 'createdAt' | 'updatedAt'>('name');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');
  readonly canManage = this.auth.canEditOrgData;
  private readonly selectedCompany = signal<number | null>(null);
  private readonly availableParents = signal<Department[]>([]);

  dialogVisible = false;

  readonly companyOptions = computed(() => {
    const options = this.org.companyOptions();
    const user = this.auth.currentUser();
    return this.auth.isSuperAdmin() || user?.companyId == null
      ? options
      : options.filter((option) => option.value === user.companyId);
  });
  readonly companyFilterOptions = computed(() => [
    { label: 'All companies', value: null as number | null },
    ...this.companyOptions(),
  ]);
  readonly statusOptions = [
    { label: 'Active', value: EntityStatus.ACTIVE },
    { label: 'Inactive', value: EntityStatus.INACTIVE },
  ];
  readonly statusFilterOptions = [{ label: 'All statuses', value: null as EntityStatus | null }, ...this.statusOptions];

  readonly parentOptions = computed<Option[]>(() => this.availableParents()
    .filter((department) => department.id !== this.editingId())
    .map((department) => ({ label: department.name, value: department.id })));
  readonly staffOptions = computed<Option[]>(() => this.org.staffOptions(this.selectedCompany()));

  readonly form = this.fb.nonNullable.group({
    companyId: [null as number | null, Validators.required],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(1000)],
    parentDeptId: [null as number | null],
    headStaffId: [null as number | null],
    status: [EntityStatus.ACTIVE],
  });

  constructor() {
    this.form.get('companyId')!.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.selectedCompany.set(value);
      this.loadParentOptions(value);
    });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.pageSize();
    this.pageSize.set(rows);
    this.page.set(Math.floor((event.first ?? 0) / rows));
    const field = typeof event.sortField === 'string' ? event.sortField : 'name';
    this.sortField.set(field === 'status' || field === 'createdAt' || field === 'updatedAt' ? field : 'name');
    this.sortDirection.set(event.sortOrder === -1 ? 'desc' : 'asc');
    this.load();
  }

  applySearch(value: string): void {
    this.search.set(value);
    this.resetAndLoad();
  }

  applyCompanyFilter(value: number | null): void {
    this.companyFilter.set(value);
    this.resetAndLoad();
  }

  applyStatusFilter(value: EntityStatus | null): void {
    this.statusFilter.set(value);
    this.resetAndLoad();
  }

  toggleArchived(value: boolean): void {
    this.showArchived.set(value);
    this.resetAndLoad();
  }

  invalid(control: string): boolean {
    const field = this.form.get(control);
    return !!field && field.invalid && (field.touched || field.dirty);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.selectedCompany.set(null);
    this.availableParents.set([]);
    this.form.reset({ companyId: null, name: '', description: '', parentDeptId: null, headStaffId: null, status: EntityStatus.ACTIVE });
    this.dialogVisible = true;
  }

  openEdit(department: Department): void {
    this.editingId.set(department.id);
    this.selectedCompany.set(department.companyId);
    this.loadParentOptions(department.companyId);
    this.form.reset({
      companyId: department.companyId,
      name: department.name,
      description: department.description ?? '',
      parentDeptId: department.parentDeptId ?? null,
      headStaffId: department.headStaffId ?? null,
      status: department.status,
    });
    this.dialogVisible = true;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const payload: DepartmentCreateRequest = { ...value, companyId: value.companyId! };
    const id = this.editingId();
    const current = id ? this.rows().find((department) => department.id === id) : null;
    const operation = id
      ? this.departments.update(id, { ...payload, version: current?.version ?? 0 })
      : this.departments.create(payload);
    operation.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.dialogVisible = false;
        this.load();
        this.loadParentOptions(value.companyId);
        this.messages.add({ severity: 'success', summary: id ? 'Department updated' : 'Department created', detail: value.name });
      },
      error: () => undefined,
    });
  }

  confirmDelete(department: Department): void {
    this.confirm.confirm({
      header: 'Archive department',
      message: `Archive “${department.name}”? Departments with employees, positions, or sub-departments cannot be archived.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Archive',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.departments.archive(department.id).subscribe({
        next: () => {
          this.load();
          this.loadParentOptions(department.companyId);
          this.messages.add({ severity: 'info', summary: 'Archived', detail: department.name });
        },
        error: () => undefined,
      }),
    });
  }

  restore(department: Department): void {
    this.departments.restore(department.id).subscribe({
      next: () => {
        this.load();
        this.loadParentOptions(department.companyId);
        this.messages.add({ severity: 'success', summary: 'Restored', detail: department.name });
      },
      error: () => undefined,
    });
  }

  departmentName(id?: number | null): string {
    if (id == null) return '—';
    return this.availableParents().find((department) => department.id === id)?.name
      ?? this.org.departmentName(id);
  }

  private resetAndLoad(): void {
    this.page.set(0);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.departments.list({
      page: this.page(),
      size: this.pageSize(),
      sort: this.sortField(),
      direction: this.sortDirection(),
      search: this.search(),
      status: this.statusFilter(),
      companyId: this.companyFilter(),
      includeDeleted: this.showArchived(),
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (result) => {
        this.rows.set(result.content);
        this.totalRecords.set(result.totalElements);
      },
      error: () => {
        this.rows.set([]);
        this.totalRecords.set(0);
      },
    });
  }

  private loadParentOptions(companyId: number | null): void {
    if (companyId == null) {
      this.availableParents.set([]);
      return;
    }
    this.departments.list({ companyId, size: 200, sort: 'name' }).subscribe({
      next: (result) => this.availableParents.set(result.content),
      error: () => this.availableParents.set([]),
    });
  }
}
