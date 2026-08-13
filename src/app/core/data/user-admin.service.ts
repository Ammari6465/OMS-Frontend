import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse, PageResponse } from '../models/api.model';
import { Role } from '../models/enums';
import { AppUser } from '../models/system.model';

export interface UserQuery {
  page?: number; size?: number; sort?: string; direction?: 'asc' | 'desc'; search?: string;
  role?: Role | null; companyId?: number | null; departmentId?: number | null;
  active?: boolean | null; locked?: boolean | null; includeDeleted?: boolean;
}
export interface UserSummary { total: number; active: number; inactive: number; locked: number; administrators: number; }
export interface RoleInfo { role: Role; description: string; accessLevel: string; permissions: string[]; assignedUsers: number; }
export interface UserCreateRequest { username: string; fullName: string; email: string; password: string; role: Role; companyId: number | null; staffId: number | null; isActive: boolean; }
export type UserUpdateRequest = Omit<UserCreateRequest, 'password'> & { version: number };

@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/users`;

  list(query: UserQuery = {}): Observable<PageResponse<AppUser>> {
    let params = new HttpParams().set('page', query.page ?? 0).set('size', query.size ?? 20)
      .set('sort', query.sort ?? 'fullName').set('direction', query.direction ?? 'asc')
      .set('includeDeleted', query.includeDeleted ?? false);
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.role) params = params.set('role', query.role);
    if (query.companyId != null) params = params.set('companyId', query.companyId);
    if (query.departmentId != null) params = params.set('departmentId', query.departmentId);
    if (query.active != null) params = params.set('active', query.active);
    if (query.locked != null) params = params.set('locked', query.locked);
    return this.http.get<ApiResponse<PageResponse<AppUser>>>(this.endpoint, { params }).pipe(map((r) => r.data));
  }
  get(id: number): Observable<AppUser> { return this.http.get<ApiResponse<AppUser>>(`${this.endpoint}/${id}`).pipe(map((r) => r.data)); }
  summary(companyId?: number | null): Observable<UserSummary> {
    const params = companyId == null ? undefined : new HttpParams().set('companyId', companyId);
    return this.http.get<ApiResponse<UserSummary>>(`${this.endpoint}/summary`, { params }).pipe(map((r) => r.data));
  }
  roles(companyId?: number | null): Observable<RoleInfo[]> {
    const params = companyId == null ? undefined : new HttpParams().set('companyId', companyId);
    return this.http.get<ApiResponse<RoleInfo[]>>(`${this.endpoint}/roles`, { params }).pipe(map((r) => r.data));
  }
  create(request: UserCreateRequest): Observable<AppUser> { return this.http.post<ApiResponse<AppUser>>(this.endpoint, request).pipe(map((r) => r.data)); }
  update(id: number, request: UserUpdateRequest): Observable<AppUser> { return this.http.put<ApiResponse<AppUser>>(`${this.endpoint}/${id}`, request).pipe(map((r) => r.data)); }
  status(id: number, isActive: boolean, version: number): Observable<AppUser> { return this.http.patch<ApiResponse<AppUser>>(`${this.endpoint}/${id}/status`, { isActive, version }).pipe(map((r) => r.data)); }
  role(id: number, role: Role, version: number): Observable<AppUser> { return this.http.patch<ApiResponse<AppUser>>(`${this.endpoint}/${id}/role`, { role, version }).pipe(map((r) => r.data)); }
  unlock(id: number, version: number): Observable<AppUser> { return this.http.patch<ApiResponse<AppUser>>(`${this.endpoint}/${id}/unlock`, { version }).pipe(map((r) => r.data)); }
  resetPassword(id: number): Observable<void> { return this.http.post<ApiResponse<void>>(`${this.endpoint}/${id}/password-reset`, {}).pipe(map(() => void 0)); }
  archive(id: number): Observable<void> { return this.http.delete<ApiResponse<void>>(`${this.endpoint}/${id}`).pipe(map(() => void 0)); }
  restore(id: number, version: number): Observable<AppUser> { return this.http.patch<ApiResponse<AppUser>>(`${this.endpoint}/${id}/restore`, { version }).pipe(map((r) => r.data)); }
}
