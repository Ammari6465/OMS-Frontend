import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { Position } from '../../core/models/organization.model';
import { PositionService } from './position.service';

describe('PositionService', () => {
  let service: PositionService;
  let http: HttpTestingController;
  const position: Position = { id: 9, companyId: 2, companyName: 'Sunrich', deptId: 4,
    departmentName: 'Engineering', reportsToPositionId: 3, reportsToPositionTitle: 'Director',
    title: 'Manager', isVacant: true, staffId: null, status: 'OPEN', version: 2, isDeleted: false };
  const envelope = <T>(data:T) => ({ success:true, data, timestamp:new Date().toISOString() });

  beforeEach(() => { TestBed.configureTestingModule({providers:[PositionService,provideHttpClient(),provideHttpClientTesting()]});
    service=TestBed.inject(PositionService);http=TestBed.inject(HttpTestingController); });
  afterEach(() => http.verify());

  it('sends server-side pagination search sorting and combined position filters', async () => {
    const result=firstValueFrom(service.list({page:1,size:20,sort:'updatedAt',direction:'desc',search:'manager',companyId:2,
      departmentId:4,status:'OPEN',reportsToPositionId:3,assigned:false,vacant:true,includeDeleted:true}));
    const request=http.expectOne((candidate)=>candidate.url===`${environment.apiUrl}/positions`);
    expect(request.request.params.get('page')).toBe('1');expect(request.request.params.get('sort')).toBe('updatedAt');
    expect(request.request.params.get('search')).toBe('manager');expect(request.request.params.get('companyId')).toBe('2');
    expect(request.request.params.get('departmentId')).toBe('4');expect(request.request.params.get('status')).toBe('OPEN');
    expect(request.request.params.get('reportsToPositionId')).toBe('3');expect(request.request.params.get('assigned')).toBe('false');
    expect(request.request.params.get('vacant')).toBe('true');expect(request.request.params.get('includeDeleted')).toBe('true');
    request.flush(envelope({content:[position],page:1,size:20,totalElements:1,totalPages:1,first:false,last:true,numberOfElements:1,empty:false}));
    await expect(result).resolves.toMatchObject({content:[position],totalElements:1});
  });

  it('loads company-scoped vacancy summary statistics', async () => {
    const result=firstValueFrom(service.vacancySummary(2));
    const request=http.expectOne((candidate)=>candidate.url===`${environment.apiUrl}/vacancies/summary`);
    expect(request.request.params.get('companyId')).toBe('2');
    request.flush(envelope({total:12,open:5,filled:4,closed:3}));
    await expect(result).resolves.toEqual({total:12,open:5,filled:4,closed:3});
  });

  it('sends hierarchy and optimistic lock data when updating', async () => {
    const update={companyId:2,title:'Senior Manager',deptId:4,reportsToPositionId:3,staffId:null,status:'OPEN' as const,version:2};
    const result=firstValueFrom(service.update(9,update));const request=http.expectOne(`${environment.apiUrl}/positions/9`);
    expect(request.request.method).toBe('PUT');expect(request.request.body.reportsToPositionId).toBe(3);expect(request.request.body.version).toBe(2);
    request.flush(envelope({...position,...update,version:3}));await expect(result).resolves.toMatchObject({title:'Senior Manager',version:3});
  });
});
