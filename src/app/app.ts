import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CommandPalette } from './layout/command-palette/command-palette';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule, CommandPalette],
  template: `
    @if (navigating()) {
      <div class="route-progress" role="progressbar" aria-label="Loading page"><span></span></div>
    }
    <p-toast position="top-right" />
    <p-confirmdialog />
    <app-command-palette />
    <router-outlet />
  `,
  styles: [
    `
      .route-progress {
        position: fixed;
        inset: 0 0 auto;
        z-index: 10000;
        height: 3px;
        overflow: hidden;
        pointer-events: none;
        background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
      }
      .route-progress span {
        display: block;
        width: 38%;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, transparent, var(--p-primary-color), var(--oms-secondary), transparent);
        box-shadow: 0 0 12px color-mix(in srgb, var(--p-primary-color) 65%, transparent);
        animation: route-loading 900ms cubic-bezier(.65, 0, .35, 1) infinite;
      }
      @keyframes route-loading {
        from { transform: translateX(-110%); }
        to { transform: translateX(365%); }
      }
      @media (prefers-reduced-motion: reduce) {
        .route-progress span { animation-duration: 2s; }
      }
    `,
  ],
})
export class App {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private hideTimer?: number;
  private navigationStartedAt = 0;

  readonly navigating = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => window.clearTimeout(this.hideTimer));
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        window.clearTimeout(this.hideTimer);
        this.navigationStartedAt = performance.now();
        this.navigating.set(true);
        return;
      }
      if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        const remaining = Math.max(0, 220 - (performance.now() - this.navigationStartedAt));
        this.hideTimer = window.setTimeout(() => this.navigating.set(false), remaining);
      }
    });
  }
}
