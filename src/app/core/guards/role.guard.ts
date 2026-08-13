import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { Role } from '../models/enums';

/**
 * Route guard factory enforcing RBAC on the client (the API enforces it too).
 * Usage: `canActivate: [roleGuard([Role.SUPER_ADMIN, Role.COMPANY_ADMIN])]`.
 */
export function roleGuard(allowed: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/auth/login']);
    }
    return auth.hasAnyRole(allowed) ? true : router.createUrlTree(['/forbidden']);
  };
}
