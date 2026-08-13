import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
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
import { Subject, debounceTime, distinctUntilChanged, finalize, forkJoin } from 'rxjs';

import { Role } from '../../core/models/enums';
import { AppUser } from '../../core/models/system.model';
import { AuthService } from '../../core/services/auth.service';
import { OrgDataService } from '../../core/data/org-data.service';
import { RoleInfo, UserAdminService, UserSummary } from '../../core/data/user-admin.service';

@Component({
  selector: 'app-user-list',
  imports: [ReactiveFormsModule, FormsModule, DatePipe, TableModule, ButtonModule, InputTextModule, DialogModule,
    SelectModule, TagModule, TooltipModule, ToggleSwitchModule, AvatarModule],
  template: `
    <div class="oms-page">
      <div class="oms-page-header">
        <div><h1 class="oms-page-title">Users &amp; Roles</h1>
          <p class="oms-page-subtitle">Manage secure account access, company scope, and role assignments.</p></div>
        <div class="header-actions">
          <p-button label="Refresh" icon="pi pi-refresh" [outlined]="true" [loading]="loading()" (onClick)="refresh()" />
          <p-button label="Add user" icon="pi pi-user-plus" (onClick)="openCreate()" />
        </div>
      </div>

      <div class="summary-grid">
        @for (card of summaryCards(); track card.label) {
          <div class="summary-card"><span class="summary-icon" [class]="card.icon"><i [class]="card.pi"></i></span>
            <div><strong>{{ card.value }}</strong><span>{{ card.label }}</span></div></div>
        }
      </div>

      <div class="oms-surface-card">
        <p-table [value]="rows()" [loading]="loading()" [lazy]="true" [paginator]="true"
          [rows]="pageSize()" [rowsPerPageOptions]="[10,20,50]" [totalRecords]="totalRecords()"
          [first]="page() * pageSize()" (onLazyLoad)="onLazyLoad($event)" dataKey="id"
          [sortField]="sortField()" [sortOrder]="sortDirection() === 'asc' ? 1 : -1"
          [showCurrentPageReport]="true" currentPageReportTemplate="Showing {first}–{last} of {totalRecords}"
          styleClass="p-datatable-sm">
          <ng-template #caption><div class="toolbar">
            <span class="search"><i class="pi pi-search"></i><input pInputText type="search"
              placeholder="Search name, username, email, employee ID, company, or role…"
              [ngModel]="search()" (ngModelChange)="applySearch($event)" [ngModelOptions]="{standalone:true}" /></span>
            @if (auth.isSuperAdmin()) { <p-select [ngModel]="companyFilter()" (ngModelChange)="applyCompany($event)"
              [ngModelOptions]="{standalone:true}" [options]="companyFilterOptions()" optionLabel="label" optionValue="value" placeholder="All companies" /> }
            <p-select [ngModel]="departmentFilter()" (ngModelChange)="applyDepartment($event)" [ngModelOptions]="{standalone:true}"
              [options]="departmentFilterOptions()" optionLabel="label" optionValue="value" placeholder="All departments" />
            <p-select [ngModel]="roleFilter()" (ngModelChange)="applyRole($event)" [ngModelOptions]="{standalone:true}"
              [options]="roleOptions()" optionLabel="label" optionValue="value" placeholder="All roles" />
            <p-select [ngModel]="statusFilter()" (ngModelChange)="applyStatus($event)" [ngModelOptions]="{standalone:true}"
              [options]="statusOptions" optionLabel="label" optionValue="value" placeholder="All statuses" />
            <button type="button" class="clear" [disabled]="!hasFilters()" (click)="clearFilters()"><i class="pi pi-filter-slash"></i> Clear</button>
            <label class="archived"><p-toggleswitch [ngModel]="showArchived()" (ngModelChange)="toggleArchived($event)"
              [ngModelOptions]="{standalone:true}" /> Archived</label>
          </div></ng-template>
          <ng-template #header><tr>
            <th pSortableColumn="fullName">User <p-sortIcon field="fullName" /></th><th pSortableColumn="username">Username <p-sortIcon field="username" /></th>
            <th>Email</th><th pSortableColumn="role">Role <p-sortIcon field="role" /></th><th>Company</th>
            <th>Status</th><th pSortableColumn="lastLogin">Last login <p-sortIcon field="lastLogin" /></th>
            <th pSortableColumn="createdAt">Created <p-sortIcon field="createdAt" /></th><th class="actions-col">Actions</th>
          </tr></ng-template>
          <ng-template #body let-user><tr [class.archived-row]="user.isDeleted">
            <td><div class="user-cell"><p-avatar [label]="initials(user.fullName)" shape="circle" />
              <button type="button" (click)="openDetails(user)">{{ user.fullName }}</button></div></td>
            <td>{{ user.username }}</td><td class="muted">{{ user.email }}</td>
            <td><p-tag [value]="roleLabel(user.role)" [severity]="roleSeverity(user.role)" /></td>
            <td>{{ user.companyName || (user.role === 'SUPER_ADMIN' ? 'All companies' : '—') }}</td>
            <td><p-tag [value]="statusLabel(user)" [severity]="statusSeverity(user)" /></td>
            <td class="muted">{{ user.lastLogin ? (user.lastLogin | date:'medium') : 'Never' }}</td>
            <td class="muted">{{ user.createdAt | date:'mediumDate' }}</td>
            <td><div class="row-actions">
              <button class="icon-action" pTooltip="View details" (click)="openDetails(user)"><i class="pi pi-eye"></i></button>
              @if (!user.isDeleted && canMutate(user)) {
                <button class="icon-action" pTooltip="Edit" (click)="openEdit(user)"><i class="pi pi-pencil"></i></button>
                @if (user.isLocked) { <button class="icon-action" pTooltip="Unlock" (click)="confirmUnlock(user)"><i class="pi pi-lock-open"></i></button> }
                <button class="icon-action" pTooltip="Send password reset" (click)="confirmReset(user)"><i class="pi pi-key"></i></button>
                <button class="icon-action" [pTooltip]="user.isActive ? 'Deactivate' : 'Activate'" (click)="confirmStatus(user)"><i class="pi" [class.pi-ban]="user.isActive" [class.pi-check-circle]="!user.isActive"></i></button>
                <button class="icon-action danger" pTooltip="Archive" (click)="confirmArchive(user)"><i class="pi pi-trash"></i></button>
              } @else if (user.isDeleted && canMutate(user)) { <button class="icon-action" pTooltip="Restore as inactive" (click)="restore(user)"><i class="pi pi-refresh"></i></button> }
            </div></td>
          </tr></ng-template>
          <ng-template #emptymessage><tr><td colspan="9"><div class="empty" [class.error]="loadError()">
            <i class="pi" [class.pi-users]="!loadError()" [class.pi-exclamation-triangle]="loadError()"></i>
            <strong>{{ loadError() ? 'Unable to load users' : 'No users found' }}</strong>
            <span>{{ loadError() || (hasFilters() ? 'No users match the selected filters.' : 'Create the first user account to get started.') }}</span>
            @if (loadError()) { <p-button label="Try again" icon="pi pi-refresh" [outlined]="true" (onClick)="refresh()" /> }
          </div></td></tr></ng-template>
        </p-table>
      </div>

      <h2 class="section-title">Roles and effective access</h2>
      <div class="roles-grid">@for (role of roles(); track role.role) {
        <article class="oms-surface-card role-card"><div class="role-head"><i class="pi pi-shield"></i><div><strong>{{ roleLabel(role.role) }}</strong>
          <span>{{ role.accessLevel }} · {{ role.assignedUsers }} user{{ role.assignedUsers === 1 ? '' : 's' }}</span></div></div>
          <p>{{ role.description }}</p><ul>@for (permission of role.permissions; track permission) { <li><i class="pi pi-check"></i>{{ permission }}</li> }</ul></article>
      }</div>

      <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{width:'46rem',maxWidth:'96vw'}"
        [header]="editingId() ? 'Edit user' : 'Create user'" [draggable]="false">
        <form [formGroup]="form" class="user-form">
          <h3>Account information</h3><div class="form-grid">
            <div class="field"><label>Username *</label><input pInputText formControlName="username" autocomplete="off" />
              @if (invalid('username')) { <small>Username is required.</small> }</div>
            <div class="field"><label>Email *</label><input pInputText type="email" formControlName="email" autocomplete="off" />
              @if (invalid('email')) { <small>Enter a valid email.</small> }</div>
            @if (!editingId()) {
              <div class="field"><label>Temporary password *</label><input pInputText type="password" formControlName="password" autocomplete="new-password" />
                @if (invalid('password')) { <small>Use at least 8 characters.</small> }</div>
              <div class="field"><label>Confirm password *</label><input pInputText type="password" formControlName="confirmPassword" autocomplete="new-password" />
                @if (passwordMismatch()) { <small>Passwords must match.</small> }</div>
            }
            <div class="field span-2"><label class="inline"><p-toggleswitch formControlName="isActive" /> Account active</label></div>
          </div>
          <h3>User identity</h3><div class="form-grid"><div class="field span-2"><label>Full name *</label><input pInputText formControlName="fullName" />
            @if (invalid('fullName')) { <small>Full name is required.</small> }</div></div>
          <h3>Organization and access</h3><div class="form-grid">
            <div class="field"><label>Company *</label><p-select formControlName="companyId" [options]="companyOptions()" optionLabel="label" optionValue="value"
              placeholder="Select company" [showClear]="auth.isSuperAdmin()" appendTo="body" /></div>
            <div class="field"><label>Role *</label><p-select formControlName="role" [options]="roleOptions()" optionLabel="label" optionValue="value" appendTo="body" /></div>
            <div class="field span-2"><label>Staff association</label><p-select formControlName="staffId" [options]="staffOptions()" optionLabel="label" optionValue="value"
              placeholder="No staff association" [showClear]="true" [filter]="true" appendTo="body" />
              <span class="help">Only active staff from the selected company are available.</span></div>
          </div>
          @if (saveError()) { <div class="form-error"><i class="pi pi-exclamation-circle"></i>{{ saveError() }}</div> }
        </form>
        <ng-template #footer><p-button label="Cancel" severity="secondary" [text]="true" (onClick)="dialogVisible=false" />
          <p-button [label]="editingId() ? 'Save changes' : 'Create user'" icon="pi pi-check" [loading]="saving()" (onClick)="save()" /></ng-template>
      </p-dialog>

      <p-dialog [visible]="detailsVisible()" (visibleChange)="detailsVisible.set($event)" [modal]="true"
        [style]="{width:'40rem',maxWidth:'96vw'}" header="User details" [draggable]="false">
        @if (selected(); as user) { <div class="profile"><p-avatar [label]="initials(user.fullName)" shape="circle" size="xlarge" />
          <div><h2>{{ user.fullName }}</h2><p>{{ user.email }}</p><div class="badges"><p-tag [value]="roleLabel(user.role)" [severity]="roleSeverity(user.role)" />
            <p-tag [value]="statusLabel(user)" [severity]="statusSeverity(user)" /></div></div></div>
          <div class="details-grid"><div><span>Username</span><strong>{{ user.username }}</strong></div><div><span>Last login</span><strong>{{ user.lastLogin ? (user.lastLogin | date:'medium') : 'Never' }}</strong></div>
            <div><span>Company</span><strong>{{ user.companyName || 'All companies' }}</strong></div><div><span>Department</span><strong>{{ user.departmentName || 'Not assigned' }}</strong></div>
            <div><span>Staff</span><strong>{{ user.staffName || 'Not associated' }}</strong></div><div><span>Employee ID</span><strong>{{ user.employeeCode || 'Not available' }}</strong></div>
            <div><span>Failed attempts</span><strong>{{ user.failedLoginAttempts }}</strong></div><div><span>Created</span><strong>{{ user.createdAt | date:'medium' }}</strong></div></div>
          <div class="security-note"><i class="pi pi-shield"></i><span>Access scope: {{ roleAccess(user.role) }}. Passwords, tokens, and security secrets are never displayed.</span></div>
        } @else { <div class="empty"><i class="pi pi-spin pi-spinner"></i><strong>Loading user details…</strong></div> }
      </p-dialog>
    </div>
  `,
  styles: [`
    .header-actions,.row-actions,.badges{display:flex;gap:.5rem;align-items:center}.summary-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1rem;margin-bottom:1rem}
    .summary-card{background:var(--p-content-background);border:1px solid var(--p-content-border-color);border-radius:12px;padding:1rem;display:flex;gap:.8rem;align-items:center}.summary-card strong{display:block;font-size:1.45rem}.summary-card span{font-size:.8rem;color:var(--p-text-muted-color)}
    .summary-icon{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--p-primary-color) 14%,transparent);color:var(--p-primary-color)}
    .toolbar{display:flex;flex-wrap:wrap;gap:.65rem;align-items:center}.search{position:relative;flex:1;min-width:19rem}.search i{position:absolute;left:.75rem;top:.8rem;color:var(--p-text-muted-color)}.search input{width:100%;padding-left:2.2rem}.clear{border:0;background:none;color:var(--p-primary-color);cursor:pointer}.clear:disabled{opacity:.45}.archived{display:flex;gap:.4rem;align-items:center;font-size:.82rem}
    .user-cell{display:flex;align-items:center;gap:.65rem}.user-cell button,.icon-action{border:0;background:none;cursor:pointer;color:var(--p-text-color)}.user-cell button{font-weight:650;text-align:left}.muted{color:var(--p-text-muted-color);font-size:.84rem}.row-actions{justify-content:flex-end}.icon-action{padding:.35rem}.icon-action.danger{color:var(--p-red-500)}.actions-col{width:13rem}.archived-row{opacity:.65}
    .empty{min-height:12rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.65rem;color:var(--p-text-muted-color)}.empty>i{font-size:2rem}.empty.error>i,.form-error{color:var(--p-red-500)}
    .section-title{font-size:1.15rem;margin:2rem 0 1rem}.roles-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem}.role-card{padding:1.1rem}.role-head{display:flex;gap:.65rem;align-items:center}.role-head>i{font-size:1.3rem;color:var(--p-primary-color)}.role-head strong,.role-head span{display:block}.role-head span{font-size:.75rem;color:var(--p-text-muted-color)}.role-card p{font-size:.84rem;color:var(--p-text-muted-color);min-height:2.6rem}.role-card ul{list-style:none;padding:0;margin:0;display:grid;gap:.4rem;font-size:.8rem}.role-card li{display:flex;gap:.4rem}.role-card li i{color:var(--p-green-500)}
    .user-form h3{font-size:.9rem;border-bottom:1px solid var(--p-content-border-color);padding-bottom:.45rem;margin:1.2rem 0 .8rem}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.field{display:grid;gap:.35rem}.field>*{width:100%}.field label{font-size:.8rem;font-weight:650}.field small,.form-error{font-size:.75rem}.field small{color:var(--p-red-500)}.field .help{font-size:.72rem;color:var(--p-text-muted-color)}.field.span-2{grid-column:1/-1}.field label.inline{display:flex;align-items:center;gap:.5rem}.form-error{margin-top:1rem;display:flex;gap:.4rem;align-items:center}
    .profile{display:flex;gap:1rem;align-items:center}.profile h2,.profile p{margin:.15rem 0}.details-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1.5rem 0}.details-grid span,.details-grid strong{display:block}.details-grid span{font-size:.72rem;color:var(--p-text-muted-color);text-transform:uppercase}.details-grid strong{margin-top:.2rem}.security-note{display:flex;gap:.6rem;padding:.8rem;border-radius:8px;background:color-mix(in srgb,var(--p-primary-color) 9%,transparent);font-size:.8rem}
    @media(max-width:900px){.summary-grid{grid-template-columns:repeat(2,1fr)}.toolbar>*{flex:1 1 12rem}}@media(max-width:600px){.summary-grid,.form-grid,.details-grid{grid-template-columns:1fr}.field.span-2{grid-column:auto}.header-actions{width:100%;flex-wrap:wrap}.search{min-width:100%}}
  `]
})
export class UserList implements OnInit {
  readonly auth=inject(AuthService);readonly org=inject(OrgDataService);private readonly api=inject(UserAdminService);
  private readonly fb=inject(FormBuilder);private readonly confirm=inject(ConfirmationService);private readonly messages=inject(MessageService);
  readonly rows=signal<AppUser[]>([]);readonly roles=signal<RoleInfo[]>([]);readonly summary=signal<UserSummary>({total:0,active:0,inactive:0,locked:0,administrators:0});
  readonly loading=signal(false);readonly saving=signal(false);readonly loadError=signal<string|null>(null);readonly saveError=signal<string|null>(null);
  readonly page=signal(0);readonly pageSize=signal(20);readonly totalRecords=signal(0);readonly sortField=signal('fullName');readonly sortDirection=signal<'asc'|'desc'>('asc');
  readonly search=signal('');readonly companyFilter=signal<number|null>(null);readonly departmentFilter=signal<number|null>(null);readonly roleFilter=signal<Role|null>(null);
  readonly statusFilter=signal<'ACTIVE'|'INACTIVE'|'LOCKED'|null>(null);readonly showArchived=signal(false);readonly editingId=signal<number|null>(null);
  readonly selected=signal<AppUser|null>(null);readonly detailsVisible=signal(false);dialogVisible=false;private readonly searchChanges=new Subject<string>();
  readonly statusOptions=[{label:'Active',value:'ACTIVE'},{label:'Inactive',value:'INACTIVE'},{label:'Locked',value:'LOCKED'}];
  readonly companyOptions=computed(()=>this.org.companyOptions());readonly companyFilterOptions=computed(()=>[{label:'All companies',value:null},...this.companyOptions()]);
  readonly departmentFilterOptions=computed(()=>[{label:'All departments',value:null},...this.org.departmentOptions(this.companyFilter())]);
  readonly roleOptions=computed(()=>Object.values(Role).filter((r)=>this.auth.isSuperAdmin()||!([Role.SUPER_ADMIN,Role.COMPANY_ADMIN] as Role[]).includes(r)).map((r)=>({label:this.roleLabel(r),value:r})));
  readonly selectedCompany=signal<number|null>(null);readonly staffOptions=computed(()=>this.org.staffOptions(this.selectedCompany()));
  readonly summaryCards=computed(()=>[{label:'Total users',value:this.summary().total,pi:'pi pi-users',icon:''},{label:'Active users',value:this.summary().active,pi:'pi pi-check-circle',icon:''},{label:'Inactive users',value:this.summary().inactive,pi:'pi pi-ban',icon:''},{label:'Locked users',value:this.summary().locked,pi:'pi pi-lock',icon:''},{label:'Administrators',value:this.summary().administrators,pi:'pi pi-shield',icon:''}]);
  readonly hasFilters=computed(()=>!!(this.search().trim()||this.companyFilter()!=null||this.departmentFilter()!=null||this.roleFilter()!=null||this.statusFilter()!=null));
  readonly form=this.fb.nonNullable.group({fullName:['',[Validators.required,Validators.maxLength(200)]],username:['',[Validators.required,Validators.maxLength(100)]],email:['',[Validators.required,Validators.email]],password:['',[Validators.minLength(8)]],confirmPassword:[''],role:[Role.STAFF],companyId:[null as number|null],staffId:[null as number|null],isActive:[true]});

