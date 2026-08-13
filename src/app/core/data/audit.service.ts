import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PageResponse } from '../models/api.model';
import { Role } from '../models/enums';

export type AuditAction = 'CREATE'|'UPDATE'|'DELETE'|'RESTORE'|'TRANSFER'|'REPARENT'|'LOGIN'|'LOGIN_FAILED'|'LOGOUT'|'PASSWORD_CHANGE'|'PASSWORD_RESET'|'IMPORT';
export interface AuditEvent { id:number;actorId:number;actorName:string;actorUsername:string;actorEmail:string;actorRole:Role;action:AuditAction;module:string;entityType:string;entityId:number|null;companyId:number|null;staffId:number|null;description:string;beforeValue:string|null;afterValue:string|null;status:'SUCCESS'|'FAILED';timestamp:string; }
export interface AuditSummary { totalEvents:number;todayEvents:number;successfulActions:number;failedActions:number;securityEvents:number; }
export interface AuditQuery { page?:number;size?:number;sort?:'timestamp'|'user'|'action'|'module';direction?:'asc'|'desc';search?:string;action?:AuditAction|null;module?:string|null;userId?:number|null;role?:Role|null;companyId?:number|null;result?:'SUCCESS'|'FAILED'|null;from?:string|null;to?:string|null; }

@Injectable({providedIn:'root'})
export class AuditService {
  private readonly http=inject(HttpClient);private readonly endpoint=`${environment.apiUrl}/audit-logs`;
  list(query:AuditQuery={}):Observable<PageResponse<AuditEvent>>{return this.http.get<ApiResponse<PageResponse<AuditEvent>>>(this.endpoint,{params:this.params(query)}).pipe(map((r)=>r.data))}
  get(id:number):Observable<AuditEvent>{return this.http.get<ApiResponse<AuditEvent>>(`${this.endpoint}/${id}`).pipe(map((r)=>r.data))}
  summary(companyId?:number|null):Observable<AuditSummary>{const params=companyId==null?undefined:new HttpParams().set('companyId',companyId);return this.http.get<ApiResponse<AuditSummary>>(`${this.endpoint}/summary`,{params}).pipe(map((r)=>r.data))}
  export(query:AuditQuery={}):Observable<Blob>{return this.http.get(`${this.endpoint}/export`,{params:this.params(query,false),responseType:'blob'})}
  private params(q:AuditQuery,paged=true){let p=new HttpParams();if(paged)p=p.set('page',q.page??0).set('size',q.size??20).set('sort',q.sort??'timestamp').set('direction',q.direction??'desc');
    if(q.search?.trim())p=p.set('search',q.search.trim());if(q.action)p=p.set('action',q.action);if(q.module)p=p.set('module',q.module);if(q.userId!=null)p=p.set('userId',q.userId);if(q.role)p=p.set('role',q.role);if(q.companyId!=null)p=p.set('companyId',q.companyId);if(q.result)p=p.set('result',q.result);if(q.from)p=p.set('from',q.from);if(q.to)p=p.set('to',q.to);return p}
}
