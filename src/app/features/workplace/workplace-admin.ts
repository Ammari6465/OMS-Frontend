import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';import { ActivatedRoute, Router } from '@angular/router';import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';import { DialogModule } from 'primeng/dialog';import { InputTextModule } from 'primeng/inputtext';import { SelectModule } from 'primeng/select';import { TableModule } from 'primeng/table';import { TagModule } from 'primeng/tag';import { CheckboxModule } from 'primeng/checkbox';import { TextareaModule } from 'primeng/textarea';import { TooltipModule } from 'primeng/tooltip';
import { finalize, forkJoin } from 'rxjs';import { OrgDataService } from '../../core/data/org-data.service';import { AuthService } from '../../core/services/auth.service';import { Role } from '../../core/models/enums';import { Building, Desk, Floor, Office, WorkplaceService, Zone } from './workplace.service';

/** The six administration tabs, in hierarchy order. `assignments` is derived from desk data. */
type Tab='offices'|'buildings'|'floors'|'zones'|'desks'|'assignments';
/** Archive/restore uses the backend's plural resource kind, which matches every tab except assignments. */
type Kind='offices'|'buildings'|'floors'|'zones'|'desks';

@Component({selector:'app-workplace-admin',imports:[FormsModule,ReactiveFormsModule,ButtonModule,DialogModule,InputTextModule,SelectModule,TableModule,TagModule,CheckboxModule,TextareaModule,TooltipModule],template:`
<div class="oms-page workplace-admin">
 <div class="oms-page-header"><div><span class="eyebrow">WORKPLACE ADMINISTRATION</span><h1 class="oms-page-title">Offices, buildings, floors & desks</h1><p class="oms-page-subtitle">Maintain the workplace hierarchy that backs the interactive seating maps.</p></div>
  <div class="header-actions"><p-button label="Open floor maps" icon="pi pi-map" [outlined]="true" (onClick)="openMaps()"/><p-button label="Refresh" icon="pi pi-refresh" [outlined]="true" [loading]="loading()" (onClick)="load()"/>@if(canManage()&&tab()!=='assignments'){<p-button [label]="'Add '+singular()" icon="pi pi-plus" (onClick)="openCreate()"/>}</div></div>

 <nav class="tabs" role="tablist" aria-label="Workplace records">@for(t of tabs;track t.value){<button role="tab" [attr.aria-selected]="tab()===t.value" [class.active]="tab()===t.value" (click)="selectTab(t.value)">{{t.label}}<span>{{count(t.value)}}</span></button>}</nav>

 <section class="filters oms-surface-card">
  <span class="search"><i class="pi pi-search"></i><input pInputText [ngModel]="search()" (ngModelChange)="search.set($event)" [attr.aria-label]="'Search '+tab()" placeholder="Search by name, code, or staff…"/></span>
  @if(isSuperAdmin()){<p-select [ngModel]="companyFilter()" (ngModelChange)="setCompany($event)" [options]="companyOptions()" optionLabel="label" optionValue="value" placeholder="All companies" [showClear]="true"/>}
  <p-select [ngModel]="officeFilter()" (ngModelChange)="officeFilter.set($event)" [options]="officeOptions()" optionLabel="label" optionValue="value" placeholder="All offices" [showClear]="true"/>
  <p-select [ngModel]="buildingFilter()" (ngModelChange)="buildingFilter.set($event)" [options]="buildingOptions()" optionLabel="label" optionValue="value" placeholder="All buildings" [showClear]="true"/>
  <p-select [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)" [options]="statuses" optionLabel="label" optionValue="value" placeholder="All statuses" [showClear]="true"/>
  <label class="archived"><p-checkbox [ngModel]="showArchived()" (ngModelChange)="toggleArchived($event)" [binary]="true" inputId="wp-archived"/> <span>Show archived</span></label>
 </section>

 @if(loadError()){<div class="oms-surface-card empty"><i class="pi pi-exclamation-triangle"></i><h3>Unable to load workplace records</h3><p>{{loadError()}}</p><p-button label="Try again" icon="pi pi-refresh" (onClick)="load()"/></div>}
 @else if(loading()){<div class="oms-surface-card empty"><i class="pi pi-spin pi-spinner"></i><p>Loading workplace records…</p></div>}
 @else if(!rows().length){<div class="oms-surface-card empty"><i class="pi pi-inbox"></i><h3>No {{tab()}} match these filters</h3><p>Adjust the filters, or create the first record.</p>@if(canManage()&&tab()!=='assignments'){<p-button [label]="'Add '+singular()" icon="pi pi-plus" (onClick)="openCreate()"/>}</div>}
 @else{<section class="oms-surface-card table-card"><p-table [value]="rows()" [paginator]="true" [rows]="15" [rowsPerPageOptions]="[15,25,50]" [globalFilterFields]="[]" styleClass="p-datatable-sm">
  <ng-template #header><tr><th scope="col">{{headers()[0]}}</th><th scope="col">{{headers()[1]}}</th><th scope="col">{{headers()[2]}}</th><th scope="col">Status</th><th scope="col" class="actions-col">Actions</th></tr></ng-template>
  <ng-template #body let-r><tr [class.archived-row]="r.isDeleted"><td><strong>{{r.primary}}</strong>@if(r.isDeleted){<span class="archived-tag">Archived</span>}</td><td>{{r.secondary}}</td><td>{{r.tertiary}}</td><td><p-tag [value]="r.status" [severity]="r.status==='ACTIVE'?'success':'secondary'"/></td>
   <td class="actions-col">@if(r.floorId){<p-button icon="pi pi-map-marker" [text]="true" pTooltip="View on floor map" [attr.aria-label]="'View '+r.primary+' on the floor map'" (onClick)="viewOnMap(r)"/>}
    @if(canManage()&&tab()!=='assignments'){@if(!r.isDeleted){<p-button icon="pi pi-pencil" [text]="true" pTooltip="Edit" [attr.aria-label]="'Edit '+r.primary" (onClick)="openEdit(r)"/><p-button icon="pi pi-inbox" [text]="true" severity="danger" pTooltip="Archive" [attr.aria-label]="'Archive '+r.primary" (onClick)="archive(r)"/>}@else{<p-button icon="pi pi-replay" [text]="true" pTooltip="Restore" [attr.aria-label]="'Restore '+r.primary" (onClick)="restore(r)"/>}}
    @if(canManage()&&tab()==='assignments'){<p-button icon="pi pi-sign-out" [text]="true" severity="danger" pTooltip="Release desk" [attr.aria-label]="'Release '+r.primary" (onClick)="releaseAssignment(r)"/>}</td></tr></ng-template>
 </p-table></section>}

 <p-dialog [(visible)]="formVisible" [header]="dialogTitle()" [modal]="true" [style]="{width:'36rem',maxWidth:'96vw'}">
  <form [formGroup]="form" class="form">
   @if(tab()==='offices'&&isSuperAdmin()&&!editingId()){<label>Company *<p-select formControlName="companyId" [options]="companyOptions()" optionLabel="label" optionValue="value" appendTo="body"/></label>}
   @if(tab()==='buildings'){<label>Office *<p-select formControlName="parentId" [options]="officeOptions()" optionLabel="label" optionValue="value" appendTo="body"/></label>}
   @if(tab()==='floors'){<label>Building *<p-select formControlName="parentId" [options]="buildingOptions()" optionLabel="label" optionValue="value" appendTo="body"/></label>}
   @if(tab()==='zones'||tab()==='desks'){<label>Floor *<p-select formControlName="parentId" [options]="floorOptions()" optionLabel="label" optionValue="value" appendTo="body"/></label>}
   <label>Name *<input pInputText formControlName="name" required/></label>
   @if(tab()!=='floors'){<label>Code *<input pInputText formControlName="code" required/></label>}
   @if(tab()==='offices'){<label>City<input pInputText formControlName="city"/></label><label>Country<input pInputText formControlName="country"/></label><label>Time zone *<input pInputText formControlName="timeZone" placeholder="Asia/Calcutta"/></label><label>Address<textarea pTextarea formControlName="address" rows="2"></textarea></label>}
   @if(tab()==='floors'){<label>Display order<input pInputText type="number" formControlName="displayOrder"/></label>}
   @if(tab()==='zones'){<label>Colour<input type="color" formControlName="colour"/></label>}
   @if(tab()==='desks'){<label>Telephone extension<input pInputText formControlName="telephoneExtension"/></label><label class="check"><p-checkbox formControlName="accessible" [binary]="true"/> Accessible desk</label>}
   <label>Status<p-select formControlName="status" [options]="statuses" optionLabel="label" optionValue="value" appendTo="body"/></label>
   @if(formError()){<p class="form-error" role="alert">{{formError()}}</p>}
  </form>
  <ng-template #footer><p-button label="Cancel" severity="secondary" [text]="true" (onClick)="formVisible=false"/><p-button [label]="editingId()?'Save changes':'Create'" icon="pi pi-check" [loading]="saving()" (onClick)="submit()"/></ng-template>
 </p-dialog>
</div>`,styles:[`
.header-actions{display:flex;gap:.5rem;flex-wrap:wrap}.eyebrow{font-size:.68rem;letter-spacing:.12em;font-weight:800;color:var(--p-primary-color)}
.tabs{display:flex;gap:.35rem;flex-wrap:wrap;margin:1rem 0 .8rem}.tabs button{display:flex;align-items:center;gap:.4rem;padding:.45rem .8rem;border:1px solid var(--p-content-border-color);border-radius:999px;background:var(--p-content-background);color:var(--p-text-muted-color);font-weight:650;font-size:.8rem;cursor:pointer}
.tabs button.active{background:var(--p-primary-color);border-color:var(--p-primary-color);color:var(--p-primary-contrast-color)}.tabs button span{font-size:.7rem;opacity:.75}.tabs button:focus-visible{outline:2px solid var(--p-primary-color);outline-offset:2px}
.filters{display:flex;gap:.55rem;align-items:center;flex-wrap:wrap;padding:.8rem}.search{position:relative;display:flex;align-items:center;flex:1 1 16rem}.search i{position:absolute;left:.7rem;color:var(--p-text-muted-color)}.search input{width:100%;padding-left:2rem}
.archived{display:flex;align-items:center;gap:.4rem;font-size:.78rem}.table-card{margin-top:.8rem;padding:.4rem}.actions-col{text-align:right;white-space:nowrap}
.archived-row{opacity:.62}.archived-tag{margin-left:.45rem;font-size:.62rem;font-weight:800;letter-spacing:.06em;color:var(--p-text-muted-color)}
.empty{text-align:center;padding:3rem;margin-top:.8rem;color:var(--p-text-muted-color)}.empty i{font-size:2.4rem}.empty h3{color:var(--p-text-color)}
.form{display:flex;flex-direction:column;gap:.8rem}.form label{display:flex;flex-direction:column;gap:.3rem;font-size:.78rem;font-weight:650}.form input,.form textarea{width:100%}.form .check{flex-direction:row;align-items:center}
.form-error{margin:0;color:var(--p-red-500,#ef4444);font-size:.78rem}
@media(max-width:800px){.filters{flex-direction:column;align-items:stretch}.actions-col{text-align:left}}
@media(prefers-reduced-motion:reduce){.tabs button{transition:none}}
`]})
export class WorkplaceAdmin implements OnInit{
 private api=inject(WorkplaceService);private org=inject(OrgDataService);private auth=inject(AuthService);private route=inject(ActivatedRoute);private router=inject(Router);private fb=inject(FormBuilder);private messages=inject(MessageService);

