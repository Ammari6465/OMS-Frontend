import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Observable, forkJoin, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse, PageResponse } from '../models/api.model';
import { AppNotification, NotificationSummary } from '../models/system.model';
import { AuthService } from '../services/auth.service';

export interface NotificationQuery { page?:number; size?:number; search?:string; category?:string; priority?:string; read?:boolean; from?:string; to?:string; }

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http=inject(HttpClient); private readonly auth=inject(AuthService); private readonly zone=inject(NgZone); private readonly messages=inject(MessageService);
  private readonly endpoint=`${environment.apiUrl}/notifications`; private abort?:AbortController; private retry?:number; private readonly seen=new Set<number>();
  readonly items=signal<AppNotification[]>([]); readonly summary=signal<NotificationSummary>({total:0,unread:0,today:0});
  readonly unread=computed(()=>this.summary().unread); readonly connected=signal(false);

  init():Observable<void>{return forkJoin([this.loadRecent(),this.refreshSummary()]).pipe(tap(()=>this.connect()),map(()=>void 0));}
  list(q:NotificationQuery={}):Observable<PageResponse<AppNotification>>{let p=new HttpParams();Object.entries(q).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')p=p.set(k,String(v));});return this.http.get<ApiResponse<PageResponse<AppNotification>>>(this.endpoint,{params:p}).pipe(map(r=>r.data));}
  loadRecent():Observable<PageResponse<AppNotification>>{return this.list({page:0,size:8}).pipe(tap(p=>this.items.set(p.content)));}
  refreshSummary():Observable<NotificationSummary>{return this.http.get<ApiResponse<NotificationSummary>>(`${this.endpoint}/summary`).pipe(map(r=>r.data),tap(s=>this.summary.set(s)));}
  get(id:number):Observable<AppNotification>{return this.http.get<ApiResponse<AppNotification>>(`${this.endpoint}/${id}`).pipe(map(r=>r.data));}
  setRead(id:number,isRead:boolean):Observable<AppNotification>{return this.http.patch<ApiResponse<AppNotification>>(`${this.endpoint}/${id}/read`,{isRead}).pipe(map(r=>r.data),tap(n=>{this.items.update(xs=>xs.map(x=>x.id===id?n:x));this.summary.update(s=>({...s,unread:Math.max(0,s.unread+(isRead?-1:1))}));}));}
  markRead(id:number):void{const n=this.items().find(x=>x.id===id);if(n?.isRead)return;this.setRead(id,true).subscribe();}
  markAllRead():void{this.http.patch<ApiResponse<NotificationSummary>>(`${this.endpoint}/read-all`,{}).pipe(map(r=>r.data)).subscribe(s=>{this.summary.set(s);this.items.update(xs=>xs.map(x=>({...x,isRead:true,readAt:new Date().toISOString()})));});}
  remove(id:number):void{this.http.delete<ApiResponse<void>>(`${this.endpoint}/${id}`).subscribe(()=>{this.items.update(xs=>xs.filter(x=>x.id!==id));this.refreshSummary().subscribe();});}
  open(n:AppNotification):string|null{this.markRead(n.id);return this.safeLink(n.link);}
  private safeLink(link?:string|null):string|null{return link?.startsWith('/')&&!link.startsWith('//')?link:null;}
  private connect():void{if(!this.auth.token||this.abort)return;this.abort=new AbortController();void this.readStream(this.abort.signal);}
  private async readStream(signal:AbortSignal):Promise<void>{try{const response=await fetch(`${this.endpoint}/stream`,{headers:{Authorization:`Bearer ${this.auth.token}`},signal});if(!response.ok||!response.body)throw new Error('stream unavailable');this.zone.run(()=>this.connected.set(true));const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(!signal.aborted){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const events=buffer.split('\n\n');buffer=events.pop()??'';for(const event of events){const data=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(data&&data!=='ok'){try{this.accept(JSON.parse(data) as AppNotification);}catch{}}}}}catch{}finally{this.zone.run(()=>this.connected.set(false));this.abort=undefined;if(!signal.aborted)this.retry=window.setTimeout(()=>this.connect(),5000);}}
  private accept(n:AppNotification):void{this.zone.run(()=>{if(this.seen.has(n.id)||this.items().some(x=>x.id===n.id))return;this.seen.add(n.id);this.items.update(xs=>[n,...xs].slice(0,8));this.summary.update(s=>({...s,total:s.total+1,unread:s.unread+(!n.isRead?1:0),today:s.today+1}));this.messages.add({severity:n.priority==='HIGH'?'warn':'info',summary:n.title,detail:n.message,life:5000,key:'global'});});}
}
