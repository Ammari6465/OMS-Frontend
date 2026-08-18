import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api.model';
import {
  OrganogramNode,
  OrganogramResponse,
  OrganogramStaffDetails,
  OrganogramView,
} from './organogram.models';

@Injectable({ providedIn: 'root' })
export class OrganogramApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/organogram`;
  get(companyId: number, view: OrganogramView, includeVacancies = true) {
    const params = new HttpParams()
      .set('companyId', companyId)
      .set('view', view)
      .set('includeVacancies', includeVacancies);
    return this.http
      .get<ApiResponse<OrganogramResponse>>(this.url, { params })
      .pipe(map((r) => r.data));
  }
  details(staffId: number) {
    return this.http
      .get<ApiResponse<OrganogramStaffDetails>>(`${this.url}/staff-details`, {
        params: { staffId },
      })
      .pipe(map((r) => r.data));
  }
  changeManager(staffId: number, managerId: number | null, version: number) {
    return this.http
      .patch<ApiResponse<OrganogramNode>>(`${environment.apiUrl}/staff/${staffId}/manager`, {
        managerId,
        version,
      })
      .pipe(map((r) => r.data));
  }
  streamUrl(companyId: number) {
    return `${this.url}/stream?companyId=${encodeURIComponent(companyId)}`;
  }
}