 readonly tabs=[{label:'Offices',value:'offices' as Tab},{label:'Buildings',value:'buildings' as Tab},{label:'Floors',value:'floors' as Tab},{label:'Zones',value:'zones' as Tab},{label:'Desks',value:'desks' as Tab},{label:'Assignments',value:'assignments' as Tab}];
 readonly statuses=[{label:'Active',value:'ACTIVE'},{label:'Inactive',value:'INACTIVE'}];

 readonly tab=signal<Tab>('offices');readonly offices=signal<Office[]>([]);readonly buildings=signal<Building[]>([]);readonly floors=signal<Floor[]>([]);readonly zones=signal<Zone[]>([]);readonly desks=signal<Desk[]>([]);
 readonly search=signal('');readonly companyFilter=signal<number|null>(null);readonly officeFilter=signal<number|null>(null);readonly buildingFilter=signal<number|null>(null);readonly statusFilter=signal<string|null>(null);readonly showArchived=signal(false);
 readonly loading=signal(false);readonly saving=signal(false);readonly loadError=signal<string|null>(null);readonly formError=signal<string|null>(null);readonly editingId=signal<number|null>(null);
 formVisible=false;private editingVersion=0;private editingDesk:Desk|null=null;

 readonly isSuperAdmin=computed(()=>this.auth.currentUser()?.role===Role.SUPER_ADMIN);
 readonly canManage=computed(()=>this.auth.currentUser()?.role===Role.SUPER_ADMIN||this.auth.currentUser()?.role===Role.COMPANY_ADMIN);
 readonly companyOptions=computed(()=>this.org.companyOptions());
 readonly officeOptions=computed(()=>this.offices().filter(o=>!o.isDeleted&&(this.companyFilter()==null||o.companyId===this.companyFilter())).map(o=>({label:o.name,value:o.id})));
 readonly buildingOptions=computed(()=>this.buildings().filter(b=>!b.isDeleted&&(this.officeFilter()==null||b.officeId===this.officeFilter())).map(b=>({label:b.name,value:b.id})));
 readonly floorOptions=computed(()=>this.floors().filter(f=>!f.isDeleted&&(this.buildingFilter()==null||f.buildingId===this.buildingFilter())).map(f=>({label:`${f.officeName} · ${f.buildingName} · ${f.name}`,value:f.id})));

