import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../services/auth.service';

/** Blocks routes for unauthenticated users, redirecting to login. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.initialized()) {
    return auth.init().pipe(
      map(() => {
        if (auth.isAuthenticated()) return true;
        return router.createUrlTree(['/auth/login'], {
          queryParams: { redirect: state.url },
        });
      }),
    );
  }

  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/auth/login'], {
    queryParams: { redirect: state.url },
  });
};

/** Keeps authenticated users out of guest-only pages (login, forgot password). */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.initialized()) {
    return auth.init().pipe(
      map(() => (auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true)),
    );
  }

  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};

