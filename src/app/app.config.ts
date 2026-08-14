import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  inject,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import { MessageService, ConfirmationService } from 'primeng/api';

import { OmsPreset } from './core/theme/oms-preset';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { AuthService } from './core/services/auth.service';
import { OrgDataService } from './core/data/org-data.service';
import { NotificationService } from './core/data/notification.service';
import { catchError, of, tap } from 'rxjs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition, from, to }) => {
          const isAuthBoundary = (route: typeof from): boolean =>
            route.pathFromRoot.some((ancestor) => ancestor.routeConfig?.path === 'auth');
          if (isAuthBoundary(from) || isAuthBoundary(to)) transition.skipTransition();
        },
      }),
    ),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    providePrimeNG({
      theme: {
        preset: OmsPreset,
        options: {
          darkModeSelector: '.app-dark',
        },
      },
      ripple: true,
    }),
    MessageService,
    ConfirmationService,
    // Resolve the current user (if a token exists) before the app renders.
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      const org = inject(OrgDataService);
      const notifications = inject(NotificationService);
      return auth.init().pipe(
        tap(() => {
          if (auth.isAuthenticated()) {
            org.init().subscribe({ error: () => {} });
            notifications.init().subscribe({ error: () => {} });
          }
        }),
        catchError(() => of(void 0)),
      );
    }),
  ],
};
