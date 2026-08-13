import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { Role } from '../models/enums';
import { UserAdminService } from './user-admin.service';

describe('UserAdminService',()=>{
  let service:UserAdminService;let http:HttpTestingController;const envelope=<T>(data:T)=>({success:true,data,timestamp:new Date().toISOString()});
  beforeEach(()=>{TestBed.configureTestingModule({providers:[UserAdminService,provideHttpClient(),provideHttpClientTesting()]});service=TestBed.inject(UserAdminService);http=TestBed.inject(HttpTestingController)});
  afterEach(()=>http.verify());
  it('sends combined server-side paging search and security filters',async()=>{const result=firstValueFrom(service.list({page:2,size:50,sort:'lastLogin',direction:'desc',search:'alice',companyId:4,departmentId:8,role:Role.MANAGER,active:true,locked:false,includeDeleted:true}));
    const request=http.expectOne((r)=>r.url===`${environment.apiUrl}/users`);expect(request.request.params.get('page')).toBe('2');expect(request.request.params.get('search')).toBe('alice');expect(request.request.params.get('companyId')).toBe('4');expect(request.request.params.get('departmentId')).toBe('8');expect(request.request.params.get('role')).toBe('MANAGER');expect(request.request.params.get('active')).toBe('true');expect(request.request.params.get('locked')).toBe('false');
    request.flush(envelope({content:[],page:2,size:50,totalElements:0,totalPages:1,first:false,last:true,numberOfElements:0,empty:true}));await expect(result).resolves.toMatchObject({page:2,totalElements:0})});
  it('uses dedicated sensitive action endpoints with optimistic versions',async()=>{const status=firstValueFrom(service.status(7,false,3));let request=http.expectOne(`${environment.apiUrl}/users/7/status`);expect(request.request.body).toEqual({isActive:false,version:3});request.flush(envelope({id:7}));await status;
    const role=firstValueFrom(service.role(7,Role.MANAGER,4));request=http.expectOne(`${environment.apiUrl}/users/7/role`);expect(request.request.body).toEqual({role:Role.MANAGER,version:4});request.flush(envelope({id:7}));await role;
    const reset=firstValueFrom(service.resetPassword(7));request=http.expectOne(`${environment.apiUrl}/users/7/password-reset`);expect(request.request.method).toBe('POST');request.flush(envelope(undefined));await reset});
});
