import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { EmploymentType, EntityStatus } from '../../core/models/enums';
import { Staff } from '../../core/models/organization.model';
import { StaffService } from './staff.service';

describe('StaffService', () => {
  let service: StaffService;
  let http: HttpTestingController;

  const staff: Staff = {
    id: 12,
    companyId: 2,
    companyName: 'Sunrich Group',
    deptId: 4,
    departmentName: 'Technology',
    managerId: 7,
    managerName: 'Jane Manager',
    positionId: 9,
    positionTitle: 'Developer',
    employeeCode: 'EMP012',
    name: 'John Employee',
    title: 'Developer',
    empType: EmploymentType.PERMANENT,
    email: 'john@example.com',
    status: EntityStatus.ACTIVE,
    version: 3,
    isDeleted: false,
  };
  const envelope = <T>(data: T) => ({ success: true, data, timestamp: new Date().toISOString() });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StaffService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StaffService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists staff with server-side pagination, search, filters, and sorting', async () => {
    const result = firstValueFrom(service.list({
      page: 1,
      size: 20,
      sort: 'employeeCode',
      direction: 'desc',
      search: 'john',
      companyId: 2,
      departmentId: 4,
      positionId: 9,
      managerId: 7,
      status: EntityStatus.ACTIVE,
      employmentType: EmploymentType.PERMANENT,
      joinedFrom: '2024-01-01',
      joinedTo: '2024-12-31',
      includeDeleted: true,
    }));
    const request = http.expectOne((candidate) => candidate.url === `${environment.apiUrl}/staff`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('sort')).toBe('employeeCode');
    expect(request.request.params.get('direction')).toBe('desc');
    expect(request.request.params.get('search')).toBe('john');
    expect(request.request.params.get('companyId')).toBe('2');
    expect(request.request.params.get('departmentId')).toBe('4');
    expect(request.request.params.get('positionId')).toBe('9');
    expect(request.request.params.get('managerId')).toBe('7');
    expect(request.request.params.get('status')).toBe('ACTIVE');
    expect(request.request.params.get('employmentType')).toBe('PERMANENT');
    expect(request.request.params.get('joinedFrom')).toBe('2024-01-01');
    expect(request.request.params.get('joinedTo')).toBe('2024-12-31');
    expect(request.request.params.get('includeDeleted')).toBe('true');
    request.flush(envelope({
      content: [staff], page: 1, size: 20, totalElements: 1, totalPages: 1,
      first: false, last: true, numberOfElements: 1, empty: false,
    }));

    await expect(result).resolves.toMatchObject({ content: [staff], totalElements: 1 });
  });

  it('sends the optimistic lock version and organisational links when updating', async () => {
    const update = {
      companyId: 2,
      deptId: 4,
      managerId: 7,
      positionId: 9,
      employeeCode: 'EMP012',
      name: 'John Employee',
      title: 'Senior Developer',
      empType: EmploymentType.PERMANENT,
      email: 'john@example.com',
      status: EntityStatus.ACTIVE,
      version: 3,
    };
    const result = firstValueFrom(service.update(12, update));
    const request = http.expectOne(`${environment.apiUrl}/staff/12`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.version).toBe(3);
    expect(request.request.body.positionId).toBe(9);
    expect(request.request.body.managerId).toBe(7);
    request.flush(envelope({ ...staff, ...update, version: 4 }));

    await expect(result).resolves.toMatchObject({ title: 'Senior Developer', version: 4 });
  });
});