  constructor(){this.searchChanges.pipe(debounceTime(350),distinctUntilChanged(),takeUntilDestroyed()).subscribe(()=>this.resetAndLoad());
    this.form.controls.companyId.valueChanges.pipe(takeUntilDestroyed()).subscribe((companyId)=>{this.selectedCompany.set(companyId);const staffId=this.form.controls.staffId.value;if(staffId!=null&&!this.org.staff.snapshot().some((s)=>s.id===staffId&&s.companyId===companyId))this.form.controls.staffId.setValue(null,{emitEvent:false});});
    this.form.controls.role.valueChanges.pipe(takeUntilDestroyed()).subscribe((role)=>{if(role===Role.SUPER_ADMIN)this.form.controls.companyId.setValue(null);});}
  ngOnInit(){if(!this.auth.isSuperAdmin())this.companyFilter.set(this.auth.currentUser()?.companyId??null);this.load();}
  onLazyLoad(e:TableLazyLoadEvent){const size=e.rows??this.pageSize();this.pageSize.set(size);this.page.set(Math.floor((e.first??0)/size));this.sortField.set(typeof e.sortField==='string'?e.sortField:'fullName');this.sortDirection.set(e.sortOrder===-1?'desc':'asc');this.load();}
  applySearch(v:string){this.search.set(v);this.searchChanges.next(v.trim())}applyCompany(v:number|null){this.companyFilter.set(v);this.departmentFilter.set(null);this.resetAndLoad()}
  applyDepartment(v:number|null){this.departmentFilter.set(v);this.resetAndLoad()}applyRole(v:Role|null){this.roleFilter.set(v);this.resetAndLoad()}applyStatus(v:'ACTIVE'|'INACTIVE'|'LOCKED'|null){this.statusFilter.set(v);this.resetAndLoad()}
  toggleArchived(v:boolean){this.showArchived.set(v);this.resetAndLoad()}refresh(){this.load()}clearFilters(){this.search.set('');this.departmentFilter.set(null);this.roleFilter.set(null);this.statusFilter.set(null);if(this.auth.isSuperAdmin())this.companyFilter.set(null);this.resetAndLoad()}
  openCreate(){this.editingId.set(null);this.saveError.set(null);const company=this.auth.isSuperAdmin()?null:this.auth.currentUser()?.companyId??null;this.selectedCompany.set(company);this.form.reset({fullName:'',username:'',email:'',password:'',confirmPassword:'',role:Role.STAFF,companyId:company,staffId:null,isActive:true});this.dialogVisible=true}
  openEdit(u:AppUser){this.editingId.set(u.id);this.saveError.set(null);this.selectedCompany.set(u.companyId??null);this.form.reset({fullName:u.fullName,username:u.username,email:u.email,password:'',confirmPassword:'',role:u.role,companyId:u.companyId??null,staffId:u.staffId??null,isActive:u.isActive});this.dialogVisible=true}
  openDetails(u:AppUser){this.selected.set(null);this.detailsVisible.set(true);this.api.get(u.id).subscribe({next:(x)=>this.selected.set(x),error:()=>this.toastError('Unable to load user details')})}
  save(){if(this.form.invalid||(!this.editingId()&&(this.form.controls.password.value.length<8||this.passwordMismatch()))){this.form.markAllAsTouched();return}const v=this.form.getRawValue();const existing=this.rows().find((u)=>u.id===this.editingId());
    const persist=()=>{this.saving.set(true);this.saveError.set(null);const request={fullName:v.fullName.trim(),username:v.username.trim(),email:v.email.trim(),role:v.role,companyId:v.companyId,staffId:v.staffId,isActive:v.isActive};const op=existing?this.api.update(existing.id,{...request,version:existing.version}):this.api.create({...request,password:v.password});op.pipe(finalize(()=>this.saving.set(false))).subscribe({next:(saved)=>{this.dialogVisible=false;this.afterMutation();this.messages.add({severity:'success',summary:existing?'User updated':'User created',detail:saved.fullName})},error:(e)=>this.saveError.set(this.errorMessage(e))})};
    if(existing&&existing.role!==v.role){this.confirm.confirm({header:'Confirm role change',message:`Change ${existing.fullName} from ${this.roleLabel(existing.role)} to ${this.roleLabel(v.role)}?${v.role===Role.SUPER_ADMIN?' This grants full system access.':''}`,icon:'pi pi-shield',acceptLabel:'Change role',rejectLabel:'Cancel',accept:persist})}else persist()}
  confirmStatus(u:AppUser){const active=!u.isActive;this.confirm.confirm({header:active?'Activate user':'Deactivate user',message:`${active?'Activate':'Deactivate'} ${u.fullName}'s account?`,icon:'pi pi-exclamation-triangle',acceptLabel:active?'Activate':'Deactivate',rejectLabel:'Cancel',accept:()=>this.api.status(u.id,active,u.version).subscribe({next:()=>this.afterMutation(),error:(e)=>this.toastError(this.errorMessage(e))})})}
  confirmUnlock(u:AppUser){this.confirm.confirm({header:'Unlock account',message:`Unlock ${u.fullName}'s account and clear failed login attempts?`,accept:()=>this.api.unlock(u.id,u.version).subscribe({next:()=>this.afterMutation(),error:(e)=>this.toastError(this.errorMessage(e))})})}
  confirmReset(u:AppUser){this.confirm.confirm({header:'Send password reset',message:`Send a one-time, expiring password reset link to ${u.email}?`,acceptLabel:'Send link',rejectLabel:'Cancel',accept:()=>this.api.resetPassword(u.id).subscribe({next:()=>this.messages.add({severity:'success',summary:'Reset link requested',detail:u.email}),error:(e)=>this.toastError(this.errorMessage(e))})})}
  confirmArchive(u:AppUser){this.confirm.confirm({header:'Archive user',message:`Archive ${u.fullName}'s account? They will lose access immediately.`,acceptLabel:'Archive',rejectLabel:'Cancel',acceptButtonStyleClass:'p-button-danger',accept:()=>this.api.archive(u.id).subscribe({next:()=>this.afterMutation(),error:(e)=>this.toastError(this.errorMessage(e))})})}
  restore(u:AppUser){this.api.restore(u.id,u.version).subscribe({next:()=>{this.afterMutation();this.messages.add({severity:'success',summary:'User restored',detail:'The account remains inactive until explicitly activated.'})},error:(e)=>this.toastError(this.errorMessage(e))})}
  passwordMismatch(){const v=this.form.getRawValue();return !!v.confirmPassword&&v.password!==v.confirmPassword}invalid(name:string){const c=this.form.get(name);return!!c&&c.invalid&&(c.touched||c.dirty)}
  initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map((p)=>p[0]).join('').toUpperCase()}roleLabel(role:Role){return role.split('_').map((p)=>p[0]+p.slice(1).toLowerCase()).join(' ')}
  roleSeverity(role:Role):'info'|'contrast'|'success'|'warn'|'secondary'{return role===Role.SUPER_ADMIN?'info':role===Role.COMPANY_ADMIN?'contrast':role===Role.MANAGER?'success':role===Role.STAFF?'warn':'secondary'}
  statusLabel(u:AppUser){return u.isDeleted?'Archived':u.isLocked?'Locked':u.isActive?'Active':'Inactive'}statusSeverity(u:AppUser):'success'|'danger'|'warn'|'secondary'{return u.isDeleted?'secondary':u.isLocked?'danger':u.isActive?'success':'warn'}
  roleAccess(role:Role){return this.roles().find((r)=>r.role===role)?.accessLevel??role}
  canMutate(user:AppUser){return this.auth.isSuperAdmin()||![Role.SUPER_ADMIN,Role.COMPANY_ADMIN].includes(user.role)}
  private resetAndLoad(){this.page.set(0);this.load()}private afterMutation(){this.load()}
  private load(){this.loading.set(true);this.loadError.set(null);const company=this.companyFilter();const status=this.statusFilter();forkJoin({page:this.api.list({page:this.page(),size:this.pageSize(),sort:this.sortField(),direction:this.sortDirection(),search:this.search(),companyId:company,departmentId:this.departmentFilter(),role:this.roleFilter(),active:status==='ACTIVE'?true:status==='INACTIVE'?false:null,locked:status==='LOCKED'?true:null,includeDeleted:this.showArchived()}),summary:this.api.summary(company),roles:this.api.roles(company)}).pipe(finalize(()=>this.loading.set(false))).subscribe({next:(r)=>{this.rows.set(r.page.content);this.totalRecords.set(r.page.totalElements);this.summary.set(r.summary);this.roles.set(r.roles)},error:()=>{this.rows.set([]);this.totalRecords.set(0);this.loadError.set('Check your connection and try again.')}})}
  private errorMessage(e:unknown){return e instanceof HttpErrorResponse?(e.error?.message??'The operation could not be completed.'):'The operation could not be completed.'}private toastError(detail:string){this.messages.add({severity:'error',summary:'Action failed',detail})}
}
