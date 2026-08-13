import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { TableLazyLoadEvent } from 'primeng/types/table';
import { Subject, debounceTime, distinctUntilChanged, finalize, forkJoin } from 'rxjs';

import { Option, OrgDataService } from '../../core/data/org-data.service';
import { Position } from '../../core/models/organization.model';
import { AuthService } from '../../core/services/auth.service';
import {
  PositionCreateRequest, PositionService, PositionSortField, PositionStatus,
} from './position.service';

@Component({
  selector: 'app-position-list',
  imports: [
    ReactiveFormsModule, FormsModule, TableModule, ButtonModule, InputTextModule,
    DialogModule, SelectModule, TagModule, TooltipModule, ToggleSwitchModule,
  ],
  template: `
    <div class="oms-page">
      <div class="oms-page-header">
        <div>
          <h1 class="oms-page-title">Position Management</h1>
          <p class="oms-page-subtitle">Manage organizational roles, reporting hierarchy, staffing, and vacancies.</p>
        </div>
        <div class="header-actions">
          <p-button label="Refresh" icon="pi pi-refresh" [outlined]="true" [loading]="loading()" (onClick)="refresh()" />
          @if (canManage()) { <p-button label="New position" icon="pi pi-plus" (onClick)="openCreate()" /> }
        </div>
      </div>

      <div class="summary-row" aria-live="polite">
        <span><strong>{{ totalRecords() }}</strong> total positions</span>
        <span><i class="pi pi-circle-fill" style="color:#f59e0b;font-size:.45rem"></i> Open positions are current vacancies</span>
      </div>

      <div class="oms-surface-card">
        <p-table [value]="rows()" [loading]="loading()" [lazy]="true" [paginator]="true"
          [rows]="pageSize()" [rowsPerPageOptions]="[10, 20, 50]" [totalRecords]="totalRecords()"
          [first]="page() * pageSize()" (onLazyLoad)="onLazyLoad($event)"
          [sortField]="sortField()" [sortOrder]="sortDirection() === 'asc' ? 1 : -1"
          dataKey="id" [showCurrentPageReport]="true"
          currentPageReportTemplate="Showing {first}–{last} of {totalRecords}" styleClass="p-datatable-sm">
          <ng-template #caption>
            <div class="position-toolbar">
              <span class="position-search"><i class="pi pi-search"></i>
                <input pInputText type="search" placeholder="Search title, ID, company, department, parent, or staff…"
                  [ngModel]="search()" (ngModelChange)="applySearch($event)" [ngModelOptions]="{ standalone: true }" />
              </span>
              <p-select [ngModel]="companyFilter()" (ngModelChange)="applyCompanyFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="companyFilterOptions()" optionLabel="label" optionValue="value"
                placeholder="All companies" styleClass="position-filter" />
              <p-select [ngModel]="departmentFilter()" (ngModelChange)="applyDepartmentFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="departmentFilterOptions()" optionLabel="label" optionValue="value"
                placeholder="All departments" styleClass="position-filter" />
              <p-select [ngModel]="statusFilter()" (ngModelChange)="applyStatusFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="statusFilterOptions" optionLabel="label" optionValue="value"
                placeholder="All statuses" styleClass="position-filter" />
              <p-select [ngModel]="parentFilter()" (ngModelChange)="applyParentFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="parentFilterOptions()" optionLabel="label" optionValue="value"
                placeholder="All reporting positions" [filter]="true" styleClass="position-filter" />
              <p-select [ngModel]="assignedFilter()" (ngModelChange)="applyAssignedFilter($event)"
                [ngModelOptions]="{ standalone: true }" [options]="assignmentFilterOptions" optionLabel="label" optionValue="value"
                placeholder="Any staffing" styleClass="position-filter" />
              <button type="button" class="clear-filters" (click)="clearFilters()" [disabled]="!hasFilters()">
                <i class="pi pi-filter-slash"></i> Clear
              </button>
              <label class="archived-toggle"><p-toggleswitch [ngModel]="showArchived()"
                (ngModelChange)="toggleArchived($event)" [ngModelOptions]="{ standalone: true }" /> Archived</label>
            </div>
          </ng-template>

          <ng-template #header><tr>
            <th pSortableColumn="title">Position <p-sortIcon field="title" /></th>
            <th>Organization</th><th>Reports to</th><th>Assigned staff</th>
            <th pSortableColumn="status">Status <p-sortIcon field="status" /></th>
            <th pSortableColumn="updatedAt">Updated <p-sortIcon field="updatedAt" /></th>
            <th class="actions-column">Actions</th>
          </tr></ng-template>

          <ng-template #body let-position><tr [class.archived-row]="position.isDeleted">
            <td><button type="button" class="position-name" (click)="openDetails(position)">{{ position.title }}</button>
              <div class="muted">Position #{{ position.id }}</div></td>
            <td><strong>{{ position.companyName || org.companyName(position.companyId) }}</strong>
              <div class="muted">{{ position.departmentName || org.departmentName(position.deptId) }}</div></td>
            <td>{{ position.reportsToPositionTitle || positionTitle(position.reportsToPositionId) }}</td>
            <td>{{ position.staffName || org.staffName(position.staffId) }}</td>
            <td><p-tag [value]="position.isDeleted ? 'Archived' : statusLabel(position.status)"
              [severity]="position.isDeleted ? 'secondary' : statusSeverity(position.status)" /></td>
            <td>{{ formatDate(position.updatedAt) }}</td>
            <td><div class="row-actions">
              <button type="button" class="icon-action" pTooltip="View details" (click)="openDetails(position)"><i class="pi pi-eye"></i></button>
              @if (!position.isDeleted && canManage()) {
                <button type="button" class="icon-action" pTooltip="Edit" (click)="openEdit(position)"><i class="pi pi-pencil"></i></button>
                @if (position.status === 'OPEN') {
                  <button type="button" class="icon-action" pTooltip="Close position" (click)="confirmStatus(position, 'CLOSED')"><i class="pi pi-ban"></i></button>
                } @else if (position.status === 'CLOSED') {
                  <button type="button" class="icon-action" pTooltip="Reopen position" (click)="confirmStatus(position, 'OPEN')"><i class="pi pi-check-circle"></i></button>
                }
                <button type="button" class="icon-action danger" pTooltip="Archive" (click)="confirmArchive(position)"><i class="pi pi-archive"></i></button>
              } @else if (position.isDeleted && canManage()) {
                <button type="button" class="icon-action" pTooltip="Restore" (click)="restore(position)"><i class="pi pi-refresh"></i></button>
              }
            </div></td>
          </tr></ng-template>

          <ng-template #emptymessage><tr><td colspan="7">
            @if (loadError()) {
              <div class="empty-state error-state"><i class="pi pi-exclamation-triangle"></i><p>Unable to load positions</p>
                <span>{{ loadError() }}</span><p-button label="Try again" icon="pi pi-refresh" [outlined]="true" (onClick)="refresh()" /></div>
            } @else {
              <div class="empty-state"><i class="pi pi-id-card"></i><p>No positions found</p>
                <span>{{ hasFilters() ? 'No positions match your current filters.' : 'Define the first role in your organization.' }}</span></div>
            }
          </td></tr></ng-template>
        </p-table>
      </div>

      <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '46rem', maxWidth: '96vw' }"
        [header]="editingId() ? 'Edit position' : 'New position'" [draggable]="false">
        <form [formGroup]="form" class="position-form">
          <div class="section-title">Basic information</div>
          <div class="form-grid">
            <div class="field span-2"><label for="position-title">Position title *</label>
              <input id="position-title" pInputText formControlName="title" class="w-full" placeholder="e.g. Finance Manager" />
              @if (invalid('title')) { <small class="error-text">Title is required and must be at most 200 characters.</small> }</div>
            <div class="field"><label for="position-status">Status</label>
              <p-select inputId="position-status" formControlName="status" [options]="editableStatusOptions"
                optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" /></div>
          </div>

          <div class="section-title">Organization</div>
          <div class="form-grid">
            <div class="field"><label for="position-company">Company *</label>
              <p-select inputId="position-company" formControlName="companyId" [options]="companyOptions()" optionLabel="label"
                optionValue="value" placeholder="Select company" styleClass="w-full" appendTo="body" />
              @if (invalid('companyId')) { <small class="error-text">Company is required.</small> }</div>
            <div class="field"><label for="position-department">Department</label>
              <p-select inputId="position-department" formControlName="deptId" [options]="departmentOptions()" optionLabel="label"
                optionValue="value" placeholder="Unassigned" [showClear]="true" styleClass="w-full" appendTo="body" /></div>
          </div>

          <div class="section-title">Hierarchy and staffing</div>
          <div class="form-grid">
            <div class="field"><label for="position-parent">Reports to</label>
              <p-select inputId="position-parent" formControlName="reportsToPositionId" [options]="parentOptions()" optionLabel="label"
                optionValue="value" placeholder="Top-level position" [showClear]="true" [filter]="true" styleClass="w-full" appendTo="body" />
              <small class="field-help">Self-reporting and circular hierarchies are blocked by the server.</small></div>
            <div class="field"><label for="position-staff">Assigned staff</label>
              <p-select inputId="position-staff" formControlName="staffId" [options]="staffOptions()" optionLabel="label"
                optionValue="value" placeholder="Leave vacant" [showClear]="true" [filter]="true" styleClass="w-full" appendTo="body" />
              <small class="field-help">Assignment marks the position as filled.</small></div>
          </div>
        </form>
        <ng-template #footer><p-button label="Cancel" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
          <p-button [label]="editingId() ? 'Save changes' : 'Create position'" icon="pi pi-check"
            [loading]="saving()" [disabled]="saving()" (onClick)="save()" /></ng-template>
      </p-dialog>

      <p-dialog [visible]="detailsVisible()" (visibleChange)="detailsVisible.set($event)" [modal]="true"
        [style]="{ width: '42rem', maxWidth: '96vw' }" header="Position details" [draggable]="false">
        @if (selectedDetails(); as position) {
          <div class="details-header"><div><span class="eyebrow">Position #{{ position.id }}</span><h2>{{ position.title }}</h2></div>
            <p-tag [value]="statusLabel(position.status)" [severity]="statusSeverity(position.status)" /></div>
          <div class="org-path"><span>{{ position.companyName || org.companyName(position.companyId) }}</span><i class="pi pi-arrow-right"></i>
            <span>{{ position.departmentName || org.departmentName(position.deptId) }}</span><i class="pi pi-arrow-right"></i><strong>{{ position.title }}</strong></div>
          <div class="hierarchy-card"><div><span>Parent position</span><strong>{{ position.reportsToPositionTitle || 'Top level' }}</strong></div>
            <i class="pi pi-arrow-down"></i><div class="current-position">{{ position.title }}</div><i class="pi pi-arrow-down"></i>
            <div><span>Subordinate positions</span><strong>{{ position.subordinateCount || childPositions(position.id).length }}</strong></div></div>
          <div class="details-grid">
            <div><span>Assigned staff</span><strong>{{ position.staffName || org.staffName(position.staffId) }}</strong></div>
            <div><span>Vacancy</span><strong>{{ position.isVacant ? 'Open vacancy' : 'No open vacancy' }}</strong></div>
            <div><span>Created</span><strong>{{ formatDate(position.createdAt) }}</strong></div>
            <div><span>Last updated</span><strong>{{ formatDate(position.updatedAt) }}</strong></div>
          </div>
          @if (childPositions(position.id).length) { <div class="children-list"><span>Direct reports</span>
            @for (child of childPositions(position.id); track child.id) { <p-tag [value]="child.title" severity="secondary" /> }</div> }
        } @else if (detailsLoading()) { <div class="empty-state"><i class="pi pi-spin pi-spinner"></i><p>Loading position details…</p></div> }
      </p-dialog>
    </div>
  `,
  styles: [`
    .header-actions,.row-actions,.summary-row { display:flex; align-items:center; gap:.55rem; flex-wrap:wrap; }
    .summary-row { margin:-.55rem 0 1rem; color:var(--p-text-muted-color); font-size:.82rem; }
    .summary-row span { padding:.35rem .65rem; background:var(--p-content-background); border:1px solid var(--p-content-border-color); border-radius:999px; }
    .position-toolbar { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; margin-bottom:.75rem; }
    .position-search { position:relative; display:flex; align-items:center; flex:1 1 22rem; }
    .position-search i { position:absolute; left:.75rem; color:var(--p-text-muted-color); z-index:1; }
    .position-search input { width:100%; padding-left:2.25rem; }
    :host ::ng-deep .position-filter { min-width:10.5rem; }
    .clear-filters { border:0; background:transparent; color:var(--p-primary-color); cursor:pointer; padding:.55rem .35rem; }
    .clear-filters:disabled { opacity:.4; cursor:default; }
    .archived-toggle { display:flex; align-items:center; gap:.4rem; color:var(--p-text-muted-color); font-size:.82rem; }
    .position-name { border:0; padding:0; background:transparent; color:var(--p-text-color); font:inherit; font-weight:700; cursor:pointer; text-align:left; }
    .position-name:hover { color:var(--p-primary-color); }
    .muted { color:var(--p-text-muted-color); font-size:.76rem; margin-top:.15rem; }
    .actions-column { width:8.5rem; }
    .icon-action { width:2rem; height:2rem; display:grid; place-items:center; border:1px solid var(--p-content-border-color); border-radius:7px; background:transparent; color:var(--p-text-color); cursor:pointer; }
    .icon-action:hover { color:var(--p-primary-color); border-color:var(--p-primary-color); }
    .icon-action.danger:hover { color:#ef4444; border-color:#ef4444; }
    .archived-row { opacity:.58; }
    .empty-state { text-align:center; padding:3rem 1rem; color:var(--p-text-muted-color); }
    .empty-state i { font-size:2.3rem; opacity:.55; }.empty-state p { color:var(--p-text-color); font-weight:700; margin:.6rem 0 .25rem; }
    .empty-state span { display:block; font-size:.84rem; margin-bottom:.9rem; }.error-state i,.error-state p { color:var(--p-red-500); }
    .position-form { display:flex; flex-direction:column; gap:.9rem; padding-top:.25rem; }
    .section-title { font-size:.75rem; font-weight:800; color:var(--p-primary-color); text-transform:uppercase; letter-spacing:.08em; border-bottom:1px solid var(--p-content-border-color); padding-bottom:.45rem; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:.9rem; }.span-2 { grid-column:span 2; }
    .field { display:flex; flex-direction:column; gap:.35rem; }.field label { font-size:.82rem; font-weight:650; }
    .error-text { color:var(--p-red-500); }.field-help { color:var(--p-text-muted-color); font-size:.72rem; }
    .details-header { display:flex; justify-content:space-between; gap:1rem; align-items:center; }.details-header h2 { margin:.15rem 0; }
    .eyebrow { color:var(--p-text-muted-color); font-size:.75rem; text-transform:uppercase; letter-spacing:.08em; }
    .org-path { margin:1rem 0; padding:.85rem; display:flex; gap:.45rem; align-items:center; flex-wrap:wrap; border-radius:9px; background:var(--p-content-hover-background); font-size:.8rem; }
    .org-path i { color:var(--p-text-muted-color); font-size:.7rem; }
    .hierarchy-card { display:flex; flex-direction:column; align-items:center; gap:.45rem; padding:1rem; border:1px solid var(--p-content-border-color); border-radius:10px; text-align:center; }
    .hierarchy-card div { display:flex; flex-direction:column; gap:.15rem; }.hierarchy-card span { color:var(--p-text-muted-color); font-size:.72rem; }.hierarchy-card i { color:var(--p-primary-color); }
    .current-position { padding:.55rem 1rem; border-radius:8px; background:var(--p-primary-color); color:var(--p-primary-contrast-color); font-weight:700; }
    .details-grid { display:grid; grid-template-columns:1fr 1fr; gap:.8rem; margin-top:1rem; }.details-grid div { display:flex; flex-direction:column; gap:.2rem; }.details-grid span { color:var(--p-text-muted-color); font-size:.72rem; }.details-grid strong { font-size:.88rem; }
    .children-list { margin-top:1rem; display:flex; align-items:center; flex-wrap:wrap; gap:.4rem; }
    @media(max-width:700px){.form-grid,.details-grid{grid-template-columns:1fr}.span-2{grid-column:auto}:host ::ng-deep .position-filter{flex:1 1 10rem}}
  `],
})
export class PositionList implements OnInit {
  readonly org = inject(OrgDataService);
  private readonly api = inject(PositionService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);
  private readonly searchChanges = new Subject<string>();