 readonly form=this.fb.nonNullable.group({companyId:null as number|null,parentId:null as number|null,name:'',code:'',city:'',country:'',timeZone:'Asia/Calcutta',address:'',displayOrder:0,colour:'#64748b',telephoneExtension:'',accessible:false,status:'ACTIVE'});

 ngOnInit(){const initial=this.route.snapshot.data['tab'] as Tab|undefined;if(initial)this.tab.set(initial);this.load()}

 load(){
  this.loading.set(true);this.loadError.set(null);const archived=this.showArchived();
  forkJoin({offices:this.api.offices(this.companyFilter(),archived),buildings:this.api.buildings(null,archived),floors:this.api.floors(null,archived),zones:this.api.zones(null,archived),desks:this.api.desks(null,archived)})
   .pipe(finalize(()=>this.loading.set(false)))
   .subscribe({next:r=>{this.offices.set(r.offices);this.buildings.set(r.buildings);this.floors.set(r.floors);this.zones.set(r.zones);this.desks.set(r.desks)},
    error:()=>this.loadError.set('Check your connection and try again.')});
 }

 selectTab(t:Tab){this.tab.set(t);this.search.set('')}
 setCompany(id:number|null){this.companyFilter.set(id);this.officeFilter.set(null);this.buildingFilter.set(null);this.load()}
 toggleArchived(v:boolean){this.showArchived.set(v);this.load()}
 openMaps(){void this.router.navigate(['/workplaces'])}
 singular(){return this.tab().replace(/s$/,'')}
 dialogTitle(){return`${this.editingId()?'Edit':'Create'} ${this.singular()}`}
 headers():[string,string,string]{switch(this.tab()){case'offices':return['Office','Company','Location'];case'buildings':return['Building','Office','Code'];case'floors':return['Floor','Building','Floor plan'];case'zones':return['Zone','Floor','Code'];case'desks':return['Desk','Floor','Assigned to'];default:return['Staff','Desk','Location']}}
 count(t:Tab){return this.rowsFor(t).length}
 readonly rows=computed(()=>this.rowsFor(this.tab()));

