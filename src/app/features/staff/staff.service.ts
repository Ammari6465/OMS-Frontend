import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse, PageResponse } from '../../core/models/api.model';
import { EmploymentType, EntityStatus } from '../../core/models/enums';
import { Staff } from '../../core/models/organization.model';

export type StaffSortField = 'name' | 'employeeCode' | 'title' | 'dateJoined' | 'status' | 'createdAt' | 'updatedAt';

export interface StaffQuery {
  page?: number;
  size?: number;
  sort?: StaffSortField;
  direction?: 'asc' | 'desc';
  search?: string;
  companyId?: number | null;
  departmentId?: number | null;
  positionId?: number | null;
  managerId?: number | null;
  status?: EntityStatus | null;
  employmentType?: EmploymentType | null;
  joinedFrom?: string | null;
  joinedTo?: string | null;
  includeDeleted?: boolean;
}

export interface StaffCreateRequest {
  companyId: number;
  additionalCompanyIds?: number[];
  deptId?: number | null;
  managerId?: number | null;
  positionId?: number | null;
  employeeCode?: string | null;
  name: string;
  title?: string | null;
  empType: EmploymentType;
  email?: string | null;
  landline?: string | null;
  cellNumber?: string | null;
  dateJoined?: string | null;
  dateLeft?: string | null;
  status: EntityStatus;
  photoUrl?: string | null;
}

export interface StaffUpdateRequest extends StaffCreateRequest {
  version: number;
}

/** Dedicated HTTP client for server-side Staff Management. */
@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/staff`;

  list(query: StaffQuery = {}): Observable<PageResponse<Staff>> {
    let params = new HttpParams()
      .set('page', query.page ?? 0)
      .set('size', query.size ?? 20)
      .set('sort', query.sort ?? 'name')
      .set('direction', query.direction ?? 'asc')
      .set('includeDeleted', query.includeDeleted ?? false);
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.companyId != null) params = params.set('companyId', query.companyId);
    if (query.departmentId != null) params = params.set('departmentId', query.departmentId);
    if (query.positionId != null) params = params.set('positionId', query.positionId);
    if (query.managerId != null) params = params.set('managerId', query.managerId);
    if (query.status) params = params.set('status', query.status);
    if (query.employmentType) params = params.set('employmentType', query.employmentType);
    if (query.joinedFrom) params = params.set('joinedFrom', query.joinedFrom);
    if (query.joinedTo) params = params.set('joinedTo', query.joinedTo);
    return this.http.get<ApiResponse<PageResponse<Staff> | Staff[]>>(this.endpoint, { params })
      .pipe(map((response) => this.normalizePage(response.data, query)));
  }

  get(id: number): Observable<Staff> {
    return this.http.get<ApiResponse<Staff>>(`${this.endpoint}/${id}`)
      .pipe(map((response) => response.data));
  }

  create(request: StaffCreateRequest): Observable<Staff> {
    return this.http.post<ApiResponse<Staff>>(this.endpoint, request)
      .pipe(map((response) => response.data));
  }

  update(id: number, request: StaffUpdateRequest): Observable<Staff> {
    return this.http.put<ApiResponse<Staff>>(`${this.endpoint}/${id}`, request)
      .pipe(map((response) => response.data));
  }

  archive(id: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.endpoint}/${id}`).pipe(map(() => void 0));
  }

  restore(id: number): Observable<Staff> {
    return this.http.patch<ApiResponse<Staff>>(`${this.endpoint}/${id}/restore`, {})
      .pipe(map((response) => response.data));
  }

  /** Keeps the screen usable during a rolling deployment from the former array API. */
  private normalizePage(data: PageResponse<Staff> | Staff[], query: StaffQuery): PageResponse<Staff> {
    if (!Array.isArray(data)) return data;
    const size = query.size ?? 20;
    const page = query.page ?? 0;
    const content = data.slice(page * size, page * size + size);
    const totalPages = Math.max(1, Math.ceil(data.length / size));
    return {
      content, page, size, totalElements: data.length, totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
      numberOfElements: content.length,
      empty: content.length === 0,
    };
  }
}
