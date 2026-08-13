import { Injectable, signal } from '@angular/core';

/**
 * Holds shell UI state shared between the topbar, sidebar and main layout.
 * `collapsed` applies to the desktop rail; `mobileOpen` drives the overlay
 * drawer on small screens.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  toggleMobile(): void {
    this.mobileOpen.update((v) => !v);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}