 /** Flattens each entity into the shared five-column row shape the table renders. */
 private rowsFor(t:Tab):any[]{
  const q=this.search().trim().toLowerCase();const status=this.statusFilter();const office=this.officeFilter();const building=this.buildingFilter();const company=this.companyFilter();
  const floorOf=(floorId:number)=>this.floors().find(f=>f.id===floorId);
  const inScope=(companyId:number|undefined,officeId:number|undefined,buildingId:number|undefined)=>
   (company==null||companyId===company)&&(office==null||officeId===office)&&(building==null||buildingId===building);
  let list:any[];
  if(t==='offices')list=this.offices().map(o=>({kind:'offices' as Kind,id:o.id,version:o.version,isDeleted:o.isDeleted,status:o.status,primary:o.name,secondary:o.companyName,tertiary:[o.city,o.country].filter(Boolean).join(', ')||'—',companyId:o.companyId,officeId:o.id,buildingId:undefined,raw:o}))
   .filter(r=>inScope(r.companyId,r.officeId,undefined));
  else if(t==='buildings')list=this.buildings().map(b=>({kind:'buildings' as Kind,id:b.id,version:b.version,isDeleted:b.isDeleted,status:b.status,primary:b.name,secondary:b.officeName,tertiary:b.code,companyId:b.companyId,officeId:b.officeId,buildingId:b.id,raw:b}))
   .filter(r=>inScope(r.companyId,r.officeId,r.buildingId));
  else if(t==='floors')list=this.floors().map(f=>({kind:'floors' as Kind,id:f.id,version:f.version,isDeleted:f.isDeleted,status:f.status,primary:f.name,secondary:`${f.officeName} · ${f.buildingName}`,tertiary:f.hasPlan?(f.planOriginalName||'Uploaded'):'No plan',companyId:f.companyId,officeId:f.officeId,buildingId:f.buildingId,floorId:f.id,raw:f}))
   .filter(r=>inScope(r.companyId,r.officeId,r.buildingId));
  else if(t==='zones')list=this.zones().map(z=>{const f=floorOf(z.floorId);return{kind:'zones' as Kind,id:z.id,version:z.version,isDeleted:z.isDeleted,status:z.status,primary:z.name,secondary:f?`${f.buildingName} · ${f.name}`:'—',tertiary:z.code,companyId:f?.companyId,officeId:f?.officeId,buildingId:f?.buildingId,floorId:z.floorId,raw:z}})
   .filter(r=>inScope(r.companyId,r.officeId,r.buildingId));
  else if(t==='desks')list=this.desks().map(d=>{const f=floorOf(d.floorId);return{kind:'desks' as Kind,id:d.id,version:d.version,isDeleted:d.isDeleted,status:d.status,primary:d.code,secondary:f?`${f.buildingName} · ${f.name}`:'—',tertiary:d.assignment?.staffName||(d.availability==='AVAILABLE'?'Available':d.availability),companyId:f?.companyId,officeId:f?.officeId,buildingId:f?.buildingId,floorId:d.floorId,deskId:d.id,raw:d}})
   .filter(r=>inScope(r.companyId,r.officeId,r.buildingId));
  else list=this.desks().filter(d=>d.assignment).map(d=>{const f=floorOf(d.floorId);const a=d.assignment!;return{kind:'desks' as Kind,id:a.id,version:a.version,isDeleted:false,status:'ACTIVE',primary:a.staffName||'Restricted',secondary:a.deskCode,tertiary:`${a.officeName} · ${a.floorName}${a.zoneName?' · '+a.zoneName:''}`,companyId:f?.companyId,officeId:f?.officeId,buildingId:f?.buildingId,floorId:d.floorId,deskId:d.id,assignment:a,raw:d}})
   .filter(r=>inScope(r.companyId,r.officeId,r.buildingId));
  if(status)list=list.filter(r=>r.status===status);
  if(q)list=list.filter(r=>[r.primary,r.secondary,r.tertiary].some(v=>String(v??'').toLowerCase().includes(q)));
  return list;
 }