  readonly rows = signal<Position[]>([]);
  readonly loading = signal(false); readonly saving = signal(false); readonly loadError = signal<string | null>(null);
  readonly totalRecords = signal(0); readonly page = signal(0); readonly pageSize = signal(20);
  readonly sortField = signal<PositionSortField>('title'); readonly sortDirection = signal<'asc' | 'desc'>('asc');
  readonly search = signal(''); readonly companyFilter = signal<number | null>(null); readonly departmentFilter = signal<number | null>(null);
  readonly statusFilter = signal<PositionStatus | null>(null); readonly parentFilter = signal<number | null>(null);
  readonly assignedFilter = signal<boolean | null>(null); readonly showArchived = signal(false);
  readonly editingId = signal<number | null>(null); readonly selectedDetails = signal<Position | null>(null);
  readonly detailsVisible = signal(false); readonly detailsLoading = signal(false); readonly canManage = this.auth.canEditOrgData;
  private readonly selectedCompany = signal<number | null>(null); private readonly selectedDepartment = signal<number | null>(null);
  dialogVisible = false;

  readonly companyOptions = computed<Option[]>(() => {
    const options = this.org.companyOptions(); const user = this.auth.currentUser();
    return this.auth.isSuperAdmin() || user?.companyId == null ? options : options.filter((item) => item.value === user.companyId);
  });
  readonly companyFilterOptions = computed(() => [{ label:'All companies', value:null as number|null }, ...this.companyOptions()]);
  readonly departmentFilterOptions = computed(() => [{ label:'All departments', value:null as number|null }, ...this.org.departmentOptions(this.companyFilter())]);
  readonly parentFilterOptions = computed(() => [{ label:'All reporting positions', value:null as number|null }, ...this.org.positions.snapshot()
    .filter((p) => this.companyFilter() == null || p.companyId === this.companyFilter()).map((p) => ({ label:p.title, value:p.id }))]);
  readonly departmentOptions = computed(() => this.org.departmentOptions(this.selectedCompany()));
  readonly parentOptions = computed(() => this.org.positions.snapshot().filter((p) => p.companyId === this.selectedCompany())
    .filter((p) => p.id !== this.editingId() && p.status !== 'CLOSED').map((p) => ({ label:p.title, value:p.id })));
  readonly staffOptions = computed(() => this.org.staff.snapshot().filter((s) => s.companyId === this.selectedCompany())
    .filter((s) => this.selectedDepartment() == null || s.deptId === this.selectedDepartment())
    .filter((s) => s.status === 'ACTIVE').map((s) => ({ label:`${s.name}${s.employeeCode ? ' · '+s.employeeCode : ''}`, value:s.id })));
  readonly statusFilterOptions = [{label:'All statuses',value:null as PositionStatus|null},{label:'Open',value:'OPEN' as PositionStatus},{label:'Filled',value:'FILLED' as PositionStatus},{label:'Closed',value:'CLOSED' as PositionStatus}];
  readonly editableStatusOptions = [{label:'Open',value:'OPEN' as PositionStatus},{label:'Closed',value:'CLOSED' as PositionStatus}];
  readonly assignmentFilterOptions = [{label:'Any staffing',value:null as boolean|null},{label:'Assigned',value:true},{label:'Unassigned',value:false}];

