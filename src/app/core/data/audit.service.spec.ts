import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { environment } from '../../../environments/environment';
import { Role } from '../models/enums';
import { AuditService } from './audit.service';

describe('AuditService',()=>{let service:AuditService;let http:HttpTestingController;const envelope=<T>(data:T)=>({success:true,data,timestamp:new Date().toISOString()});
beforeEach(()=>{TestBed.configureTestingModule({providers:[AuditService,provideHttpClient(),provideHttpClientTesting()]});service=TestBed.inject(AuditService);http=TestBed.inject(HttpTestingController)});afterEach(()=>http.verify());
it('sends server-side pagination sorting search and combined investigation filters',async()=>{const result=firstValueFrom(service.list({page:1,size:50,sort:'user',direction:'asc',search:'alice',action:'UPDATE',module:'Staff',role:Role.COMPANY_ADMIN,companyId:4,result:'SUCCESS',from:'2026-08-01T00:00:00',to:'2026-08-14T00:00:00'}));const req=http.expectOne((r)=>r.url===`${environment.apiUrl}/audit-logs`);expect(req.request.params.get('page')).toBe('1');expect(req.request.params.get('search')).toBe('alice');expect(req.request.params.get('action')).toBe('UPDATE');expect(req.request.params.get('companyId')).toBe('4');expect(req.request.params.get('from')).toBe('2026-08-01T00:00:00');req.flush(envelope({content:[],page:1,size:50,totalElements:0,totalPages:1,first:false,last:true,numberOfElements:0,empty:true}));await expect(result).resolves.toMatchObject({page:1})});
it('uses read-only detail summary and filtered CSV endpoints',async()=>{const summary=firstValueFrom(service.summary(4));let req=http.expectOne((r)=>r.url===`${environment.apiUrl}/audit-logs/summary`);expect(req.request.params.get('companyId')).toBe('4');req.flush(envelope({totalEvents:2,todayEvents:1,successfulActions:2,failedActions:0,securityEvents:1}));await summary;const detail=firstValueFrom(service.get(9));req=http.expectOne(`${environment.apiUrl}/audit-logs/9`);expect(req.request.method).toBe('GET');req.flush(envelope({id:9}));await detail;const csv=firstValueFrom(service.export({module:'Users & Roles',companyId:4}));req=http.expectOne((r)=>r.url===`${environment.apiUrl}/audit-logs/export`);expect(req.request.params.get('module')).toBe('Users & Roles');expect(req.request.responseType).toBe('blob');req.flush(new Blob(['audit']));await csv});
});