 viewOnMap(r:any){void this.router.navigate(['/workplaces/floors',r.floorId,'map'],{queryParams:r.deskId?{deskId:r.deskId}:{}})}

 openCreate(){
  this.editingId.set(null);this.editingVersion=0;this.editingDesk=null;this.formError.set(null);
  this.form.reset({companyId:this.companyFilter()??this.auth.currentUser()?.companyId??null,parentId:this.defaultParent(),name:'',code:'',city:'',country:'',timeZone:'Asia/Calcutta',address:'',displayOrder:this.floors().length,colour:'#64748b',telephoneExtension:'',accessible:false,status:'ACTIVE'});
  this.formVisible=true;
 }
 private defaultParent():number|null{switch(this.tab()){case'buildings':return this.officeFilter()??this.officeOptions()[0]?.value??null;case'floors':return this.buildingFilter()??this.buildingOptions()[0]?.value??null;case'zones':case'desks':return this.floorOptions()[0]?.value??null;default:return null}}

 openEdit(r:any){
  this.editingId.set(r.id);this.editingVersion=r.version;this.formError.set(null);const raw=r.raw;
  this.editingDesk=this.tab()==='desks'?raw as Desk:null;
  this.form.reset({
   companyId:raw.companyId??null,
   parentId:this.tab()==='buildings'?raw.officeId:this.tab()==='floors'?raw.buildingId:(this.tab()==='zones'||this.tab()==='desks')?raw.floorId:null,
   name:this.tab()==='desks'?(raw.displayName||raw.code):raw.name,code:raw.code??'',
   city:raw.city??'',country:raw.country??'',timeZone:raw.timeZone??'Asia/Calcutta',address:raw.address??'',
   displayOrder:raw.displayOrder??0,colour:raw.colour??'#64748b',telephoneExtension:raw.telephoneExtension??'',accessible:raw.accessible??false,status:raw.status??'ACTIVE'});
  this.formVisible=true;
 }

