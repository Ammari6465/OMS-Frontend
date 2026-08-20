import { HttpContext, HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Set on a request whose caller reports failures itself. Suppresses only the
 * generic toast — session teardown on 401 and the 403 redirect still run — so a
 * single failure never produces two competing messages.
 */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/** Convenience for `{ context: skipErrorToast() }` on an HttpClient call. */
export const skipErrorToast = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

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
      const quiet = req.context.get(SKIP_ERROR_TOAST);

      switch (error.status) {
        case 0:
          messages.add({
            severity: 'error',
            summary: 'Connection error',
            detail: 'Unable to reach the server. Please check your connection.',
          });
          break;
        case 401:
          // Only tear down a session that actually exists. A 401 arriving while
          // signed out (or from a request that outlived the sign-out) must not
          // start a navigation that races the one already in progress.
          if (!isAuthEndpoint && auth.isAuthenticated()) {
            auth.logout('session-expired');
            messages.add({
              severity: 'warn',
              summary: 'Session expired',
              detail: 'Please sign in again.',
            });
          }
          break;
        case 403:
          if (!quiet) {
            messages.add({
              severity: 'error',
              summary: 'Access denied',
              detail: backendMessage ?? 'You do not have permission to perform this action.',
            });
          }
          router.navigate(['/forbidden']);
          break;
        case 422:
        case 400:
          if (!quiet) {
            messages.add({
              severity: 'error',
              summary: 'Invalid request',
              detail: backendMessage ?? 'Please check the form and try again.',
            });
          }
          break;
        case 409:
          if (!quiet) {
            messages.add({
              severity: 'warn',
              summary: 'Conflict',
              detail: backendMessage ?? 'This record conflicts with existing data. Reload and try again.',
            });
          }
          break;
        default:
          if (!quiet) {
            messages.add({
              severity: 'error',
              summary: 'Something went wrong',
              detail: backendMessage ?? `Unexpected error (${error.status}).`,
            });
          }
      }

      return throwError(() => error);
    }),
  );
};
