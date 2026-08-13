import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse, PageResponse } from '../../core/models/api.model';
import { EntityStatus } from '../../core/models/enums';
import { Department } from '../../core/models/organization.model';

export interface DepartmentQuery {
  page?: number;
  size?: number;
  sort?: 'name' | 'status' | 'createdAt' | 'updatedAt';
  direction?: 'asc' | 'desc';
  search?: string;
  status?: EntityStatus | null;
  companyId?: number | null;
  includeDeleted?: boolean;
}

export interface DepartmentCreateRequest {
  companyId: number;
  name: string;
  description?: string | null;
  parentDeptId?: number | null;
  headStaffId?: number | null;
  status: EntityStatus;
}

export interface DepartmentUpdateRequest extends DepartmentCreateRequest {
  version: number;
}

/** Dedicated API client for the production Department Management module. */
@Injectable({ providedIn: 'root' })
export class DepartmentService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/departments`;

  list(query: DepartmentQuery = {}): Observable<PageResponse<Department>> {
    let params = new HttpParams()
      .set('page', query.page ?? 0)
      .set('size', query.size ?? 20)
      .set('sort', query.sort ?? 'name')
      .set('direction', query.direction ?? 'asc')
      .set('includeDeleted', query.includeDeleted ?? false);
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.status) params = params.set('status', query.status);
    if (query.companyId != null) params = params.set('companyId', query.companyId);
    return this.http.get<ApiResponse<PageResponse<Department> | Department[]>>(this.endpoint, { params })
      .pipe(map((response) => this.normalizePage(response.data, query)));
  }

  get(id: number): Observable<Department> {
    return this.http.get<ApiResponse<Department>>(`${this.endpoint}/${id}`)
      .pipe(map((response) => response.data));
  }

  create(request: DepartmentCreateRequest): Observable<Department> {
    return this.http.post<ApiResponse<Department>>(this.endpoint, request)
      .pipe(map((response) => response.data));
  }

  update(id: number, request: DepartmentUpdateRequest): Observable<Department> {
    return this.http.put<ApiResponse<Department>>(`${this.endpoint}/${id}`, request)
      .pipe(map((response) => response.data));
  }

  archive(id: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.endpoint}/${id}`).pipe(map(() => void 0));
  }

  restore(id: number): Observable<Department> {
    return this.http.patch<ApiResponse<Department>>(`${this.endpoint}/${id}/restore`, {})
      .pipe(map((response) => response.data));
  }

  /** Keeps the UI usable during a rolling deployment from the former list-only API. */
  private normalizePage(
    data: PageResponse<Department> | Department[],
    query: DepartmentQuery,
  ): PageResponse<Department> {
    if (!Array.isArray(data)) return data;
    const size = query.size ?? 20;
    const page = query.page ?? 0;
    const content = data.slice(page * size, page * size + size);
    const totalPages = Math.max(1, Math.ceil(data.length / size));
    return {
      content,
      page,
      size,
      totalElements: data.length,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
      numberOfElements: content.length,
      empty: content.length === 0,
    };
  }
}