 submit(){
  const v=this.form.getRawValue();const tab=this.tab();const id=this.editingId();
  if(!v.name.trim())return this.formError.set('Name is required.');
  if(tab!=='floors'&&!v.code.trim())return this.formError.set('Code is required.');
  if(tab==='offices'&&v.companyId==null)return this.formError.set('Select a company.');
  if(tab!=='offices'&&v.parentId==null)return this.formError.set(`Select the parent ${tab==='buildings'?'office':tab==='floors'?'building':'floor'}.`);
  this.formError.set(null);this.saving.set(true);
  const done=(message:string)=>{this.saving.set(false);this.formVisible=false;this.messages.add({severity:'success',summary:'Workplace updated',detail:message});this.load()};
  const fail=()=>{this.saving.set(false)};
  const request=this.buildRequest(v,tab,id);
  request.subscribe({next:()=>done(`${this.singular()} ${id?'updated':'created'}.`),error:()=>fail()});
 }

 /** Builds the create or update call for the active tab. Updates carry the version for optimistic locking. */
 private buildRequest(v:any,tab:Tab,id:number|null){
  const status=v.status;
  if(tab==='offices'){const body={companyId:v.companyId,name:v.name.trim(),code:v.code.trim(),city:v.city||null,country:v.country||null,timeZone:v.timeZone.trim(),address:v.address||null,status,version:this.editingVersion};return id?this.api.updateOffice(id,body):this.api.createOffice(body)}
  if(tab==='buildings'){const body={officeId:v.parentId,name:v.name.trim(),code:v.code.trim(),description:null,status,version:this.editingVersion};return id?this.api.updateBuilding(id,body):this.api.createBuilding(body)}
  if(tab==='floors'){const body={buildingId:v.parentId,name:v.name.trim(),displayOrder:Number(v.displayOrder)||0,status,version:this.editingVersion};return id?this.api.updateFloor(id,body):this.api.createFloor(body)}
  if(tab==='zones'){const body={floorId:v.parentId,name:v.name.trim(),code:v.code.trim(),colour:v.colour,description:null,status,version:this.editingVersion};return id?this.api.updateZone(id,body):this.api.createZone(body)}
  // A desk edited from the admin table keeps the geometry the floor-map editor set for it.
  const g=this.editingDesk;
  const body={floorId:v.parentId,zoneId:g?.zoneId??null,code:v.code.trim(),displayName:v.name.trim(),mode:g?.mode??'ASSIGNED',x:g?.x??0,y:g?.y??0,width:g?.width??4,height:g?.height??3,rotation:g?.rotation??0,capacity:g?.capacity??1,telephoneExtension:v.telephoneExtension||null,accessible:v.accessible,equipmentTags:g?.equipmentTags??null,notes:g?.notes??null,status,version:this.editingVersion};
  return id?this.api.updateDesk(id,body):this.api.createDesk(body);
 }

 archive(r:any){
  if(!confirm(`Archive ${r.primary}? It stays in history and can be restored.`))return;
  this.api.archive(r.kind,r.id).subscribe({next:()=>{this.messages.add({severity:'success',summary:'Archived',detail:`${r.primary} archived.`});this.load()},error:()=>undefined});
 }
 restore(r:any){
  if(!confirm(`Restore ${r.primary}?`))return;
  this.api.restore(r.kind,r.id).subscribe({next:()=>{this.messages.add({severity:'success',summary:'Restored',detail:`${r.primary} restored.`});this.load()},error:()=>undefined});
 }
 releaseAssignment(r:any){
  const a=r.assignment;if(!a||!confirm(`Release ${r.primary} from desk ${a.deskCode}?`))return;
  this.api.release(a,new Date().toISOString().slice(0,10),'Released from workplace administration')
   .subscribe({next:()=>{this.messages.add({severity:'success',summary:'Desk released',detail:a.deskCode});this.load()},error:()=>undefined});
 }
}
