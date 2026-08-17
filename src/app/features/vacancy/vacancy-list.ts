import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { TableLazyLoadEvent } from 'primeng/types/table';
import { Subject, debounceTime, distinctUntilChanged, finalize, forkJoin } from 'rxjs';

import { Option, OrgDataService } from '../../core/data/org-data.service';
import { Position } from '../../core/models/organization.model';
import { AuthService } from '../../core/services/auth.service';
import { PositionCreateRequest, PositionService, PositionSortField, PositionStatus } from '../position/position.service';

interface VacancySummary { total:number; open:number; filled:number; closed:number; }

@Component({
  selector:'app-vacancy-list',
  imports:[ReactiveFormsModule,FormsModule,TableModule,ButtonModule,InputTextModule,DialogModule,SelectModule,TagModule,TooltipModule],
  template:`
    <div class="oms-page">
      <div class="oms-page-header"><div><h1 class="oms-page-title">Vacancy Management</h1>
        <p class="oms-page-subtitle">Track open roles through filling or closure while keeping positions and staff synchronized.</p></div>
        <div class="header-actions"><p-button label="Refresh" icon="pi pi-refresh" [outlined]="true" [loading]="loading()" (onClick)="refresh()" />
          @if(canManage()){<p-button label="New vacancy" icon="pi pi-plus" (onClick)="openCreate()" />}</div></div>

      <div class="summary-grid" aria-live="polite">
        <div class="summary-card"><span>Total</span><strong>{{summary().total}}</strong><small>Position lifecycle records</small></div>
        <div class="summary-card open"><span>Open</span><strong>{{summary().open}}</strong><small>Awaiting assignment</small></div>
        <div class="summary-card filled"><span>Filled</span><strong>{{summary().filled}}</strong><small>Assigned to staff</small></div>
        <div class="summary-card closed"><span>Closed</span><strong>{{summary().closed}}</strong><small>Closed without assignment</small></div>
      </div>

      <div class="oms-surface-card"><p-table [value]="rows()" [loading]="loading()" [lazy]="true" [paginator]="true"
        [rows]="pageSize()" [rowsPerPageOptions]="[10,20,50]" [totalRecords]="totalRecords()" [first]="page()*pageSize()"
        (onLazyLoad)="onLazyLoad($event)" [sortField]="sortField()" [sortOrder]="sortDirection()==='asc'?1:-1"
        dataKey="id" [showCurrentPageReport]="true" currentPageReportTemplate="Showing {first}–{last} of {totalRecords}"
        styleClass="p-datatable-sm" [scrollable]="true">
        <ng-template #caption><div class="vacancy-toolbar">
          <span class="vacancy-search"><i class="pi pi-search"></i><input pInputText type="search"
            placeholder="Search vacancy ID, position, company, or department…" [ngModel]="search()"
            (ngModelChange)="applySearch($event)" [ngModelOptions]="{standalone:true}" /></span>
          <p-select [ngModel]="companyFilter()" (ngModelChange)="applyCompanyFilter($event)" [ngModelOptions]="{standalone:true}"
            [options]="companyFilterOptions()" optionLabel="label" optionValue="value" placeholder="All companies" styleClass="vacancy-filter" />
          <p-select [ngModel]="departmentFilter()" (ngModelChange)="applyDepartmentFilter($event)" [ngModelOptions]="{standalone:true}"
            [options]="departmentFilterOptions()" optionLabel="label" optionValue="value" placeholder="All departments" styleClass="vacancy-filter" />
          <p-select [ngModel]="positionFilter()" (ngModelChange)="applyPositionFilter($event)" [ngModelOptions]="{standalone:true}"
            [options]="positionFilterOptions()" optionLabel="label" optionValue="value" placeholder="All positions" [filter]="true" styleClass="vacancy-filter" />
          <p-select [ngModel]="statusFilter()" (ngModelChange)="applyStatusFilter($event)" [ngModelOptions]="{standalone:true}"
            [options]="statusOptions" optionLabel="label" optionValue="value" placeholder="All statuses" styleClass="vacancy-filter" />
          <button class="clear-filters" type="button" (click)="clearFilters()" [disabled]="!hasFilters()"><i class="pi pi-filter-slash"></i> Clear</button>
        </div></ng-template>
        <ng-template #header><tr><th pSortableColumn="title">Vacancy / Position <p-sortIcon field="title" /></th><th>Company</th>
          <th>Department</th><th>Assigned staff</th><th pSortableColumn="status">Status <p-sortIcon field="status" /></th>
          <th pSortableColumn="createdAt">Created <p-sortIcon field="createdAt" /></th><th class="actions-column">Actions</th></tr></ng-template>
        <ng-template #body let-v><tr><td><button class="vacancy-name" type="button" (click)="openDetails(v)">{{v.title}}</button>
          <div class="muted">Vacancy #{{v.id}}</div></td><td>{{v.companyName||org.companyName(v.companyId)}}</td>
          <td>{{v.departmentName||org.departmentName(v.deptId)}}</td><td>{{v.staffName||org.staffName(v.staffId)}}</td>
          <td><p-tag [value]="statusLabel(v.status)" [severity]="statusSeverity(v.status)" /></td><td>{{formatDate(v.createdAt)}}</td>
          <td><div class="row-actions"><button class="icon-action" type="button" pTooltip="View details" (click)="openDetails(v)"><i class="pi pi-eye"></i></button>
            <button class="icon-action" type="button" pTooltip="View position" (click)="viewPosition(v)"><i class="pi pi-id-card"></i></button>
            @if(canManage()){
              @if(v.status==='OPEN'){<button class="icon-action" type="button" pTooltip="Edit" (click)="openEdit(v)"><i class="pi pi-pencil"></i></button>
                <button class="icon-action" type="button" pTooltip="Fill vacancy" (click)="openFill(v)"><i class="pi pi-user-plus"></i></button>
                <button class="icon-action danger" type="button" pTooltip="Close vacancy" (click)="confirmClose(v)"><i class="pi pi-times"></i></button>}
              @if(v.status==='CLOSED'){<button class="icon-action" type="button" pTooltip="Reopen vacancy" (click)="confirmReopen(v)"><i class="pi pi-replay"></i></button>
                <button class="icon-action danger" type="button" pTooltip="Archive closed vacancy" (click)="confirmArchive(v)"><i class="pi pi-archive"></i></button>}
            }
          </div></td></tr></ng-template>
        <ng-template #emptymessage><tr><td colspan="7">@if(loadError()){<div class="empty-state error-state"><i class="pi pi-exclamation-triangle"></i>
          <p>Unable to load vacancies</p><span>{{loadError()}}</span><p-button label="Try again" icon="pi pi-refresh" [outlined]="true" (onClick)="refresh()" /></div>}
          @else{<div class="empty-state"><i class="pi pi-inbox"></i><p>No vacancies found</p>
            <span>{{hasFilters()?'No vacancies match your current filters.':'No position lifecycle records are available.'}}</span></div>}</td></tr></ng-template>
      </p-table></div>

      <p-dialog [(visible)]="formVisible" [modal]="true" [style]="{width:'44rem',maxWidth:'96vw'}"
        [header]="editingId()?'Edit vacancy':'New vacancy'" [draggable]="false"><form [formGroup]="form" class="vacancy-form">
        <div class="section-title">Vacancy information</div><div class="form-grid"><div class="field span-2"><label for="vacancy-title">Position title *</label>
          <input id="vacancy-title" pInputText formControlName="title" class="w-full" placeholder="e.g. Brand Manager" />
          @if(invalid('title')){<small class="error-text">Title is required and must be at most 200 characters.</small>}</div></div>
        <div class="section-title">Organization</div><div class="form-grid"><div class="field"><label for="vacancy-company">Company *</label>
          <p-select inputId="vacancy-company" formControlName="companyId" [options]="companyOptions()" optionLabel="label" optionValue="value"
            placeholder="Select company" styleClass="w-full" appendTo="body" />@if(invalid('companyId')){<small class="error-text">Company is required.</small>}</div>
          <div class="field"><label for="vacancy-department">Department</label><p-select inputId="vacancy-department" formControlName="deptId"
            [options]="departmentOptions()" optionLabel="label" optionValue="value" placeholder="Unassigned" [showClear]="true" styleClass="w-full" appendTo="body" /></div>
          <div class="field span-2"><label for="vacancy-parent">Reports to position</label><p-select inputId="vacancy-parent" formControlName="reportsToPositionId"
            [options]="parentOptions()" optionLabel="label" optionValue="value" placeholder="Top-level position" [showClear]="true" [filter]="true" styleClass="w-full" appendTo="body" /></div></div>
        <small class="model-note">One vacancy represents one unstaffed position. Headcount, priority, descriptions, and closing dates are not stored by the current OMS model.</small>
      </form><ng-template #footer><p-button label="Cancel" severity="secondary" [text]="true" (onClick)="formVisible=false" />
        <p-button [label]="editingId()?'Save changes':'Open vacancy'" icon="pi pi-check" [loading]="saving()" [disabled]="saving()" (onClick)="save()" /></ng-template></p-dialog>

      <p-dialog [(visible)]="fillVisible" [modal]="true" [style]="{width:'32rem',maxWidth:'96vw'}" header="Fill vacancy" [draggable]="false">
        @if(target();as vacancy){<p>Assign an active staff member to <strong>{{vacancy.title}}</strong>.</p><div class="field"><label>Staff member *</label>
          <p-select [(ngModel)]="fillStaffId" [options]="fillStaffOptions()" optionLabel="label" optionValue="value" placeholder="Select staff"
            [filter]="true" styleClass="w-full" appendTo="body" /><small class="model-note">Only active staff in the vacancy's company and department are available.</small></div>}
        <ng-template #footer><p-button label="Cancel" severity="secondary" [text]="true" (onClick)="fillVisible=false" />
          <p-button label="Assign and fill" icon="pi pi-check" [loading]="saving()" [disabled]="fillStaffId==null||saving()" (onClick)="fill()" /></ng-template></p-dialog>

      <p-dialog [visible]="detailsVisible()" (visibleChange)="detailsVisible.set($event)" [modal]="true" [style]="{width:'40rem',maxWidth:'96vw'}"
        header="Vacancy details" [draggable]="false">@if(selectedDetails();as v){<div class="details-header"><div><span>Vacancy #{{v.id}}</span><h2>{{v.title}}</h2></div>
          <p-tag [value]="statusLabel(v.status)" [severity]="statusSeverity(v.status)" /></div><div class="org-path"><span>{{v.companyName}}</span><i class="pi pi-arrow-right"></i>
          <span>{{v.departmentName||'Unassigned department'}}</span><i class="pi pi-arrow-right"></i><strong>{{v.title}}</strong><i class="pi pi-arrow-right"></i><span>Vacancy</span></div>
          <div class="details-grid"><div><span>Assigned staff</span><strong>{{v.staffName||'Unfilled'}}</strong></div><div><span>Reports to</span><strong>{{v.reportsToPositionTitle||'Top level'}}</strong></div>
          <div><span>Created</span><strong>{{formatDate(v.createdAt)}}</strong></div><div><span>Updated</span><strong>{{formatDate(v.updatedAt)}}</strong></div></div>
          <div class="detail-actions"><p-button label="View related position" icon="pi pi-id-card" [outlined]="true" (onClick)="viewPosition(v)" /></div>}
          @else if(detailsLoading()){<div class="empty-state"><i class="pi pi-spin pi-spinner"></i><p>Loading vacancy details…</p></div>}</p-dialog>
    </div>`,
  styles:[`
    .header-actions,.row-actions,.detail-actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;margin-bottom:1rem}.summary-card{padding:1rem;border:1px solid var(--p-content-border-color);border-radius:12px;background:var(--p-content-background);display:flex;flex-direction:column;gap:.18rem;border-left:4px solid var(--p-primary-color)}.summary-card.open{border-left-color:#f59e0b}.summary-card.filled{border-left-color:#22c55e}.summary-card.closed{border-left-color:#94a3b8}.summary-card span,.summary-card small{color:var(--p-text-muted-color);font-size:.75rem}.summary-card strong{font-size:1.7rem}.vacancy-toolbar{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.75rem}.vacancy-search{position:relative;display:flex;align-items:center;flex:1 1 20rem}.vacancy-search i{position:absolute;left:.75rem;color:var(--p-text-muted-color);z-index:1}.vacancy-search input{width:100%;padding-left:2.25rem}:host ::ng-deep .vacancy-filter{min-width:10rem}.clear-filters{border:0;background:transparent;color:var(--p-primary-color);cursor:pointer}.clear-filters:disabled{opacity:.4}.vacancy-name{border:0;background:transparent;padding:0;color:var(--p-text-color);font:inherit;font-weight:700;cursor:pointer}.vacancy-name:hover{color:var(--p-primary-color)}.muted{color:var(--p-text-muted-color);font-size:.75rem}.actions-column{width:12rem}.icon-action{width:2rem;height:2rem;display:grid;place-items:center;border:1px solid var(--p-content-border-color);border-radius:7px;background:transparent;color:var(--p-text-color);cursor:pointer}.icon-action:hover{color:var(--p-primary-color);border-color:var(--p-primary-color)}.icon-action.danger:hover{color:#ef4444;border-color:#ef4444}.empty-state{text-align:center;padding:3rem 1rem;color:var(--p-text-muted-color)}.empty-state i{font-size:2.3rem}.empty-state p{color:var(--p-text-color);font-weight:700;margin:.6rem 0 .25rem}.empty-state span{display:block;margin-bottom:.8rem}.error-state i,.error-state p{color:var(--p-red-500)}.vacancy-form{display:flex;flex-direction:column;gap:.9rem}.section-title{font-size:.75rem;font-weight:800;color:var(--p-primary-color);text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--p-content-border-color);padding-bottom:.4rem}.form-grid,.details-grid{display:grid;grid-template-columns:1fr 1fr;gap:.9rem}.span-2{grid-column:span 2}.field{display:flex;flex-direction:column;gap:.35rem}.field label{font-size:.82rem;font-weight:650}.error-text{color:var(--p-red-500)}.model-note{color:var(--p-text-muted-color);font-size:.73rem}.details-header{display:flex;justify-content:space-between;align-items:center;gap:1rem}.details-header span,.details-grid span{color:var(--p-text-muted-color);font-size:.72rem}.details-header h2{margin:.15rem 0}.org-path{margin:1rem 0;padding:.85rem;display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;background:var(--p-content-hover-background);border-radius:9px;font-size:.8rem}.org-path i{font-size:.65rem;color:var(--p-text-muted-color)}.details-grid div{display:flex;flex-direction:column;gap:.2rem}.detail-actions{margin-top:1rem}@media(max-width:700px){.summary-grid{grid-template-columns:1fr 1fr}.form-grid,.details-grid{grid-template-columns:1fr}.span-2{grid-column:auto}:host ::ng-deep .vacancy-filter{flex:1 1 10rem}}`]
})
export class VacancyList implements OnInit {
  readonly org=inject(OrgDataService);private readonly api=inject(PositionService);private readonly auth=inject(AuthService);
  private readonly fb=inject(FormBuilder);private readonly confirm=inject(ConfirmationService);private readonly messages=inject(MessageService);private readonly router=inject(Router);
  private readonly searchChanges=new Subject<string>();readonly canManage=this.auth.canEditOrgData;
  readonly rows=signal<Position[]>([]);readonly summary=signal<VacancySummary>({total:0,open:0,filled:0,closed:0});readonly loading=signal(false);readonly saving=signal(false);readonly loadError=signal<string|null>(null);
  readonly page=signal(0);readonly pageSize=signal(20);readonly totalRecords=signal(0);readonly sortField=signal<PositionSortField>('createdAt');readonly sortDirection=signal<'asc'|'desc'>('desc');
  readonly search=signal('');readonly companyFilter=signal<number|null>(null);readonly departmentFilter=signal<number|null>(null);readonly positionFilter=signal<number|null>(null);readonly statusFilter=signal<PositionStatus|null>(null);
  readonly editingId=signal<number|null>(null);readonly target=signal<Position|null>(null);readonly selectedDetails=signal<Position|null>(null);readonly detailsVisible=signal(false);readonly detailsLoading=signal(false);
  private readonly selectedCompany=signal<number|null>(null);private readonly selectedDepartment=signal<number|null>(null);formVisible=false;fillVisible=false;fillStaffId:number|null=null;
  readonly companyOptions=computed<Option[]>(()=>{const options=this.org.companyOptions();const user=this.auth.currentUser();return this.auth.isSuperAdmin()||user?.companyId==null?options:options.filter((o)=>o.value===user.companyId)});
  readonly companyFilterOptions=computed(()=>[{label:'All companies',value:null as number|null},...this.companyOptions()]);readonly departmentFilterOptions=computed(()=>[{label:'All departments',value:null as number|null},...this.org.departmentOptions(this.companyFilter())]);
  readonly positionFilterOptions=computed(()=>[{label:'All positions',value:null as number|null},...this.org.positions.snapshot(true).filter((p)=>!p.isDeleted&&(this.companyFilter()==null||p.companyId===this.companyFilter())).filter((p)=>this.departmentFilter()==null||p.deptId===this.departmentFilter()).map((p)=>({label:p.title,value:p.id}))]);
  readonly departmentOptions=computed(()=>this.org.departmentOptions(this.selectedCompany()));readonly parentOptions=computed(()=>this.org.positions.snapshot().filter((p)=>p.companyId===this.selectedCompany()&&p.id!==this.editingId()&&p.status!=='CLOSED').map((p)=>({label:p.title,value:p.id})));
  readonly fillStaffOptions=computed(()=>{const v=this.target();return this.org.staff.snapshot().filter((s)=>s.status==='ACTIVE'&&s.companyId===v?.companyId&&(v?.deptId==null||s.deptId===v.deptId)).filter((s)=>!this.org.positions.snapshot().some((p)=>p.staffId===s.id&&p.id!==v?.id)).map((s)=>({label:`${s.name}${s.employeeCode?' · '+s.employeeCode:''}`,value:s.id}))});
  readonly statusOptions=[{label:'All statuses',value:null as PositionStatus|null},{label:'Open',value:'OPEN' as PositionStatus},{label:'Filled',value:'FILLED' as PositionStatus},{label:'On hold',value:'ON_HOLD' as PositionStatus},{label:'Closed',value:'CLOSED' as PositionStatus}];
  readonly form=this.fb.nonNullable.group({title:['',[Validators.required,Validators.maxLength(200)]],companyId:[null as number|null,Validators.required],deptId:[null as number|null],reportsToPositionId:[null as number|null]});
  constructor(){this.searchChanges.pipe(debounceTime(300),distinctUntilChanged(),takeUntilDestroyed()).subscribe(()=>this.resetAndLoad());this.form.controls.companyId.valueChanges.pipe(takeUntilDestroyed()).subscribe((companyId)=>{this.selectedCompany.set(companyId);const dept=this.form.controls.deptId.value;const parent=this.form.controls.reportsToPositionId.value;if(dept!=null&&!this.org.departments.snapshot().some((d)=>d.id===dept&&d.companyId===companyId))this.form.patchValue({deptId:null},{emitEvent:false});if(parent!=null&&!this.org.positions.snapshot().some((p)=>p.id===parent&&p.companyId===companyId))this.form.patchValue({reportsToPositionId:null},{emitEvent:false});this.selectedDepartment.set(this.form.controls.deptId.value)});this.form.controls.deptId.valueChanges.pipe(takeUntilDestroyed()).subscribe((dept)=>this.selectedDepartment.set(dept));}
  ngOnInit():void{this.load()}onLazyLoad(e:TableLazyLoadEvent):void{const size=e.rows??this.pageSize();this.pageSize.set(size);this.page.set(Math.floor((e.first??0)/size));const field=typeof e.sortField==='string'?e.sortField:'createdAt';const allowed:PositionSortField[]=['title','status','createdAt','updatedAt'];this.sortField.set(allowed.includes(field as PositionSortField)?field as PositionSortField:'createdAt');this.sortDirection.set(e.sortOrder===-1?'desc':'asc');this.load()}
  applySearch(v:string):void{this.search.set(v);this.searchChanges.next(v.trim())}applyCompanyFilter(v:number|null):void{this.companyFilter.set(v);if(this.departmentFilter()!=null&&!this.org.departments.snapshot().some((d)=>d.id===this.departmentFilter()&&(v==null||d.companyId===v)))this.departmentFilter.set(null);this.positionFilter.set(null);this.resetAndLoad()}applyDepartmentFilter(v:number|null):void{this.departmentFilter.set(v);this.positionFilter.set(null);this.resetAndLoad()}applyPositionFilter(v:number|null):void{this.positionFilter.set(v);this.resetAndLoad()}applyStatusFilter(v:PositionStatus|null):void{this.statusFilter.set(v);this.resetAndLoad()}clearFilters():void{this.search.set('');this.companyFilter.set(null);this.departmentFilter.set(null);this.positionFilter.set(null);this.statusFilter.set(null);this.resetAndLoad()}readonly hasFilters=computed(()=>!!(this.search().trim()||this.companyFilter()!=null||this.departmentFilter()!=null||this.positionFilter()!=null||this.statusFilter()!=null));refresh():void{this.load()}
  openCreate():void{this.editingId.set(null);const company=this.auth.isSuperAdmin()?null:this.auth.currentUser()?.companyId??null;this.selectedCompany.set(company);this.form.reset({title:'',companyId:company,deptId:null,reportsToPositionId:null});this.formVisible=true}openEdit(v:Position):void{this.editingId.set(v.id);this.selectedCompany.set(v.companyId);this.selectedDepartment.set(v.deptId??null);this.form.reset({title:v.title,companyId:v.companyId,deptId:v.deptId??null,reportsToPositionId:v.reportsToPositionId??null});this.formVisible=true}
  save():void{if(this.form.invalid){this.form.markAllAsTouched();return}const existing=this.rows().find((v)=>v.id===this.editingId())??null;const v=this.form.getRawValue();const payload:PositionCreateRequest={title:v.title.trim(),companyId:v.companyId!,deptId:v.deptId,reportsToPositionId:v.reportsToPositionId,staffId:null,status:'OPEN'};this.saving.set(true);const op=existing?this.api.update(existing.id,{...payload,version:existing.version??0}):this.api.create(payload);op.pipe(finalize(()=>this.saving.set(false))).subscribe({next:(saved)=>{this.formVisible=false;this.afterMutation();this.messages.add({severity:'success',summary:existing?'Vacancy updated':'Vacancy opened',detail:saved.title})},error:()=>undefined})}
  openFill(v:Position):void{this.target.set(v);this.fillStaffId=null;this.fillVisible=true}fill():void{const v=this.target();if(!v||this.fillStaffId==null)return;this.saving.set(true);this.api.update(v.id,{companyId:v.companyId,title:v.title,deptId:v.deptId,reportsToPositionId:v.reportsToPositionId,staffId:this.fillStaffId,status:'OPEN',version:v.version??0}).pipe(finalize(()=>this.saving.set(false))).subscribe({next:()=>{this.fillVisible=false;this.afterMutation();this.messages.add({severity:'success',summary:'Vacancy filled',detail:`${v.title} assigned to ${this.org.staffName(this.fillStaffId)}`})},error:()=>undefined})}
  confirmClose(v:Position):void{this.confirmTransition(v,'CLOSED','Close vacancy',`Close “${v.title}” without filling it?`)}confirmReopen(v:Position):void{this.confirmTransition(v,'OPEN','Reopen vacancy',`Reopen “${v.title}” for staffing?`)}private confirmTransition(v:Position,status:'OPEN'|'CLOSED',header:string,message:string):void{this.confirm.confirm({header,message,icon:'pi pi-exclamation-triangle',acceptLabel:status==='OPEN'?'Reopen':'Close vacancy',rejectLabel:'Cancel',accept:()=>this.api.update(v.id,{companyId:v.companyId,title:v.title,deptId:v.deptId,reportsToPositionId:v.reportsToPositionId,staffId:null,status,version:v.version??0}).subscribe({next:()=>{this.afterMutation();this.messages.add({severity:'success',summary:header,detail:v.title})},error:()=>undefined})})}
  confirmArchive(v:Position):void{this.confirm.confirm({header:'Archive closed vacancy',message:`Archive “${v.title}”? The audit history will be retained.`,icon:'pi pi-exclamation-triangle',acceptLabel:'Archive',rejectLabel:'Cancel',acceptButtonStyleClass:'p-button-danger',accept:()=>this.api.archive(v.id).subscribe({next:()=>{this.afterMutation();this.messages.add({severity:'info',summary:'Vacancy archived',detail:v.title})},error:()=>undefined})})}
  openDetails(v:Position):void{this.selectedDetails.set(null);this.detailsLoading.set(true);this.detailsVisible.set(true);this.api.get(v.id).pipe(finalize(()=>this.detailsLoading.set(false))).subscribe({next:(data)=>this.selectedDetails.set(data),error:()=>this.messages.add({severity:'error',summary:'Unable to load vacancy details',detail:'Please try again.'})})}viewPosition(v:Position):void{this.detailsVisible.set(false);this.router.navigate(['/positions'],{queryParams:{q:v.title}})}invalid(name:string):boolean{const c=this.form.get(name);return!!c&&c.invalid&&(c.touched||c.dirty)}statusLabel(s:PositionStatus):string{return s==='OPEN'?'Open':s==='FILLED'?'Filled':s==='ON_HOLD'?'On hold':'Closed'}statusSeverity(s:PositionStatus):'warn'|'success'|'secondary'{return s==='OPEN'?'warn':s==='FILLED'?'success':'secondary'}formatDate(v?:string):string{return v?new Date(v).toLocaleDateString():'—'}
  private afterMutation():void{this.load();forkJoin([this.org.positions.init(),this.org.staff.init()]).subscribe({error:()=>undefined})}private resetAndLoad():void{this.page.set(0);this.load()}private load():void{this.loading.set(true);this.loadError.set(null);forkJoin({page:this.api.list({page:this.page(),size:this.pageSize(),sort:this.sortField(),direction:this.sortDirection(),search:this.search(),companyId:this.companyFilter(),departmentId:this.departmentFilter(),positionId:this.positionFilter(),status:this.statusFilter(),includeDeleted:false}),summary:this.api.vacancySummary(this.companyFilter())}).pipe(finalize(()=>this.loading.set(false))).subscribe({next:(result)=>{this.rows.set(result.page.content);this.totalRecords.set(result.page.totalElements);this.summary.set(result.summary)},error:()=>{this.rows.set([]);this.totalRecords.set(0);this.loadError.set('Check your connection and try again.')}})}
}
