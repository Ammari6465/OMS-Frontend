import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Role } from '../models/enums';
import { CurrentUser, LoginResponse } from '../models/auth.model';
import { AuthService } from './auth.service';

describe('AuthService API workflows', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const user: CurrentUser = {
    userId: 1,
    username: 'admin',
    fullName: 'Administrator',
    email: 'admin@sunrichgroup.com',
    role: Role.SUPER_ADMIN,
  };

  const envelope = <T>(data: T) => ({ success: true, data, timestamp: new Date().toISOString() });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('logs in through the backend and persists the returned session', async () => {
    const result = firstValueFrom(service.login({ username: 'admin', password: 'Strong#123' }, true));
    const request = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(request.request.method).toBe('POST');
    request.flush(envelope<LoginResponse>({ token: 'jwt-token', tokenType: 'Bearer', expiresInMs: 1000, user }));

    await expect(result).resolves.toEqual(user);
    expect(service.currentUser()).toEqual(user);
    expect(localStorage.getItem(environment.tokenStorageKey)).toBe('jwt-token');
  });

  it('restores a cached user without blocking startup and validates it in the background', async () => {
    localStorage.setItem(environment.tokenStorageKey, 'good-token');
    localStorage.setItem('oms.auth.demo.user', JSON.stringify(user));

    // Recreate the service after storage is populated so its constructor can
    // restore the cached identity.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);

    await expect(firstValueFrom(service.init())).resolves.toBeUndefined();
    expect(service.initialized()).toBe(true);
    expect(service.currentUser()).toEqual(user);

    http.expectOne(`${environment.apiUrl}/auth/me`).flush(envelope(user));
  });

  it('abandons an uncached stalled session restore quickly while keeping the token', async () => {
    vi.useFakeTimers();
    localStorage.setItem(environment.tokenStorageKey, 'good-token');

    const result = firstValueFrom(service.init());
    const request = http.expectOne(`${environment.apiUrl}/auth/me`);
    await vi.advanceTimersByTimeAsync(3_001);

    await expect(result).resolves.toBeUndefined();
    expect(request.cancelled).toBe(true);
    expect(service.initialized()).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
    // A timeout says nothing about whether the token is still good. Wiping it
    // here logged the user out for good whenever the API was merely slow.
    expect(localStorage.getItem(environment.tokenStorageKey)).toBe('good-token');
    vi.useRealTimers();
  });

  it('clears the session only when the server actually rejects the token', async () => {
    localStorage.setItem(environment.tokenStorageKey, 'stale-token');

    const result = firstValueFrom(service.init());
    http
      .expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(result).resolves.toBeUndefined();
    expect(service.initialized()).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(environment.tokenStorageKey)).toBeNull();
  });

  it('updates profile and changes password through the backend', async () => {
    const profile = { ...user, fullName: 'Updated Administrator', email: 'updated@sunrichgroup.com' };
    const profileResult = firstValueFrom(service.updateProfile({ fullName: profile.fullName, email: profile.email }));
    const profileRequest = http.expectOne(`${environment.apiUrl}/auth/me`);
    expect(profileRequest.request.method).toBe('PUT');
    profileRequest.flush(envelope(profile));
    await expect(profileResult).resolves.toEqual(profile);

    const passwordResult = firstValueFrom(
      service.changePassword({ currentPassword: 'Strong#123', newPassword: 'Stronger#456' }),
    );
    const passwordRequest = http.expectOne(`${environment.apiUrl}/auth/change-password`);
    expect(passwordRequest.request.method).toBe('POST');
    passwordRequest.flush(envelope(null));
    await expect(passwordResult).resolves.toBeUndefined();
  });
});
