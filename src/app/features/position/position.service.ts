import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse, PageResponse } from '../../core/models/api.model';
import { Position } from '../../core/models/organization.model';

export type PositionStatus = 'OPEN' | 'FILLED' | 'CLOSED';
export type PositionSortField = 'title' | 'status' | 'createdAt' | 'updatedAt';

export interface PositionQuery {
  page?: number;
  size?: number;
  sort?: PositionSortField;
  direction?: 'asc' | 'desc';
  search?: string;
  companyId?: number | null;
  departmentId?: number | null;
  status?: PositionStatus | null;
  reportsToPositionId?: number | null;
  assigned?: boolean | null;
  vacant?: boolean | null;
  positionId?: number | null;
  includeDeleted?: boolean;
}

export interface PositionCreateRequest {
  companyId: number;
  title: string;
  deptId?: number | null;
  reportsToPositionId?: number | null;
  staffId?: number | null;
  status?: PositionStatus;
}

export interface PositionUpdateRequest extends PositionCreateRequest { version: number; }

@Injectable({ providedIn: 'root' })
export class PositionService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/positions`;

  list(query: PositionQuery = {}): Observable<PageResponse<Position>> {
    let params = new HttpParams()
      .set('page', query.page ?? 0).set('size', query.size ?? 20)
      .set('sort', query.sort ?? 'title').set('direction', query.direction ?? 'asc')
      .set('includeDeleted', query.includeDeleted ?? false);
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.companyId != null) params = params.set('companyId', query.companyId);
    if (query.departmentId != null) params = params.set('departmentId', query.departmentId);
    if (query.status) params = params.set('status', query.status);
    if (query.reportsToPositionId != null) params = params.set('reportsToPositionId', query.reportsToPositionId);
    if (query.assigned != null) params = params.set('assigned', query.assigned);
    if (query.vacant != null) params = params.set('vacant', query.vacant);
    if (query.positionId != null) params = params.set('positionId', query.positionId);
    return this.http.get<ApiResponse<PageResponse<Position> | Position[]>>(this.endpoint, { params })
      .pipe(map((response) => this.normalizePage(response.data, query)));
  }

  get(id: number): Observable<Position> {
    return this.http.get<ApiResponse<Position>>(`${this.endpoint}/${id}`).pipe(map((response) => response.data));
  }
  create(request: PositionCreateRequest): Observable<Position> {
    return this.http.post<ApiResponse<Position>>(this.endpoint, request).pipe(map((response) => response.data));
  }
  update(id: number, request: PositionUpdateRequest): Observable<Position> {
    return this.http.put<ApiResponse<Position>>(`${this.endpoint}/${id}`, request).pipe(map((response) => response.data));
  }
  archive(id: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.endpoint}/${id}`).pipe(map(() => void 0));
  }
  restore(id: number): Observable<Position> {
    return this.http.patch<ApiResponse<Position>>(`${this.endpoint}/${id}/restore`, {}).pipe(map((response) => response.data));
  }

  vacancySummary(companyId?: number | null): Observable<{ total: number; open: number; filled: number; closed: number }> {
    const params = companyId == null ? undefined : new HttpParams().set('companyId', companyId);
    return this.http.get<ApiResponse<{ total: number; open: number; filled: number; closed: number }>>(
      `${environment.apiUrl}/vacancies/summary`, { params },
    ).pipe(map((response) => response.data));
  }

  private normalizePage(data: PageResponse<Position> | Position[], query: PositionQuery): PageResponse<Position> {
    if (!Array.isArray(data)) return data;
    const size = query.size ?? 20;
    const page = query.page ?? 0;
    const content = data.slice(page * size, page * size + size);
    const totalPages = Math.max(1, Math.ceil(data.length / size));
    return { content, page, size, totalElements: data.length, totalPages, first: page === 0,
      last: page >= totalPages - 1, numberOfElements: content.length, empty: content.length === 0 };
  }
}
