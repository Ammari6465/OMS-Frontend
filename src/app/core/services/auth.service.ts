import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap, throwError, timeout } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import {
  AuthError,
  AuthErrorCode,
  ChangePasswordError,
  ChangePasswordRequest,
  CurrentUser,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  ResetPasswordRequest,
  UpdateProfileRequest,
} from '../models/auth.model';
import { Role } from '../models/enums';
import { DEMO_USER_KEY } from './demo-accounts';

const SESSION_RESTORE_TIMEOUT_MS = 10_000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private readonly _currentUser = signal<CurrentUser | null>(null);
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly initialized = signal(false);

  readonly isSuperAdmin = computed(() => this._currentUser()?.role === Role.SUPER_ADMIN);
  readonly isCompanyAdmin = computed(() => this._currentUser()?.role === Role.COMPANY_ADMIN);
  readonly isAdmin = computed(() => {
    const role = this._currentUser()?.role;
    return role === Role.SUPER_ADMIN || role === Role.COMPANY_ADMIN;
  });
  readonly isManager = computed(() => this._currentUser()?.role === Role.MANAGER);
  readonly isStaff = computed(() => this._currentUser()?.role === Role.STAFF);
  readonly isReadOnly = computed(() => this._currentUser()?.role === Role.READ_ONLY);
  readonly canEditOrgData = computed(() => this.isAdmin());
  readonly canManageUsers = computed(() => this.isAdmin());
  readonly canManageSettings = computed(() => this.isSuperAdmin());

  private readonly tokenKey = environment.tokenStorageKey;

  constructor() {
    // Remove obsolete browser-only profile/password overrides from the former mock authentication flow.
    localStorage.removeItem('oms.auth.profile.overrides');
    localStorage.removeItem('oms.auth.password.overrides');
  }

  get token(): string | null {
    return localStorage.getItem(this.tokenKey) ?? sessionStorage.getItem(this.tokenKey);
  }

  private persistSession(token: string, user: CurrentUser, remember: boolean): void {
    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    store.setItem(this.tokenKey, token);
    store.setItem(DEMO_USER_KEY, JSON.stringify(user));
    other.removeItem(this.tokenKey);
    other.removeItem(DEMO_USER_KEY);
  }

  private updateStoredSession(user: CurrentUser): void {
    for (const store of [localStorage, sessionStorage]) {
      if (store.getItem(this.tokenKey)) store.setItem(DEMO_USER_KEY, JSON.stringify(user));
    }
  }

  private clearToken(): void {
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem(this.tokenKey);
      store.removeItem(DEMO_USER_KEY);
    }
  }

  init(): Observable<void> {
    if (this.initialized()) {
      return of(void 0);
    }
    if (!this.token) {
      this.initialized.set(true);
      return of(void 0);
    }
    return this.loadCurrentUser().pipe(
      // App initialisation waits for this request. Never leave the whole UI on
      // a blank shell when the API is unavailable or a stored token is stale.
      timeout(SESSION_RESTORE_TIMEOUT_MS),
      map(() => void 0),
      catchError(() => {
        this.clearToken();
        this._currentUser.set(null);
        return of(void 0);
      }),
      tap(() => this.initialized.set(true)),
    );
  }

  login(request: LoginRequest, remember = false): Observable<CurrentUser> {
    return this.http.post<ApiResponse<LoginResponse>>(`${this.baseUrl}/login`, request).pipe(
      map((response) => response.data),
      tap((response) => {
        this.persistSession(response.token, response.user, remember);
        this._currentUser.set(response.user);
      }),
      map((response) => response.user),
      catchError((error: HttpErrorResponse) => {
        const serverMessage = error.error?.message as string | undefined;
        let code: AuthErrorCode = 'GENERIC';

        if (error.status === 423) {
          code = 'LOCKED';
        } else if (error.status === 401 || error.status === 400) {
          if (serverMessage?.toLowerCase().includes('deactivat')) {
            code = 'INACTIVE';
          } else {
            code = 'INVALID_CREDENTIALS';
          }
        }
        return throwError(() => ({ code, message: serverMessage } as AuthError));
      }),
    );
  }

  loadCurrentUser(): Observable<CurrentUser> {
    return this.http.get<ApiResponse<CurrentUser>>(`${this.baseUrl}/me`).pipe(
      map((response) => response.data),
      tap((user) => {
        this._currentUser.set(user);
        this.updateStoredSession(user);
      }),
    );
  }

  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.post<ApiResponse<void>>(`${this.baseUrl}/change-password`, request).pipe(
      map(() => void 0),
      catchError((error: HttpErrorResponse) => {
        const code = error.status === 400 ? 'INCORRECT_CURRENT_PASSWORD' : 'UNAUTHENTICATED';
        return throwError(() => ({ code } as ChangePasswordError));
      }),
    );
  }

  updateProfile(request: UpdateProfileRequest): Observable<CurrentUser> {
    return this.http.put<ApiResponse<CurrentUser>>(`${this.baseUrl}/me`, request).pipe(
      map((response) => response.data),
      tap((user) => {
        this._currentUser.set(user);
        this.updateStoredSession(user);
      }),
    );
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<void> {
    return this.http.post<ApiResponse<void>>(`${this.baseUrl}/forgot-password`, request).pipe(map(() => void 0));
  }

  resetPassword(request: ResetPasswordRequest): Observable<void> {
    return this.http.post<ApiResponse<void>>(`${this.baseUrl}/reset-password`, request).pipe(map(() => void 0));
  }

  logout(): void {
    this.clearToken();
    this._currentUser.set(null);
    this.router.navigate(['/auth/login']);
  }

  hasRole(role: Role): boolean {
    return this._currentUser()?.role === role;
  }

  hasAnyRole(roles: Role[]): boolean {
    const current = this._currentUser()?.role;
    return current != null && roles.includes(current);
  }
}
