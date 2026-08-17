import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PageResponse } from '../../core/models/api.model';

export type LifecycleType='JOINER'|'MOVER'|'LEAVER';
export type WorkflowStatus='DRAFT'|'PENDING_APPROVAL'|'APPROVED'|'REJECTED'|'SCHEDULED'|'IN_PROGRESS'|'COMPLETED'|'FAILED'|'CANCELLED';
export type PositionDisposition='OPEN'|'ON_HOLD'|'CLOSE';
export interface LifecycleRequest { type:LifecycleType;staffId?:number|null;companyId:number;effectiveDate:string;subtype?:string|null;reason?:string|null;notes?:string|null;positionDisposition?:PositionDisposition|null;successorManagerId?:number|null;replacementHeadId?:number|null;responsibilitiesAcknowledged?:boolean;targetCompanyId?:number|null;targetDepartmentId?:number|null;targetPositionId?:number|null;targetManagerId?:number|null;targetTitle?:string|null;joinerName?:string|null;joinerEmployeeCode?:string|null;joinerEmail?:string|null;joinerPhone?:string|null;joinerEmploymentType?:string|null;createUser?:boolean;userRole?:string|null; }
export interface LifecycleTask {id:number;title:string;description?:string;category?:string;dueDate?:string;required:boolean;status:'PENDING'|'COMPLETED'|'WAIVED';completionNotes?:string;}
export interface ExecutionLog {id:number;attemptedAt:string;result:'SUCCEEDED'|'FAILED';completedSteps?:string;failedStep?:string;safeErrorMessage?:string;}
export interface LifecycleWorkflow extends LifecycleRequest {id:number;version:number;workflowNumber:string;status:WorkflowStatus;staffName?:string;companyName:string;rejectionReason?:string;failureReason?:string;requestedByName?:string;submittedByName?:string;decisionByName?:string;createdAt:string;submittedAt?:string;decisionAt?:string;completedAt?:string;tasks:LifecycleTask[];executionHistory:ExecutionLog[];}
export interface LifecycleSummary {draft:number;pendingApproval:number;scheduled:number;failed:number;}

@Injectable({providedIn:'root'}) export class LifecycleService {
 private readonly http=inject(HttpClient);private readonly url=`${environment.apiUrl}/lifecycle-workflows`;
 list(query:{page?:number;size?:number;type?:LifecycleType|null;status?:WorkflowStatus|null;companyId?:number|null;staffId?:number|null}={}){let p=new HttpParams().set('page',query.page??0).set('size',query.size??20).set('sort','createdAt').set('direction','desc');if(query.type)p=p.set('type',query.type);if(query.status)p=p.set('status',query.status);if(query.companyId!=null)p=p.set('companyId',query.companyId);if(query.staffId!=null)p=p.set('staffId',query.staffId);return this.http.get<ApiResponse<PageResponse<LifecycleWorkflow>>>(this.url,{params:p}).pipe(map(r=>r.data));}
 summary(){return this.http.get<ApiResponse<LifecycleSummary>>(`${this.url}/summary`).pipe(map(r=>r.data));}
 get(id:number){return this.http.get<ApiResponse<LifecycleWorkflow>>(`${this.url}/${id}`).pipe(map(r=>r.data));}
 create(body:LifecycleRequest){return this.http.post<ApiResponse<LifecycleWorkflow>>(this.url,body).pipe(map(r=>r.data));}
 submit(w:LifecycleWorkflow){return this.action(w,'submit');} approve(w:LifecycleWorkflow){return this.action(w,'approve');} cancel(w:LifecycleWorkflow){return this.action(w,'cancel');}
 execute(w:LifecycleWorkflow){return this.http.post<ApiResponse<LifecycleWorkflow>>(`${this.url}/${w.id}/execute`,{}).pipe(map(r=>r.data));}
 reject(w:LifecycleWorkflow,reason:string){return this.http.post<ApiResponse<LifecycleWorkflow>>(`${this.url}/${w.id}/reject`,{reason},{params:new HttpParams().set('version',w.version)}).pipe(map(r=>r.data));}
 task(w:LifecycleWorkflow,t:LifecycleTask,status:LifecycleTask['status']){return this.http.patch<ApiResponse<LifecycleTask>>(`${this.url}/${w.id}/tasks/${t.id}`,{status}).pipe(map(r=>r.data));}
 private action(w:LifecycleWorkflow,name:string){return this.http.post<ApiResponse<LifecycleWorkflow>>(`${this.url}/${w.id}/${name}`,{version:w.version}).pipe(map(r=>r.data));}
}
