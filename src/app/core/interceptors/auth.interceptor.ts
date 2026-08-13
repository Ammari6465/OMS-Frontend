import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/**
 * Attaches the Bearer token to outbound API requests.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token;

  const isApiCall = req.url.startsWith(environment.apiUrl) || req.url.startsWith('/api');
  if (token && isApiCall && !req.headers.has('Authorization')) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }
  return next(req);
};
