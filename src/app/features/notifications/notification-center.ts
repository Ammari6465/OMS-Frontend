import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

import { NotificationQuery, NotificationService } from '../../core/data/notification.service';
import { AppNotification } from '../../core/models/system.model';
import { relativeTime } from '../../core/util/time';

@Component({selector:'app-notification-center',imports:[DatePipe,FormsModule,ButtonModule,DialogModule,InputTextModule,SelectModule],template:`
<div class="oms-page">
 <div class="oms-page-header"><div><h1 class="oms-page-title">Notifications</h1><p class="oms-page-subtitle">{{notify.unread()}} unread · {{total()}} total</p></div><p-button label="Mark all read" icon="pi pi-check" severity="secondary" [outlined]="true" [disabled]="!notify.unread()" (onClick)="markAll()"/></div>
 <div class="toolbar oms-surface-card">
  <span class="search"><i class="pi pi-search"></i><input pInputText [(ngModel)]="search" (ngModelChange)="searchChanged()" placeholder="Search notifications" aria-label="Search notifications"/></span>
  <p-select [(ngModel)]="category" [options]="categories" optionLabel="label" optionValue="value" (onChange)="reload()" ariaLabel="Category"/>
  <p-select [(ngModel)]="priority" [options]="priorities" optionLabel="label" optionValue="value" (onChange)="reload()" ariaLabel="Priority"/>
 </div>
 <div class="tabs"><button [class.active]="readFilter==='all'" (click)="setRead('all')">All</button><button [class.active]="readFilter==='unread'" (click)="setRead('unread')">Unread</button><button [class.active]="readFilter==='read'" (click)="setRead('read')">Read</button></div>
 <div class="oms-surface-card list-card">
 @if(loading()){<div class="state"><i class="pi pi-spin pi-spinner"></i> Loading notifications…</div>}
 @for(n of items();track n.id){<article class="notif" [class.unread]="!n.isRead" [class.high]="n.priority==='HIGH'" (click)="show(n)">
   <span class="icon" [style.color]="n.color" [style.background]="tint(n.color)"><i [class]="n.icon"></i></span><div class="body"><div class="title">{{n.title}} @if(!n.isRead){<span class="dot"></span>} @if(n.priority==='HIGH'){<span class="priority">High</span>}</div><p>{{n.message}}</p><small>{{rel(n.createdAt)}} · {{n.category}}</small></div>
   <button class="action" (click)="toggleRead($event,n)" [attr.aria-label]="n.isRead?'Mark unread':'Mark read'"><i [class]="n.isRead?'pi pi-envelope':'pi pi-check'"></i></button>
 </article>}@empty{@if(!loading()){<div class="state"><i class="pi pi-bell"></i><strong>{{readFilter==='unread'?"You're all caught up":'No notifications found'}}</strong><span>Important organisational activity will appear here.</span></div>}}
 </div>
 @if(totalPages()>1){<div class="pager"><p-button icon="pi pi-chevron-left" [text]="true" [disabled]="page()===0" (onClick)="go(page()-1)"/><span>Page {{page()+1}} of {{totalPages()}}</span><p-button icon="pi pi-chevron-right" [text]="true" [disabled]="page()+1>=totalPages()" (onClick)="go(page()+1)"/></div>}
</div>
<p-dialog header="Notification details" [(visible)]="detailOpen" [modal]="true" [style]="{width:'92%','max-width':'560px'}"><ng-template #content>@if(selected();as n){<div class="detail"><span class="priority-pill">{{n.priority}} · {{n.category}}</span><h2>{{n.title}}</h2><p>{{n.message}}</p><small>{{n.createdAt | date:'medium'}}</small>@if(n.link){<p-button label="Open related record" icon="pi pi-arrow-right" iconPos="right" (onClick)="follow(n)"/>}</div>}</ng-template></p-dialog>
`,styles:[`
.toolbar{padding:.75rem;display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:.8rem}.search{display:flex;align-items:center;gap:.5rem;flex:1;min-width:220px}.search input{width:100%}.tabs{display:flex;gap:.45rem;margin-bottom:.8rem}.tabs button{border:1px solid var(--p-content-border-color);background:transparent;color:var(--p-text-muted-color);padding:.4rem .9rem;border-radius:999px;cursor:pointer}.tabs button.active{background:var(--p-primary-color);color:#fff}.list-card{padding:.5rem}.notif{display:flex;gap:.9rem;padding:.9rem 1rem;border-radius:10px;cursor:pointer;position:relative}.notif:hover{background:var(--oms-hover-bg)}.notif.unread{background:color-mix(in srgb,var(--p-primary-color) 8%,transparent)}.notif.high{border-left:3px solid #f59e0b}.icon{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;flex:none}.body{flex:1;min-width:0}.title{font-weight:650;display:flex;gap:.45rem;align-items:center}.body p{margin:.2rem 0;color:var(--p-text-muted-color)}small{color:var(--p-text-muted-color)}.dot{width:8px;height:8px;background:var(--p-primary-color);border-radius:50%}.priority,.priority-pill{font-size:.68rem;color:#b45309;background:#fef3c7;padding:.12rem .4rem;border-radius:999px}.action{border:0;background:transparent;color:var(--p-text-muted-color);cursor:pointer}.state{min-height:220px;display:flex;flex-direction:column;gap:.5rem;align-items:center;justify-content:center;color:var(--p-text-muted-color)}.state i{font-size:1.5rem}.pager{display:flex;justify-content:center;align-items:center;gap:.6rem;margin-top:.8rem}.detail{display:flex;flex-direction:column;align-items:flex-start;gap:.8rem}.detail h2,.detail p{margin:0}.detail p{line-height:1.6}@media(max-width:600px){.oms-page-header{align-items:flex-start}.notif{padding:.8rem}.toolbar>*{width:100%}}
`]})
export class NotificationCenter implements OnInit{
 readonly notify=inject(NotificationService);private router=inject(Router);readonly items=signal<AppNotification[]>([]);readonly total=signal(0);readonly totalPages=signal(0);readonly page=signal(0);readonly loading=signal(false);readonly selected=signal<AppNotification|null>(null);detailOpen=false;search='';category='ALL';priority='ALL';readFilter:'all'|'unread'|'read'='all';private timer?:number;
 categories=[{label:'All categories',value:'ALL'},{label:'Workforce',value:'WORKFORCE'},{label:'Organisation',value:'ORGANIZATION'},{label:'Vacancies',value:'VACANCY'},{label:'System',value:'SYSTEM'}];priorities=[{label:'All priorities',value:'ALL'},{label:'High priority',value:'HIGH'},{label:'Normal priority',value:'NORMAL'}];
 ngOnInit(){this.reload()} reload(){this.loading.set(true);const q:NotificationQuery={page:this.page(),size:20,search:this.search,category:this.category,priority:this.priority,read:this.readFilter==='all'?undefined:this.readFilter==='read'};this.notify.list(q).subscribe({next:p=>{this.items.set(p.content);this.total.set(p.totalElements);this.totalPages.set(p.totalPages);this.loading.set(false)},error:()=>this.loading.set(false)})} searchChanged(){clearTimeout(this.timer);this.timer=window.setTimeout(()=>{this.page.set(0);this.reload()},300)} setRead(v:'all'|'unread'|'read'){this.readFilter=v;this.page.set(0);this.reload()} go(p:number){this.page.set(p);this.reload()} show(n:AppNotification){this.selected.set(n);this.detailOpen=true;if(!n.isRead)this.notify.setRead(n.id,true).subscribe(u=>this.items.update(xs=>xs.map(x=>x.id===u.id?u:x)))} toggleRead(e:Event,n:AppNotification){e.stopPropagation();this.notify.setRead(n.id,!n.isRead).subscribe(u=>this.items.update(xs=>xs.map(x=>x.id===u.id?u:x)))} markAll(){this.notify.markAllRead();this.items.update(xs=>xs.map(x=>({...x,isRead:true})));} follow(n:AppNotification){const link=this.notify.open(n);if(link){this.detailOpen=false;void this.router.navigateByUrl(link)}} rel(v:string){return relativeTime(v)} tint(c:string){return `color-mix(in srgb, ${c} 16%, transparent)`}
}
