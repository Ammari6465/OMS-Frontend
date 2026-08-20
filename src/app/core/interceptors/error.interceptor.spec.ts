import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { errorInterceptor, skipErrorToast } from './error.interceptor';
import { AuthService } from '../services/auth.service';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let messages: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    messages = { add: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: messages },
        { provide: AuthService, useValue: { isAuthenticated: () => false, logout: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('[POSITIVE] shows a generic toast for an unhandled failure', () => {
    http.get('/api/thing').subscribe({ error: () => undefined });

    httpMock.expectOne('/api/thing').flush(null, { status: 404, statusText: 'Not Found' });

    expect(messages.add).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Something went wrong' }),
    );
  });

  it('[POSITIVE] stays silent when the caller opts out, so one failure yields one message', () => {
    http.get('/api/plan', { context: skipErrorToast() }).subscribe({ error: () => undefined });

    httpMock.expectOne('/api/plan').flush(null, { status: 404, statusText: 'Not Found' });

    expect(messages.add).not.toHaveBeenCalled();
  });

  it('[POSITIVE] opting out still suppresses only the toast, not the error itself', () => {
    const onError = vi.fn();
    http.get('/api/plan', { context: skipErrorToast() }).subscribe({ error: onError });

    httpMock.expectOne('/api/plan').flush(null, { status: 500, statusText: 'Server Error' });

    expect(messages.add).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it('[NEGATIVE] a 403 opt-out still redirects to the forbidden page', () => {
    const router = TestBed.inject(Router);
    http.get('/api/plan', { context: skipErrorToast() }).subscribe({ error: () => undefined });

    httpMock.expectOne('/api/plan').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(messages.add).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/forbidden']);
  });
});
