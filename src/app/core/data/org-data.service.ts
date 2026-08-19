import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, concatMap, forkJoin, from, map, of, switchMap, tap, toArray } from 'rxjs';

import { LocalStore } from './local-store';
import { Company, Department, Position, Staff } from '../models/organization.model';
import { environment } from '../../../environments/environment';

export interface Option {
  label: string;
  value: number;
}

/**
 * Facade over the organisation data stores. Provides the CRUD-capable stores
 * plus cross-entity lookups (names, dropdown options) so feature components
 * don't couple to each other. All stores use the authenticated backend API.
 */
@Injectable({ providedIn: 'root' })
export class OrgDataService {
  private readonly http = inject(HttpClient);
  private readonly recordsUrl = `${environment.apiUrl}/records`;

  readonly companies = new LocalStore<Company>(this.http, `${this.recordsUrl}/companies`,
    ['name', 'regNumber', 'headOffice', 'parentCompanyName'],
  );
  readonly departments = new LocalStore<Department>(this.http, `${this.recordsUrl}/departments`, ['name', 'description'],
  );
  readonly staff = new LocalStore<Staff>(this.http, `${this.recordsUrl}/staff`, ['name', 'title', 'email', 'employeeCode', 'cellNumber', 'landline'],
  );
  readonly positions = new LocalStore<Position>(this.http, `${this.recordsUrl}/positions`, ['title', 'status'],
  );

  init(): Observable<void> {
    return forkJoin([
      this.companies.init(),
      this.departments.init(),
      this.staff.init(),
      this.positions.init(),
    ]).pipe(
      switchMap(() => forkJoin([
        this.migrateLegacy('oms.companies.v2', this.companies, (a, b) => a.name.toLowerCase() === b.name.toLowerCase()),
        this.migrateLegacy('oms.departments.v2', this.departments,
          (a, b) => a.companyId === b.companyId && a.name.toLowerCase() === b.name.toLowerCase()),
        this.migrateLegacy('oms.staff.v2', this.staff,
          (a, b) => a.companyId === b.companyId && (!!a.employeeCode && a.employeeCode === b.employeeCode || a.name.toLowerCase() === b.name.toLowerCase())),
        this.migrateLegacy('oms.positions.v2', this.positions,
          (a, b) => a.companyId === b.companyId && a.deptId === b.deptId && a.title.toLowerCase() === b.title.toLowerCase()),
      ])),
      map(() => void 0),
    );
  }

  private migrateLegacy<T extends Company | Department | Staff | Position>(
    key: string,
    store: LocalStore<T>,
    sameRecord: (legacy: T, persisted: T) => boolean,
  ): Observable<void> {
    let legacy: T[] = [];
    try {
      legacy = JSON.parse(localStorage.getItem(key) ?? '[]') as T[];
    } catch {
      return of(void 0);
    }
    if (!legacy.length) {
      localStorage.removeItem(key);
      return of(void 0);
    }
    const pending = legacy.filter((item) => !store.snapshot(true).some((saved) => sameRecord(item, saved)));
    return from(pending).pipe(
      concatMap((item) => {
        const { id, isDeleted, createdAt, updatedAt, ...payload } = item;
        return store.create(payload as Partial<T>);
      }),
      toArray(),
      tap(() => localStorage.removeItem(key)),
      map(() => void 0),
    );
  }

  companyName(id?: number | null): string {
    if (id == null) return '—';
    return this.companies.snapshot(true).find((c) => c.id === id)?.name ?? '—';
  }

  departmentName(id?: number | null): string {
    if (id == null) return '—';
    return this.departments.snapshot(true).find((d) => d.id === id)?.name ?? '—';
  }

  staffName(id?: number | null): string {
    if (id == null) return '—';
    return this.staff.snapshot(true).find((s) => s.id === id)?.name ?? '—';
  }

  companyOptions(): Option[] {
    return this.companies.snapshot().map((c) => ({ label: c.name, value: c.id }));
  }

  /** The group holding company — the one company without a parent. */
  groupParent(): Company | undefined {
    return this.companies.snapshot().find((c) => c.parentCompanyId == null);
  }

  /**
   * Companies selectable as a parent. Excludes the company being edited and its
   * descendants, since either would create a cycle the API rejects.
   */
  parentCompanyOptions(excludeId?: number | null): Option[] {
    const all = this.companies.snapshot();
    const blocked = new Set<number>();
    if (excludeId != null) {
      blocked.add(excludeId);
      for (let added = true; added; ) {
        added = false;
        for (const c of all) {
          if (!blocked.has(c.id) && c.parentCompanyId != null && blocked.has(c.parentCompanyId)) {
            blocked.add(c.id);
            added = true;
          }
        }
      }
    }
    return all.filter((c) => !blocked.has(c.id)).map((c) => ({ label: c.name, value: c.id }));
  }

  /** Sister concerns of a company, i.e. its direct children in the group. */
  sisterConcerns(companyId: number): Company[] {
    return this.companies.snapshot().filter((c) => c.parentCompanyId === companyId);
  }

  departmentOptions(companyId?: number | null): Option[] {
    return this.departments
      .snapshot()
      .filter((d) => companyId == null || d.companyId === companyId)
      .map((d) => ({ label: d.name, value: d.id }));
  }

  staffOptions(companyId?: number | null): Option[] {
    return this.staff
      .snapshot()
      .filter((s) => companyId == null || s.companyId === companyId)
      .map((s) => ({ label: `${s.name}${s.title ? ' · ' + s.title : ''}`, value: s.id }));
  }
}
