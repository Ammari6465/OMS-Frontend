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