  readonly form = this.fb.nonNullable.group({
    title:['',[Validators.required,Validators.maxLength(200)]], companyId:[null as number|null,Validators.required],
    deptId:[null as number|null], reportsToPositionId:[null as number|null], staffId:[null as number|null], status:['OPEN' as PositionStatus],
  });

  constructor() {
    this.searchChanges.pipe(debounceTime(300),distinctUntilChanged(),takeUntilDestroyed()).subscribe(() => this.resetAndLoad());
    this.form.controls.companyId.valueChanges.pipe(takeUntilDestroyed()).subscribe((companyId) => {
      this.selectedCompany.set(companyId);
      const deptId=this.form.controls.deptId.value; const parentId=this.form.controls.reportsToPositionId.value; const staffId=this.form.controls.staffId.value;
      if(deptId!=null&&!this.org.departments.snapshot().some((d)=>d.id===deptId&&d.companyId===companyId)) this.form.patchValue({deptId:null,staffId:null},{emitEvent:false});
      if(parentId!=null&&!this.org.positions.snapshot().some((p)=>p.id===parentId&&p.companyId===companyId)) this.form.patchValue({reportsToPositionId:null},{emitEvent:false});
      if(staffId!=null&&!this.org.staff.snapshot().some((s)=>s.id===staffId&&s.companyId===companyId)) this.form.patchValue({staffId:null},{emitEvent:false});
      this.selectedDepartment.set(this.form.controls.deptId.value);
    });
    this.form.controls.deptId.valueChanges.pipe(takeUntilDestroyed()).subscribe((deptId) => {
      this.selectedDepartment.set(deptId); const staffId=this.form.controls.staffId.value;
      if(staffId!=null&&!this.org.staff.snapshot().some((s)=>s.id===staffId&&(deptId==null||s.deptId===deptId))) this.form.patchValue({staffId:null},{emitEvent:false});
    });
  }
  ngOnInit():void { this.load(); }
  onLazyLoad(event:TableLazyLoadEvent):void { const size=event.rows??this.pageSize(); this.pageSize.set(size); this.page.set(Math.floor((event.first??0)/size));
    const field=typeof event.sortField==='string'?event.sortField:'title'; const allowed:PositionSortField[]=['title','status','createdAt','updatedAt'];
    this.sortField.set(allowed.includes(field as PositionSortField)?field as PositionSortField:'title'); this.sortDirection.set(event.sortOrder===-1?'desc':'asc'); this.load(); }
  applySearch(v:string):void { this.search.set(v); this.searchChanges.next(v.trim()); }
  applyCompanyFilter(v:number|null):void { this.companyFilter.set(v); if(this.departmentFilter()!=null&&!this.org.departments.snapshot().some((d)=>d.id===this.departmentFilter()&&(v==null||d.companyId===v)))this.departmentFilter.set(null);
    if(this.parentFilter()!=null&&!this.org.positions.snapshot().some((p)=>p.id===this.parentFilter()&&(v==null||p.companyId===v)))this.parentFilter.set(null); this.resetAndLoad(); }
  applyDepartmentFilter(v:number|null):void { this.departmentFilter.set(v); this.resetAndLoad(); }
  applyStatusFilter(v:PositionStatus|null):void { this.statusFilter.set(v); this.resetAndLoad(); }
  applyParentFilter(v:number|null):void { this.parentFilter.set(v); this.resetAndLoad(); }
  applyAssignedFilter(v:boolean|null):void { this.assignedFilter.set(v); this.resetAndLoad(); }
  toggleArchived(v:boolean):void { this.showArchived.set(v); this.resetAndLoad(); }
  refresh():void { this.load(); }
  clearFilters():void { this.search.set('');this.companyFilter.set(null);this.departmentFilter.set(null);this.statusFilter.set(null);this.parentFilter.set(null);this.assignedFilter.set(null);this.resetAndLoad(); }
  readonly hasFilters=computed(()=>!!(this.search().trim()||this.companyFilter()!=null||this.departmentFilter()!=null||this.statusFilter()!=null||this.parentFilter()!=null||this.assignedFilter()!=null));
  openCreate():void { this.editingId.set(null); const company=this.auth.isSuperAdmin()?null:this.auth.currentUser()?.companyId??null; this.selectedCompany.set(company);this.selectedDepartment.set(null);
    this.form.reset({title:'',companyId:company,deptId:null,reportsToPositionId:null,staffId:null,status:'OPEN'});this.dialogVisible=true; }
  openEdit(p:Position):void { this.editingId.set(p.id);this.selectedCompany.set(p.companyId);this.selectedDepartment.set(p.deptId??null);
    this.form.reset({title:p.title,companyId:p.companyId,deptId:p.deptId??null,reportsToPositionId:p.reportsToPositionId??null,staffId:p.staffId??null,status:p.status==='FILLED'?'OPEN':p.status});this.dialogVisible=true; }
  save():void { if(this.form.invalid){this.form.markAllAsTouched();return;} const current=this.rows().find((p)=>p.id===this.editingId())??null;this.persist(current); }
  openDetails(p:Position):void { this.selectedDetails.set(null);this.detailsLoading.set(true);this.detailsVisible.set(true);this.api.get(p.id).pipe(finalize(()=>this.detailsLoading.set(false))).subscribe({next:(value)=>this.selectedDetails.set(value),error:()=>this.messages.add({severity:'error',summary:'Unable to load position',detail:'Please try again.'})}); }
  confirmArchive(p:Position):void { this.confirm.confirm({header:'Archive position',message:`Archive “${p.title}”? Assigned or supervisory positions cannot be archived.`,icon:'pi pi-exclamation-triangle',acceptLabel:'Archive',rejectLabel:'Cancel',acceptButtonStyleClass:'p-button-danger',accept:()=>this.api.archive(p.id).subscribe({next:()=>{this.afterMutation();this.messages.add({severity:'info',summary:'Position archived',detail:p.title});},error:()=>undefined})}); }
  confirmStatus(p:Position,status:'OPEN'|'CLOSED'):void { const action=status==='CLOSED'?'close':'reopen';this.confirm.confirm({header:`${action==='close'?'Close':'Reopen'} position`,message:`Are you sure you want to ${action} “${p.title}”?`,icon:'pi pi-exclamation-triangle',acceptLabel:action==='close'?'Close':'Reopen',rejectLabel:'Cancel',accept:()=>this.api.update(p.id,{companyId:p.companyId,title:p.title,deptId:p.deptId,reportsToPositionId:p.reportsToPositionId,staffId:p.staffId,status,version:p.version??0}).subscribe({next:()=>{this.afterMutation();this.messages.add({severity:'success',summary:`Position ${action==='close'?'closed':'reopened'}`,detail:p.title});},error:()=>undefined})}); }
  restore(p:Position):void { this.api.restore(p.id).subscribe({next:()=>{this.afterMutation();this.messages.add({severity:'success',summary:'Position restored',detail:p.title});},error:()=>undefined}); }
  invalid(name:string):boolean { const c=this.form.get(name);return !!c&&c.invalid&&(c.touched||c.dirty); }
  positionTitle(id?:number|null):string { return id==null?'Top level':this.org.positions.snapshot(true).find((p)=>p.id===id)?.title??'—'; }
  childPositions(id:number):Position[] { return this.org.positions.snapshot().filter((p)=>p.reportsToPositionId===id); }
  statusLabel(status:PositionStatus):string { return status==='OPEN'?'Open / Vacant':status==='FILLED'?'Filled':'Closed'; }
  statusSeverity(status:PositionStatus):'success'|'warn'|'secondary' { return status==='FILLED'?'success':status==='OPEN'?'warn':'secondary'; }
  formatDate(value?:string):string { return value?new Date(value).toLocaleDateString():'—'; }
  private persist(existing:Position|null):void { this.saving.set(true);const v=this.form.getRawValue();const payload:PositionCreateRequest={companyId:v.companyId!,title:v.title.trim(),deptId:v.deptId,reportsToPositionId:v.reportsToPositionId,staffId:v.staffId,status:v.status};
    const op=existing?this.api.update(existing.id,{...payload,version:existing.version??0}):this.api.create(payload);op.pipe(finalize(()=>this.saving.set(false))).subscribe({next:(saved)=>{this.dialogVisible=false;this.afterMutation();this.messages.add({severity:'success',summary:existing?'Position updated':'Position created',detail:saved.title});},error:()=>undefined}); }
  private afterMutation():void { this.load();forkJoin([this.org.positions.init(),this.org.staff.init()]).subscribe({error:()=>undefined}); }
  private resetAndLoad():void { this.page.set(0);this.load(); }
  private load():void { this.loading.set(true);this.loadError.set(null);this.api.list({page:this.page(),size:this.pageSize(),sort:this.sortField(),direction:this.sortDirection(),search:this.search(),companyId:this.companyFilter(),departmentId:this.departmentFilter(),status:this.statusFilter(),reportsToPositionId:this.parentFilter(),assigned:this.assignedFilter(),includeDeleted:this.showArchived()}).pipe(finalize(()=>this.loading.set(false))).subscribe({next:(result)=>{this.rows.set(result.content);this.totalRecords.set(result.totalElements);},error:()=>{this.rows.set([]);this.totalRecords.set(0);this.loadError.set('Check your connection and try again.');}}); }
}
