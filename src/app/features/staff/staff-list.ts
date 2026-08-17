import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { TableLazyLoadEvent } from 'primeng/types/table';
import {
  Subject, catchError, concatMap, debounceTime, distinctUntilChanged, finalize,
  forkJoin, from, map, of, toArray,
} from 'rxjs';

import { Option, OrgDataService } from '../../core/data/org-data.service';
import { EmploymentType, EntityStatus } from '../../core/models/enums';
import { Staff } from '../../core/models/organization.model';
import { AuthService } from '../../core/services/auth.service';
import { StaffCreateRequest, StaffService, StaffSortField } from './staff.service';

const dateRangeValidator = (control: AbstractControl): ValidationErrors | null => {
  const joined = control.get('dateJoined')?.value as string | null;
  const left = control.get('dateLeft')?.value as string | null;
  return joined && left && left < joined ? { invalidEmploymentDates: true } : null;
};

@Component({
  selector: 'app-staff-list',
  imports: [
    ReactiveFormsModule, FormsModule, TableModule, ButtonModule, InputTextModule, DialogModule,
    SelectModule, TagModule, TooltipModule, ToggleSwitchModule, AvatarModule,
  ],
  template: `
    <div class="oms-page">
      <div class="oms-page-header">
        <div>
          <h1 class="oms-page-title">Staff Management</h1>
          <p class="oms-page-subtitle">Manage employee records, positions, and reporting relationships.</p>
        </div>
        <div class="header-actions">
          <p-button label="Refresh" icon="pi pi-refresh" [outlined]="true" [loading]="loading()" (onClick)="refresh()" />
          @if (canManage()) {
            <p-button label="Import CSV" icon="pi pi-upload" [outlined]="true" (onClick)="openImport()" />
            <p-button label="Add staff" icon="pi pi-user-plus" (onClick)="openCreate()" />
          }
        </div>
      </div>

      <div class="oms-surface-card">
        <p-table [value]="rows()" [loading]="loading()" [paginator]="true" [lazy]="true"
          [rows]="pageSize()" [rowsPerPageOptions]="[10, 20, 50]" [totalRecords]="totalRecords()"
          [first]="page() * pageSize()" (onLazyLoad)="onLazyLoad($event)"
          [sortField]="sortField()" [sortOrder]="sortDirection() === 'asc' ? 1 : -1"
          dataKey="id" [showCurrentPageReport]="true"
          currentPageReportTemplate="Showing {first}–{last} of {totalRecords}" styleClass="p-datatable-sm">
          <ng-template #caption>
            <div class="staff-toolbar">
              <span class="staff-search"><i class="pi pi-search"></i>
                <input pInputText type="search" placeholder="Search staff, contact, department, position, or manager…"
                  [ngModel]="search()" (ngModelChange)="applySearch($event)"
                  [ngModelOptions]="{ standalone: true }" />
              </span>
              <p-select [ngModel]="companyFilter()" (ngModelChange)="applyCompanyFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="companyFilterOptions()"
                optionLabel="label" optionValue="value" placeholder="All companies" styleClass="staff-filter" />
              <p-select [ngModel]="departmentFilter()" (ngModelChange)="applyDepartmentFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="departmentFilterOptions()"
                optionLabel="label" optionValue="value" placeholder="All departments" styleClass="staff-filter" />
              <p-select [ngModel]="positionFilter()" (ngModelChange)="applyPositionFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="positionFilterOptions()"
                optionLabel="label" optionValue="value" placeholder="All positions" styleClass="staff-filter" />
              <p-select [ngModel]="statusFilter()" (ngModelChange)="applyStatusFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="statusFilterOptions"
                optionLabel="label" optionValue="value" placeholder="All statuses" styleClass="staff-filter" />
              <p-select [ngModel]="managerFilter()" (ngModelChange)="applyManagerFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="managerFilterOptions()"
                optionLabel="label" optionValue="value" placeholder="All managers" [filter]="true" styleClass="staff-filter" />
              <p-select [ngModel]="employmentTypeFilter()" (ngModelChange)="applyEmploymentTypeFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="employmentTypeFilterOptions"
                optionLabel="label" optionValue="value" placeholder="All employment types" styleClass="staff-filter" />
              <label class="date-filter">Joined from
                <input pInputText type="date" [ngModel]="joinedFrom()" (ngModelChange)="applyJoinedFrom($event)"
                  [ngModelOptions]="{ standalone: true }" />
              </label>
              <label class="date-filter">Joined to
                <input pInputText type="date" [ngModel]="joinedTo()" (ngModelChange)="applyJoinedTo($event)"
                  [ngModelOptions]="{ standalone: true }" />
              </label>
              <button type="button" class="clear-filters" (click)="clearFilters()" [disabled]="!hasFilters()">
                <i class="pi pi-filter-slash"></i> Clear
              </button>
              <label class="archived-toggle">
                <p-toggleswitch [ngModel]="showArchived()" (ngModelChange)="toggleArchived($event)"
                  [ngModelOptions]="{ standalone: true }" />
                Archived
              </label>
            </div>
          </ng-template>

          <ng-template #header>
            <tr>
              <th pSortableColumn="name">Employee <p-sortIcon field="name" /></th>
              <th>Contact</th>
              <th>Company</th>
              <th>Department</th>
              <th pSortableColumn="title">Position <p-sortIcon field="title" /></th>
              <th>Manager</th>
              <th pSortableColumn="status">Status <p-sortIcon field="status" /></th>
              <th class="actions-column">Actions</th>
            </tr>
          </ng-template>

          <ng-template #body let-member>
            <tr [class.archived-row]="member.isDeleted">
              <td>
                <div class="employee-cell">
                  <p-avatar [label]="initials(member.name)" shape="circle" styleClass="employee-avatar" />
                  <div>
                    <button type="button" class="employee-name" (click)="openDetails(member)">{{ member.name }}</button>
                    <div class="muted employee-code">{{ member.employeeCode || 'No employee code' }}</div>
                  </div>
                </div>
              </td>
              <td>
                <div>{{ member.email || '—' }}</div>
                <div class="muted contact-phone">{{ member.cellNumber || member.landline || 'No phone' }}</div>
              </td>
              <td>{{ member.companyName || org.companyName(member.companyId) }}</td>
              <td>{{ member.departmentName || org.departmentName(member.deptId) }}</td>
              <td>{{ member.positionTitle || member.title || '—' }}</td>
              <td>{{ member.managerName || org.staffName(member.managerId) }}</td>
              <td>
                @if (member.isDeleted) {
                  <p-tag value="Archived" severity="secondary" />
                } @else {
                  <p-tag [value]="member.status === 'ACTIVE' ? 'Active' : 'Inactive'"
                    [severity]="member.status === 'ACTIVE' ? 'success' : 'warn'" />
                }
              </td>
              <td>
                <div class="row-actions">
                  <button type="button" class="icon-action" pTooltip="View details" (click)="openDetails(member)"><i class="pi pi-eye"></i></button>
                  @if (!member.isDeleted && canManage()) {
                    <button type="button" class="icon-action" pTooltip="Edit" (click)="openEdit(member)"><i class="pi pi-pencil"></i></button>
                    <button type="button" class="icon-action" pTooltip="Transfer or promote" (click)="startLifecycle(member, 'MOVER')"><i class="pi pi-arrow-right-arrow-left"></i></button>
                    <button type="button" class="icon-action danger" pTooltip="Start employee exit" (click)="startLifecycle(member, 'LEAVER')"><i class="pi pi-sign-out"></i></button>
                    <button type="button" class="icon-action danger" pTooltip="Archive" (click)="confirmArchive(member)"><i class="pi pi-user-minus"></i></button>
                  } @else if (member.isDeleted && canManage()) {
                    <button type="button" class="icon-action" pTooltip="Restore" (click)="restore(member)"><i class="pi pi-refresh"></i></button>
                  }
                </div>
              </td>
            </tr>
          </ng-template>

          <ng-template #emptymessage>
            <tr><td colspan="8">
              @if (loadError()) {
                <div class="empty-state error-state"><i class="pi pi-exclamation-triangle"></i><p>Staff could not be loaded</p>
                  <span>{{ loadError() }}</span>
                  <p-button label="Try again" icon="pi pi-refresh" [outlined]="true" (onClick)="refresh()" />
                </div>
              } @else {
                <div class="empty-state"><i class="pi pi-users"></i><p>No staff found</p>
                  <span>{{ hasFilters() ? 'No staff match the selected filters.' : 'Add the first staff member to get started.' }}</span></div>
              }
            </td></tr>
          </ng-template>
        </p-table>
      </div>

      <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '48rem', maxWidth: '96vw' }"
        [header]="editingId() ? 'Edit staff member' : 'Add staff member'" [draggable]="false">
        <form [formGroup]="form" class="staff-form">
          <div class="form-section-title">Employee information</div>
          <div class="form-grid">
            <div class="field span-2">
              <label>Full name *</label>
              <input pInputText formControlName="name" class="w-full" placeholder="e.g. John Doe" />
              @if (invalid('name')) { <small class="error-text">Name is required and must be at most 200 characters.</small> }
            </div>
            <div class="field">
              <label>Employee code</label>
              <input pInputText formControlName="employeeCode" class="w-full" placeholder="EMP001" />
              @if (invalid('employeeCode')) { <small class="error-text">Use letters, numbers, hyphens, or underscores only.</small> }
            </div>
            <div class="field">
              <label>Employment type</label>
              <p-select formControlName="empType" [options]="employmentTypeOptions" optionLabel="label" optionValue="value"
                styleClass="w-full" appendTo="body" />
            </div>
            <div class="field">
              <label>Email</label>
              <input pInputText type="email" formControlName="email" class="w-full" placeholder="name@company.com" />
              @if (invalid('email')) { <small class="error-text">Enter a valid email address.</small> }
            </div>
            <div class="field">
              <label>Mobile</label>
              <input pInputText formControlName="cellNumber" class="w-full" placeholder="+91 98765 43210" />
              @if (invalid('cellNumber')) { <small class="error-text">Enter a valid phone number.</small> }
            </div>
            <div class="field">
              <label>Landline / extension</label>
              <input pInputText formControlName="landline" class="w-full" placeholder="+91 11 2345 6789" />
              @if (invalid('landline')) { <small class="error-text">Enter a valid phone number.</small> }
            </div>
            <div class="field">
              <label>Status</label>
              <p-select formControlName="status" [options]="statusOptions" optionLabel="label" optionValue="value"
                styleClass="w-full" appendTo="body" />
            </div>
            <div class="field span-2">
              <label>Profile photo URL</label>
              <input pInputText type="url" formControlName="photoUrl" class="w-full" placeholder="https://example.com/photo.jpg" />
              @if (invalid('photoUrl')) { <small class="error-text">Photo URL must be at most 500 characters.</small> }
            </div>
          </div>

          <div class="form-section-title">Organisation</div>
          <div class="form-grid">
            <div class="field">
              <label>Company *</label>
              <p-select formControlName="companyId" [options]="companyOptions()" optionLabel="label" optionValue="value"
                placeholder="Select company" styleClass="w-full" appendTo="body" />
              @if (invalid('companyId')) { <small class="error-text">Company is required.</small> }
            </div>
            <div class="field">
              <label>Department</label>
              <p-select formControlName="deptId" [options]="departmentOptions()" optionLabel="label" optionValue="value"
                placeholder="Select department" [showClear]="true" styleClass="w-full" appendTo="body" />
            </div>
            <div class="field">
              <label>Position</label>
              <p-select formControlName="positionId" [options]="positionOptions()" optionLabel="label" optionValue="value"
                placeholder="Select an available position" [showClear]="true" styleClass="w-full" appendTo="body" />
              <small class="field-help">Only vacant positions in the selected company and department are shown.</small>
            </div>
            <div class="field">
              <label>Job title</label>
              <input pInputText formControlName="title" class="w-full" placeholder="e.g. Senior Developer" />
            </div>
            <div class="field span-2">
              <label>Reports to (manager)</label>
              <p-select formControlName="managerId" [options]="managerOptions()" optionLabel="label" optionValue="value"
                placeholder="No manager" [showClear]="true" [filter]="true" styleClass="w-full" appendTo="body" />
            </div>
          </div>

          <div class="form-section-title">Employment dates</div>
          <div class="form-grid">
            <div class="field">
              <label>Date joined</label>
              <input pInputText type="date" formControlName="dateJoined" class="w-full" />
            </div>
            <div class="field">
              <label>Date left</label>
              <input pInputText type="date" formControlName="dateLeft" class="w-full" />
              @if (form.hasError('invalidEmploymentDates')) { <small class="error-text">Date left cannot be before date joined.</small> }
            </div>
          </div>
        </form>
        <ng-template #footer>
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
          <p-button [label]="editingId() ? 'Save changes' : 'Create staff'" icon="pi pi-check"
            [loading]="saving()" [disabled]="saving()" (onClick)="save()" />
        </ng-template>
      </p-dialog>

      <p-dialog [visible]="detailsVisible()" (visibleChange)="detailsVisible.set($event)" [modal]="true"
        [style]="{ width: '38rem', maxWidth: '96vw' }" header="Staff details" [draggable]="false">
        @if (selectedDetails(); as member) {
          <div class="profile-header">
            <p-avatar [image]="member.photoUrl || undefined" [label]="member.photoUrl ? undefined : initials(member.name)"
              shape="circle" styleClass="profile-avatar" />
            <div><h2>{{ member.name }}</h2><p>{{ member.employeeCode || 'No employee code' }}</p></div>
            <p-tag [value]="member.isDeleted ? 'Archived' : member.status === 'ACTIVE' ? 'Active' : 'Inactive'"
              [severity]="member.isDeleted ? 'secondary' : member.status === 'ACTIVE' ? 'success' : 'warn'" />
          </div>
          <div class="details-grid">
            <div><span>Email</span><strong>{{ member.email || 'Not provided' }}</strong></div>
            <div><span>Phone</span><strong>{{ member.cellNumber || member.landline || 'Not provided' }}</strong></div>
            <div><span>Company</span><strong>{{ member.companyName || org.companyName(member.companyId) }}</strong></div>
            <div><span>Department</span><strong>{{ member.departmentName || org.departmentName(member.deptId) }}</strong></div>
            <div><span>Position</span><strong>{{ member.positionTitle || member.title || 'Unassigned' }}</strong></div>
            <div><span>Manager</span><strong>{{ member.managerName || org.staffName(member.managerId) }}</strong></div>
            <div><span>Employment type</span><strong>{{ employmentTypeLabel(member.empType) }}</strong></div>
            <div><span>Date joined</span><strong>{{ member.dateJoined || 'Not provided' }}</strong></div>
          </div>
          <div class="org-path" aria-label="Organizational reporting path">
            <span>{{ member.companyName || org.companyName(member.companyId) }}</span><i class="pi pi-arrow-right"></i>
            <span>{{ member.departmentName || org.departmentName(member.deptId) }}</span><i class="pi pi-arrow-right"></i>
            <span>{{ member.positionTitle || member.title || 'Unassigned position' }}</span><i class="pi pi-arrow-right"></i>
            <span>{{ member.managerName || org.staffName(member.managerId) }}</span><i class="pi pi-arrow-right"></i>
            <strong>{{ member.name }}</strong>
          </div>
        } @else if (detailsLoading()) {
          <div class="empty-state"><i class="pi pi-spin pi-spinner"></i><p>Loading staff details…</p></div>
        }
      </p-dialog>

      <p-dialog [(visible)]="importVisible" [modal]="true" [style]="{ width: '40rem', maxWidth: '96vw' }"
        header="Import staff from CSV" [draggable]="false">
        <div class="staff-form">
          <div class="field">
            <label>Target company *</label>
            <p-select [(ngModel)]="importCompanyId" [options]="companyOptions()" optionLabel="label" optionValue="value"
              placeholder="Select company" styleClass="w-full" appendTo="body" />
          </div>
          <div class="field">
            <label>CSV file</label>
            <input type="file" accept=".csv,text/csv" (change)="onCsvFile($event)" />
            <small class="field-help">Columns: name, title, email, cellNumber, employeeCode, empType, dateJoined.</small>
          </div>
          <div class="field">
            <label>Or paste CSV</label>
            <textarea [(ngModel)]="importText" rows="7" class="csv-textarea"
              placeholder="name,title,email,cellNumber,employeeCode,empType,dateJoined"></textarea>
          </div>
          @if (importPreview().length) {
            <div class="import-ready"><i class="pi pi-check-circle"></i>{{ importPreview().length }} valid row(s) ready.</div>
          }
        </div>
        <ng-template #footer>
          <p-button label="Parse" icon="pi pi-search" [outlined]="true" (onClick)="parseImport()" />
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="importVisible = false" />
          <p-button [label]="'Import ' + importPreview().length" icon="pi pi-upload" [loading]="importing()"
            [disabled]="!importPreview().length || importCompanyId == null || importing()" (onClick)="runImport()" />
        </ng-template>
      </p-dialog>
    </div>
  `,
  styles: [`
    .header-actions { display:flex; gap:.6rem; flex-wrap:wrap; }
    .staff-toolbar { display:flex; align-items:center; gap:.65rem; flex-wrap:wrap; margin-bottom:1rem; }
    .staff-search { position:relative; display:inline-flex; align-items:center; flex:1 1 18rem; }
    .staff-search i { position:absolute; left:.75rem; color:var(--p-text-muted-color); z-index:1; }
    .staff-search input { width:100%; padding-left:2.25rem; }
    :host ::ng-deep .staff-filter { min-width:10.5rem; }
    .clear-filters { border:0; background:transparent; color:var(--p-primary-color); cursor:pointer; padding:.55rem .4rem; }
    .clear-filters:disabled { opacity:.4; cursor:default; }
    .archived-toggle { display:inline-flex; align-items:center; gap:.45rem; color:var(--p-text-muted-color); font-size:.86rem; }
    .date-filter { display:flex; align-items:center; gap:.35rem; color:var(--p-text-muted-color); font-size:.78rem; }
    .date-filter input { width:9.2rem; }
    .employee-cell { display:flex; align-items:center; gap:.7rem; min-width:12rem; }
    :host ::ng-deep .employee-avatar { background:color-mix(in srgb, var(--p-primary-color) 16%, transparent); color:var(--p-primary-color); font-weight:700; }
    .employee-name { border:0; background:transparent; padding:0; color:var(--p-text-color); font:inherit; font-weight:650; cursor:pointer; text-align:left; }
    .employee-name:hover { color:var(--p-primary-color); }
    .employee-code, .contact-phone { font-size:.76rem; margin-top:.18rem; }
    .muted { color:var(--p-text-muted-color); }
    .actions-column { width:8.5rem; }
    .row-actions { display:flex; gap:.25rem; }
    .icon-action { width:2rem; height:2rem; border-radius:7px; border:1px solid var(--p-content-border-color); background:transparent; color:var(--p-text-color); cursor:pointer; display:grid; place-items:center; }
    .icon-action:hover { color:var(--p-primary-color); border-color:var(--p-primary-color); background:color-mix(in srgb, var(--p-primary-color) 10%, transparent); }
    .icon-action.danger:hover { color:#ef4444; border-color:#ef4444; background:rgba(239,68,68,.1); }
    .archived-row { opacity:.58; }
    .empty-state { text-align:center; padding:3.2rem 1rem; color:var(--p-text-muted-color); }
    .empty-state i { font-size:2.5rem; opacity:.5; }
    .empty-state p { margin:.6rem 0 .2rem; color:var(--p-text-color); font-weight:650; }
    .empty-state span { font-size:.84rem; }
    .error-state i, .error-state p { color:var(--p-red-500); }
    .staff-form { display:flex; flex-direction:column; gap:1rem; padding-top:.25rem; }
    .form-section-title { margin-top:.35rem; padding-bottom:.45rem; border-bottom:1px solid var(--p-content-border-color); color:var(--p-primary-color); font-size:.78rem; font-weight:750; text-transform:uppercase; letter-spacing:.06em; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
    .span-2 { grid-column:span 2; }
    .field { display:flex; flex-direction:column; gap:.35rem; }
    .field label { font-size:.84rem; font-weight:650; }
    .field-help { color:var(--p-text-muted-color); font-size:.72rem; }
    .error-text { color:#ef4444; font-size:.74rem; }
    .profile-header { display:flex; align-items:center; gap:1rem; padding:.25rem 0 1.15rem; border-bottom:1px solid var(--p-content-border-color); }
    :host ::ng-deep .profile-avatar { width:3.5rem; height:3.5rem; font-size:1.2rem; background:var(--p-primary-color); color:var(--p-primary-contrast-color); }
    .profile-header h2 { margin:0; font-size:1.2rem; }
    .profile-header p { margin:.2rem 0 0; color:var(--p-text-muted-color); font-size:.82rem; }
    .profile-header p-tag { margin-left:auto; }
    .details-grid { display:grid; grid-template-columns:1fr 1fr; gap:1.15rem; padding-top:1.15rem; }
    .details-grid div { display:flex; flex-direction:column; gap:.25rem; min-width:0; }
    .details-grid span { color:var(--p-text-muted-color); font-size:.74rem; text-transform:uppercase; letter-spacing:.04em; }
    .details-grid strong { font-size:.9rem; overflow-wrap:anywhere; }
    .org-path { margin-top:1.2rem; padding:1rem; border-radius:10px; background:var(--p-content-hover-background); display:flex; align-items:center; flex-wrap:wrap; gap:.45rem; font-size:.78rem; }
    .org-path i { color:var(--p-text-muted-color); font-size:.7rem; }
    .csv-textarea { width:100%; resize:vertical; font-family:ui-monospace, monospace; font-size:.78rem; padding:.65rem; border:1px solid var(--p-content-border-color); border-radius:6px; background:var(--p-content-background); color:var(--p-text-color); }
    .import-ready { display:flex; align-items:center; gap:.45rem; color:#22c55e; font-size:.86rem; }
    @media (max-width:760px) {
      .form-grid, .details-grid { grid-template-columns:1fr; }
      .span-2 { grid-column:span 1; }
      :host ::ng-deep .staff-filter { flex:1 1 10rem; }
    }
  `],
})
export class StaffList {
  /** Bound from the `q` route query parameter by withComponentInputBinding. */
  readonly q = input('');
  private lastRouteQuery = '';
  readonly org = inject(OrgDataService);
  private readonly auth = inject(AuthService);
  private readonly staffApi = inject(StaffService);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);
  private readonly searchChanges = new Subject<string>();

  readonly rows = signal<Staff[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly importing = signal(false);
  readonly totalRecords = signal(0);
  readonly page = signal(0);
  readonly pageSize = signal(20);
  readonly sortField = signal<StaffSortField>('name');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');
  readonly search = signal('');
  readonly companyFilter = signal<number | null>(null);
  readonly departmentFilter = signal<number | null>(null);
  readonly positionFilter = signal<number | null>(null);
  readonly managerFilter = signal<number | null>(null);
  readonly statusFilter = signal<EntityStatus | null>(null);
  readonly employmentTypeFilter = signal<EmploymentType | null>(null);
  readonly joinedFrom = signal<string | null>(null);
  readonly joinedTo = signal<string | null>(null);
  readonly showArchived = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly selectedDetails = signal<Staff | null>(null);
  readonly detailsLoading = signal(false);
  readonly detailsVisible = signal(false);
  readonly canManage = this.auth.canEditOrgData;

  startLifecycle(member: Staff, type: 'MOVER' | 'LEAVER'): void {
    this.router.navigate(['/lifecycle'], { queryParams: { type, staffId: member.id } });
  }
  private readonly selectedCompany = signal<number | null>(null);
  private readonly selectedDepartment = signal<number | null>(null);

  dialogVisible = false;
  importVisible = false;
  importCompanyId: number | null = null;
  importText = '';
  readonly importPreview = signal<StaffCreateRequest[]>([]);

  readonly companyOptions = computed<Option[]>(() => {
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
  readonly departmentFilterOptions = computed(() => [
    { label: 'All departments', value: null as number | null },
    ...this.org.departmentOptions(this.companyFilter()),
  ]);
  readonly positionFilterOptions = computed(() => [
    { label: 'All positions', value: null as number | null },
    ...this.org.positions.snapshot()
      .filter((position) => this.companyFilter() == null || position.companyId === this.companyFilter())
      .filter((position) => this.departmentFilter() == null || position.deptId === this.departmentFilter())
      .map((position) => ({ label: position.title, value: position.id })),
  ]);
  readonly managerFilterOptions = computed(() => [
    { label: 'All managers', value: null as number | null },
    ...this.org.staff.snapshot()
      .filter((member) => this.companyFilter() == null || member.companyId === this.companyFilter())
      .filter((member) => member.status === EntityStatus.ACTIVE)
      .map((member) => ({ label: `${member.name}${member.employeeCode ? ' · ' + member.employeeCode : ''}`, value: member.id })),
  ]);
  readonly departmentOptions = computed<Option[]>(() => this.org.departmentOptions(this.selectedCompany()));
  readonly positionOptions = computed<Option[]>(() => this.org.positions.snapshot()
    .filter((position) => position.companyId === this.selectedCompany())
    .filter((position) => this.selectedDepartment() == null || position.deptId === this.selectedDepartment())
    .filter((position) => position.isVacant || position.staffId === this.editingId())
    .map((position) => ({ label: position.title, value: position.id })));
  readonly managerOptions = computed<Option[]>(() => this.org.staff.snapshot()
    .filter((member) => member.companyId === this.selectedCompany())
    .filter((member) => member.id !== this.editingId() && member.status === EntityStatus.ACTIVE)
    .map((member) => ({ label: `${member.name}${member.title ? ' · ' + member.title : ''}`, value: member.id })));

  readonly statusOptions = [
    { label: 'Active', value: EntityStatus.ACTIVE },
    { label: 'Inactive', value: EntityStatus.INACTIVE },
  ];
  readonly statusFilterOptions = [{ label: 'All statuses', value: null as EntityStatus | null }, ...this.statusOptions];
  readonly employmentTypeOptions = [
    { label: 'Permanent', value: EmploymentType.PERMANENT },
    { label: 'Contract', value: EmploymentType.CONTRACT },
    { label: 'Intern', value: EmploymentType.INTERN },
  ];
  readonly employmentTypeFilterOptions = [
    { label: 'All employment types', value: null as EmploymentType | null },
    ...this.employmentTypeOptions,
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    employeeCode: ['', [Validators.maxLength(100), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)]],
    companyId: [null as number | null, Validators.required],
    deptId: [null as number | null],
    positionId: [null as number | null],
    managerId: [null as number | null],
    title: ['', Validators.maxLength(200)],
    empType: [EmploymentType.PERMANENT],
    email: ['', [Validators.email, Validators.maxLength(200)]],
    cellNumber: ['', Validators.pattern(/^[0-9+(). -]{3,50}$/)],
    landline: ['', Validators.pattern(/^[0-9+(). -]{3,50}$/)],
    photoUrl: ['', Validators.maxLength(500)],
    status: [EntityStatus.ACTIVE],
    dateJoined: [''],
    dateLeft: [''],
  }, { validators: dateRangeValidator });

  constructor() {
    this.searchChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(() => this.resetAndLoad());

    effect(() => {
      const routeQuery = this.q().trim();
      if (routeQuery === this.lastRouteQuery) return;
      this.lastRouteQuery = routeQuery;
      this.applySearch(routeQuery);
    });

    this.form.get('companyId')!.valueChanges.pipe(takeUntilDestroyed()).subscribe((companyId) => {
      this.selectedCompany.set(companyId);
      const departmentId = this.form.get('deptId')!.value;
      if (departmentId != null && !this.org.departments.snapshot().some((d) => d.id === departmentId && d.companyId === companyId)) {
        this.form.patchValue({ deptId: null, positionId: null }, { emitEvent: false });
        this.selectedDepartment.set(null);
      }
      const managerId = this.form.get('managerId')!.value;
      if (managerId != null && !this.org.staff.snapshot().some((s) => s.id === managerId && s.companyId === companyId)) {
        this.form.patchValue({ managerId: null }, { emitEvent: false });
      }
      const positionId = this.form.get('positionId')!.value;
      if (positionId != null && !this.org.positions.snapshot().some((p) => p.id === positionId && p.companyId === companyId)) {
        this.form.patchValue({ positionId: null }, { emitEvent: false });
      }
    });

    this.form.get('deptId')!.valueChanges.pipe(takeUntilDestroyed()).subscribe((departmentId) => {
      this.selectedDepartment.set(departmentId);
      const positionId = this.form.get('positionId')!.value;
      if (positionId != null && !this.org.positions.snapshot().some((p) => p.id === positionId && (departmentId == null || p.deptId === departmentId))) {
        this.form.patchValue({ positionId: null }, { emitEvent: false });
      }
    });

    this.form.get('positionId')!.valueChanges.pipe(takeUntilDestroyed()).subscribe((positionId) => {
      const position = this.org.positions.snapshot(true).find((item) => item.id === positionId);
      if (position) this.form.patchValue({ title: position.title }, { emitEvent: false });
    });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.pageSize();
    this.pageSize.set(rows);
    this.page.set(Math.floor((event.first ?? 0) / rows));
    const field = typeof event.sortField === 'string' ? event.sortField : 'name';
    const allowed: StaffSortField[] = ['name', 'employeeCode', 'title', 'dateJoined', 'status', 'createdAt', 'updatedAt'];
    this.sortField.set(allowed.includes(field as StaffSortField) ? field as StaffSortField : 'name');
    this.sortDirection.set(event.sortOrder === -1 ? 'desc' : 'asc');
    this.load();
  }

  applySearch(value: string): void {
    this.search.set(value);
    this.searchChanges.next(value.trim());
  }

  applyCompanyFilter(value: number | null): void {
    this.companyFilter.set(value);
    if (this.departmentFilter() != null && !this.org.departments.snapshot().some((d) => d.id === this.departmentFilter() && (value == null || d.companyId === value))) {
      this.departmentFilter.set(null);
    }
    this.positionFilter.set(null);
    if (this.managerFilter() != null && !this.org.staff.snapshot().some((member) =>
      member.id === this.managerFilter() && (value == null || member.companyId === value))) {
      this.managerFilter.set(null);
    }
    this.resetAndLoad();
  }

  applyDepartmentFilter(value: number | null): void {
    this.departmentFilter.set(value);
    this.positionFilter.set(null);
    this.resetAndLoad();
  }

  applyPositionFilter(value: number | null): void {
    this.positionFilter.set(value);
    this.resetAndLoad();
  }

  applyStatusFilter(value: EntityStatus | null): void {
    this.statusFilter.set(value);
    this.resetAndLoad();
  }

  applyManagerFilter(value: number | null): void {
    this.managerFilter.set(value);
    this.resetAndLoad();
  }

  applyEmploymentTypeFilter(value: EmploymentType | null): void {
    this.employmentTypeFilter.set(value);
    this.resetAndLoad();
  }

  applyJoinedFrom(value: string | null): void {
    this.joinedFrom.set(value || null);
    this.resetAndLoad();
  }

  applyJoinedTo(value: string | null): void {
    this.joinedTo.set(value || null);
    this.resetAndLoad();
  }

  refresh(): void {
    this.load();
  }

  toggleArchived(value: boolean): void {
    this.showArchived.set(value);
    this.resetAndLoad();
  }

  clearFilters(): void {
    this.search.set('');
    this.companyFilter.set(null);
    this.departmentFilter.set(null);
    this.positionFilter.set(null);
    this.managerFilter.set(null);
    this.statusFilter.set(null);
    this.employmentTypeFilter.set(null);
    this.joinedFrom.set(null);
    this.joinedTo.set(null);
    this.page.set(0);
    this.load();
  }

  readonly hasFilters = computed(() => !!(
    this.search().trim() || this.companyFilter() != null || this.departmentFilter() != null ||
    this.positionFilter() != null || this.managerFilter() != null || this.statusFilter() != null ||
    this.employmentTypeFilter() != null || this.joinedFrom() != null || this.joinedTo() != null
  ));

  openCreate(): void {
    this.editingId.set(null);
    const defaultCompany = this.auth.isSuperAdmin() ? null : this.auth.currentUser()?.companyId ?? null;
    this.selectedCompany.set(defaultCompany);
    this.selectedDepartment.set(null);
    this.form.reset({
      name: '', employeeCode: '', companyId: defaultCompany, deptId: null, positionId: null,
      managerId: null, title: '', empType: EmploymentType.PERMANENT, email: '', cellNumber: '',
      landline: '', photoUrl: '', status: EntityStatus.ACTIVE, dateJoined: '', dateLeft: '',
    });
    this.dialogVisible = true;
  }

  openEdit(member: Staff): void {
    this.editingId.set(member.id);
    this.selectedCompany.set(member.companyId);
    this.selectedDepartment.set(member.deptId ?? null);
    this.form.reset({
      name: member.name,
      employeeCode: member.employeeCode ?? '',
      companyId: member.companyId,
      deptId: member.deptId ?? null,
      positionId: member.positionId ?? null,
      managerId: member.managerId ?? null,
      title: member.title ?? member.positionTitle ?? '',
      empType: member.empType ?? EmploymentType.PERMANENT,
      email: member.email ?? '',
      cellNumber: member.cellNumber ?? '',
      landline: member.landline ?? '',
      photoUrl: member.photoUrl ?? '',
      status: member.status,
      dateJoined: member.dateJoined ?? '',
      dateLeft: member.dateLeft ?? '',
    });
    this.dialogVisible = true;
  }

  openDetails(member: Staff): void {
    this.selectedDetails.set(null);
    this.detailsLoading.set(true);
    this.detailsVisible.set(true);
    this.staffApi.get(member.id).pipe(finalize(() => this.detailsLoading.set(false))).subscribe({
      next: (details) => this.selectedDetails.set(details),
      error: () => this.messages.add({ severity: 'error', summary: 'Could not load staff details', detail: 'Please try again.' }),
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.reportFirstInvalid();
      return;
    }
    const id = this.editingId();
    const existing = id == null ? null : this.rows().find((member) => member.id === id) ?? null;
    const nextManagerId = this.form.get('managerId')!.value;
    if (existing && existing.managerId !== nextManagerId) {
      const manager = this.org.staff.snapshot(true).find((member) => member.id === nextManagerId);
      this.confirm.confirm({
        header: 'Change reporting manager',
        message: `Change ${existing.name}'s reporting manager to ${manager?.name ?? 'no manager'}?`,
        icon: 'pi pi-sitemap',
        acceptLabel: 'Confirm change',
        rejectLabel: 'Cancel',
        accept: () => this.persist(existing),
      });
      return;
    }
    this.persist(existing);
  }

  confirmArchive(member: Staff): void {
    this.confirm.confirm({
      header: 'Archive staff member',
      message: `Archive “${member.name}”? Their position will become vacant and they will be removed from the active organogram.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Archive',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.staffApi.archive(member.id).subscribe({
        next: () => {
          this.afterMutation();
          this.messages.add({ severity: 'info', summary: 'Staff archived', detail: member.name });
        },
        error: () => undefined,
      }),
    });
  }

  restore(member: Staff): void {
    this.staffApi.restore(member.id).subscribe({
      next: () => {
        this.afterMutation();
        this.messages.add({ severity: 'success', summary: 'Staff restored', detail: member.name });
      },
      error: () => undefined,
    });
  }

  invalid(control: string): boolean {
    const field = this.form.get(control);
    return !!field && field.invalid && (field.touched || field.dirty);
  }

  /** Human-readable labels for the form controls, used in validation feedback. */
  private static readonly FIELD_LABELS: Record<string, string> = {
    name: 'Full name', employeeCode: 'Employee code', companyId: 'Company', deptId: 'Department',
    positionId: 'Position', managerId: 'Manager', title: 'Job title', email: 'Email',
    cellNumber: 'Mobile', landline: 'Landline', photoUrl: 'Photo URL',
  };

  /**
   * Surfaces validation failures that would otherwise be silent when the invalid
   * control is scrolled out of view (e.g. the required Company field). Shows a
   * toast naming the field and scrolls it into view.
   */
  private reportFirstInvalid(): void {
    const firstInvalid = Object.keys(this.form.controls).find((key) => this.form.get(key)?.invalid);
    const label = (firstInvalid && StaffList.FIELD_LABELS[firstInvalid]) || 'a required field';
    this.messages.add({
      severity: 'warn',
      summary: 'Missing required details',
      detail: `Please complete “${label}” before creating the staff member.`,
    });
    queueMicrotask(() => {
      const dialog = document.querySelector('.staff-form');
      const target = dialog?.querySelector('.error-text') ?? dialog?.querySelector('.ng-invalid');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  initials(name: string): string {
    const clean = name.replace(/^(dr\.|dr|mr\.|mr|mrs\.|mrs|ms\.|ms|prof\.|prof|eng\.|eng|sir|rev\.|rev)\s+/i, '').trim();
    return clean.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  employmentTypeLabel(type: EmploymentType): string {
    return type.charAt(0) + type.slice(1).toLowerCase();
  }

  openImport(): void {
    this.importCompanyId = this.auth.isSuperAdmin()
      ? this.companyFilter() ?? this.companyOptions()[0]?.value ?? null
      : this.auth.currentUser()?.companyId ?? null;
    this.importText = '';
    this.importPreview.set([]);
    this.importVisible = true;
  }

  onCsvFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.importText = String(reader.result ?? '');
      this.parseImport();
    };
    reader.readAsText(file);
  }

  parseImport(): void {
    if (this.importCompanyId == null) {
      this.messages.add({ severity: 'warn', summary: 'Select a target company first' });
      return;
    }
    const lines = this.importText.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      this.importPreview.set([]);
      this.messages.add({ severity: 'warn', summary: 'Nothing to import', detail: 'Include a header and at least one data row.' });
      return;
    }
    const headers = this.parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
    const index = (name: string) => headers.indexOf(name.toLowerCase());
    const rows: StaffCreateRequest[] = [];
    for (const line of lines.slice(1)) {
      const cells = this.parseCsvLine(line).map((cell) => cell.trim());
      const read = (name: string) => index(name) >= 0 ? cells[index(name)] ?? '' : '';
      const name = read('name');
      if (!name) continue;
      const rawType = read('empType').toUpperCase();
      const empType = (Object.values(EmploymentType) as string[]).includes(rawType)
        ? rawType as EmploymentType : EmploymentType.PERMANENT;
      rows.push({
        companyId: this.importCompanyId,
        name,
        title: read('title') || null,
        email: read('email') || null,
        cellNumber: read('cellNumber') || null,
        employeeCode: read('employeeCode') || null,
        empType,
        dateJoined: read('dateJoined') || null,
        status: EntityStatus.ACTIVE,
      });
    }
    this.importPreview.set(rows);
  }

  runImport(): void {
    const rows = this.importPreview();
    if (!rows.length || this.importCompanyId == null) return;
    this.importing.set(true);
    from(rows).pipe(
      concatMap((row) => this.staffApi.create(row).pipe(map(() => true), catchError(() => of(false)))),
      toArray(),
      finalize(() => this.importing.set(false)),
    ).subscribe((results) => {
      const succeeded = results.filter(Boolean).length;
      const failed = results.length - succeeded;
      this.importVisible = false;
      this.afterMutation();
      this.messages.add({
        severity: failed ? 'warn' : 'success',
        summary: 'Import complete',
        detail: `${succeeded} imported${failed ? `, ${failed} failed` : ''}.`,
      });
    });
  }

  private persist(existing: Staff | null): void {
    this.saving.set(true);
    const value = this.form.getRawValue();
    const payload: StaffCreateRequest = {
      companyId: value.companyId!,
      deptId: value.deptId,
      managerId: value.managerId,
      positionId: value.positionId,
      employeeCode: value.employeeCode.trim() || null,
      name: value.name.trim(),
      title: value.title.trim() || null,
      empType: value.empType,
      email: value.email.trim() || null,
      cellNumber: value.cellNumber.trim() || null,
      landline: value.landline.trim() || null,
      photoUrl: value.photoUrl.trim() || null,
      status: value.status,
      dateJoined: value.dateJoined || null,
      dateLeft: value.dateLeft || null,
    };
    const operation = existing
      ? this.staffApi.update(existing.id, { ...payload, version: existing.version ?? 0 })
      : this.staffApi.create(payload);
    operation.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (saved) => {
        this.dialogVisible = false;
        this.afterMutation();
        this.messages.add({ severity: 'success', summary: existing ? 'Staff updated' : 'Staff created', detail: saved.name });
      },
      error: () => undefined,
    });
  }

  private afterMutation(): void {
    this.load();
    forkJoin([this.org.staff.init(), this.org.positions.init()]).subscribe({ error: () => undefined });
  }

  private resetAndLoad(): void {
    this.page.set(0);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.staffApi.list({
      page: this.page(),
      size: this.pageSize(),
      sort: this.sortField(),
      direction: this.sortDirection(),
      search: this.search(),
      companyId: this.companyFilter(),
      departmentId: this.departmentFilter(),
      positionId: this.positionFilter(),
      managerId: this.managerFilter(),
      status: this.statusFilter(),
      employmentType: this.employmentTypeFilter(),
      joinedFrom: this.joinedFrom(),
      joinedTo: this.joinedTo(),
      includeDeleted: this.showArchived(),
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (result) => {
        this.rows.set(result.content);
        this.totalRecords.set(result.totalElements);
      },
      error: () => {
        this.rows.set([]);
        this.totalRecords.set(0);
        this.loadError.set('Check your connection and try again.');
      },
    });
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (character === '"' && quoted && line[index + 1] === '"') {
        current += '"';
        index++;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === ',' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += character;
      }
    }
    values.push(current);
    return values;
  }
}
