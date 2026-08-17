import { HttpClient, HttpParams } from '@angular/common/http';
import { signal } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';

import { Audited } from '../models/organization.model';
import { ApiResponse, PageResponse } from '../models/api.model';

export interface ListQuery {
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
  search?: string;
  includeDeleted?: boolean;
  filters?: Record<string, unknown>;
}

export type ChangeAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

/**
 * API-backed collection with an in-memory read cache. The database is the
 * source of truth; no organisational records are written to browser storage.
 */
export class LocalStore<T extends Audited> {
  private readonly items = signal<T[]>([]);
  private loaded = false;

  constructor(
    private readonly http: HttpClient,
    private readonly endpoint: string,
    private readonly searchable: (keyof T)[],
    private readonly onChange?: (action: ChangeAction, item: T) => void,
  ) {}

  init(): Observable<void> {
    return this.fetchAll().pipe(map(() => void 0));
  }

  private fetchAll(): Observable<T[]> {
    const params = new HttpParams().set('includeDeleted', 'true');
    return this.http.get<ApiResponse<T[]>>(this.endpoint, { params }).pipe(
      map((response) => response.data ?? []),
      tap((items) => {
        this.items.set(items);
        this.loaded = true;
      }),
    );
  }

  list(query: ListQuery = {}): Observable<PageResponse<T>> {
    const source = this.loaded ? of(this.items()) : this.fetchAll();
    return source.pipe(map((items) => this.toPage(items, query)));
  }

  snapshot(includeDeleted = false): T[] {
    return this.items().filter((item) => includeDeleted || !item.isDeleted);
  }

  get(id: number): Observable<T | undefined> {
    const source = this.loaded ? of(this.items()) : this.fetchAll();
    return source.pipe(map((items) => items.find((item) => item.id === id)));
  }

  create(dto: Partial<T>): Observable<T> {
    return this.http.post<ApiResponse<T>>(this.endpoint, dto).pipe(
      map((response) => response.data),
      tap((item) => {
        this.items.update((items) => [...items, item]);
        this.onChange?.('CREATE', item);
      }),
    );
  }

  update(id: number, dto: Partial<T>): Observable<T> {
    return this.http.put<ApiResponse<T>>(`${this.endpoint}/${id}`, dto).pipe(
      map((response) => response.data),
      tap((item) => {
        this.items.update((items) => items.map((current) => (current.id === id ? item : current)));
        this.onChange?.('UPDATE', item);
      }),
    );
  }

  softDelete(id: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.endpoint}/${id}`).pipe(
      tap(() => {
        const item = this.items().find((current) => current.id === id);
        if (item) {
          const archived = { ...item, isDeleted: true } as T;
          this.items.update((items) => items.map((current) => current.id === id ? archived : current));
          this.onChange?.('DELETE', archived);
        }
      }),
      map(() => void 0),
    );
  }

  restore(id: number): Observable<T> {
    return this.http.patch<ApiResponse<T>>(`${this.endpoint}/${id}/restore`, {}).pipe(
      map((response) => response.data),
      tap((item) => {
        this.items.update((items) => items.map((current) => (current.id === id ? item : current)));
        this.onChange?.('RESTORE', item);
      }),
    );
  }

  countActive(filters?: Record<string, unknown>): number {
    let items = this.snapshot();
    if (filters) {
      for (const [field, value] of Object.entries(filters)) {
        items = items.filter((item) => (item as Record<string, unknown>)[field] === value);
      }
    }
    return items.length;
  }

  private toPage(source: T[], query: ListQuery): PageResponse<T> {
    let items = source.filter((item) => query.includeDeleted || !item.isDeleted);
    if (query.filters) {
      for (const [field, value] of Object.entries(query.filters)) {
        if (value !== null && value !== undefined && value !== '') {
          items = items.filter((item) => (item as Record<string, unknown>)[field] === value);
        }
      }
    }
    const term = query.search?.trim().toLowerCase();
    if (term) {
      items = items.filter((item) =>
        this.searchable.some((field) =>
          String((item as Record<string, unknown>)[field as string] ?? '').toLowerCase().includes(term),
        ),
      );
    }
    if (query.sort) {
      const direction = query.direction === 'desc' ? -1 : 1;
      const field = query.sort;
      items = [...items].sort((a, b) => {
        const left = (a as Record<string, unknown>)[field];
        const right = (b as Record<string, unknown>)[field];
        if (left == null) return 1;
        if (right == null) return -1;
        return (left > right ? 1 : left < right ? -1 : 0) * direction;
      });
    }
    const totalElements = items.length;
    const size = query.size ?? 10;
    const page = query.page ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalElements / size));
    const content = items.slice(page * size, page * size + size);
    return {
      content,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
      numberOfElements: content.length,
      empty: content.length === 0,
    };
  }
}
