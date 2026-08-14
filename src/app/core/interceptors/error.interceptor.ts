import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Centralised HTTP error handling: shows a toast for failures, and on 401
 * clears the session and routes to login. 403 routes to the forbidden page.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const messages = inject(MessageService);
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const backendMessage = error.error?.message as string | undefined;
      const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/me');

      switch (error.status) {
        case 0:
          messages.add({
            severity: 'error',
            summary: 'Connection error',
            detail: 'Unable to reach the server. Please check your connection.',
          });
          break;
        case 401:
          if (!isAuthEndpoint) {
            auth.logout();
            messages.add({
              severity: 'warn',
              summary: 'Session expired',
              detail: 'Please sign in again.',
            });
          }
          break;
        case 403:
          messages.add({
            severity: 'error',
            summary: 'Access denied',
            detail: backendMessage ?? 'You do not have permission to perform this action.',
          });
          router.navigate(['/forbidden']);
          break;
        case 422:
        case 400:
          messages.add({
            severity: 'error',
            summary: 'Invalid request',
            detail: backendMessage ?? 'Please check the form and try again.',
          });
          break;
        case 409:
          messages.add({
            severity: 'warn',
            summary: 'Conflict',
            detail: backendMessage ?? 'This record conflicts with existing data. Reload and try again.',
          });
          break;
        default:
          messages.add({
            severity: 'error',
            summary: 'Something went wrong',
            detail: backendMessage ?? `Unexpected error (${error.status}).`,
          });
      }

      return throwError(() => error);
    }),
  );
};
