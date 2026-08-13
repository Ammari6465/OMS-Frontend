import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { EntityStatus } from '../../core/models/enums';
import { Department } from '../../core/models/organization.model';
import { DepartmentService } from './department.service';

describe('DepartmentService', () => {
  let service: DepartmentService;
  let http: HttpTestingController;

  const department: Department = {
    id: 8,
    companyId: 2,
    companyName: 'Sunrich Group',
    name: 'Technology',
    description: 'Technology Department',
    status: EntityStatus.ACTIVE,
    version: 3,
    isDeleted: false,
  };
  const envelope = <T>(data: T) => ({ success: true, data, timestamp: new Date().toISOString() });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DepartmentService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DepartmentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists departments with server-side filters and pagination', async () => {
    const result = firstValueFrom(service.list({
      page: 1,
      size: 20,
      search: 'tech',
      status: EntityStatus.ACTIVE,
      companyId: 2,
      includeDeleted: true,
    }));
    const request = http.expectOne((candidate) => candidate.url === `${environment.apiUrl}/departments`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('search')).toBe('tech');
    expect(request.request.params.get('status')).toBe('ACTIVE');
    expect(request.request.params.get('companyId')).toBe('2');
    expect(request.request.params.get('includeDeleted')).toBe('true');
    request.flush(envelope({
      content: [department], page: 1, size: 20, totalElements: 1, totalPages: 1,
      first: false, last: true, numberOfElements: 1, empty: false,
    }));

    await expect(result).resolves.toMatchObject({ content: [department], totalElements: 1 });
  });

  it('sends the optimistic-lock version when updating', async () => {
    const update = {
      companyId: 2,
      name: 'Platform Engineering',
      description: null,
      parentDeptId: null,
      headStaffId: null,
      status: EntityStatus.ACTIVE,
      version: 3,
    };
    const result = firstValueFrom(service.update(8, update));
    const request = http.expectOne(`${environment.apiUrl}/departments/8`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.version).toBe(3);
    request.flush(envelope({ ...department, ...update, version: 4 }));

    await expect(result).resolves.toMatchObject({ name: 'Platform Engineering', version: 4 });
  });
});
