import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  inject,
} from '@angular/core';
import {
  RedirectCommand,
  Router,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withNavigationErrorHandler,
  withViewTransitions,
} from '@angular/router';
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
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';

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
          // A redirect chain interrupts the transition it started; the aborted
          // one then rejects with InvalidStateError as an unhandled rejection.
          transition.finished.catch(() => {});
          transition.updateCallbackDone.catch(() => {});
          transition.ready.catch(() => {});

          const isAuthBoundary = (route: typeof from): boolean =>
            route.pathFromRoot.some((ancestor) => ancestor.routeConfig?.path === 'auth');
          if (isAuthBoundary(from) || isAuthBoundary(to)) transition.skipTransition();
        },
      }),
      // A navigation that dies mid-flight (failed lazy chunk, guard throwing,
      // a cancelled redirect) activates nothing and leaves a blank page. Send
      // the user somewhere real instead of stranding them on an empty outlet.
      withNavigationErrorHandler((error) => {
        console.error('[router] navigation failed', error);
        const router = inject(Router);
        const auth = inject(AuthService);
        // Must be a RedirectCommand — a bare UrlTree is ignored by the router.
        return new RedirectCommand(
          router.parseUrl(auth.isAuthenticated() ? '/dashboard' : '/auth/login'),
          { replaceUrl: true },
        );
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
        switchMap(() => auth.isAuthenticated()
          ? forkJoin([
              org.init().pipe(catchError(() => of(void 0))),
              notifications.init().pipe(catchError(() => of(void 0))),
            ]).pipe(map(() => void 0))
          : of(void 0)),
        catchError(() => of(void 0)),
      );
    }),
  ],
};
