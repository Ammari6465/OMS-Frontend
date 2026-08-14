import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { MenuItem } from 'primeng/api';

import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';
import { LayoutService } from '../layout.service';
import { ThemeService } from '../../core/services/theme.service';
import { AskOmsPanel } from '../../shared/ai/ai-chat-panel/ask-oms-panel';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, BreadcrumbModule, Sidebar, Topbar, AskOmsPanel],
  template: `
    <div class="layout" [class.collapsed]="layout.collapsed()" [class.mobile-open]="layout.mobileOpen()">
      <div class="sidebar-slot">
        <app-sidebar />
      </div>

      <div class="backdrop" (click)="layout.closeMobile()"></div>

      <div class="main">
        <app-topbar />
        <div class="crumb-bar">
          <p-breadcrumb [model]="breadcrumbs()" [home]="home" />
        </div>
        <main class="content">
          <router-outlet />
        </main>
      </div>

      <app-ask-oms-panel />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        width: 100%;
      }
      .layout {
        display: flex;
        height: 100vh;
        overflow: hidden;
        background: var(--oms-shell-bg);
      }
      .sidebar-slot {
        flex-shrink: 0;
        z-index: 30;
      }
      .main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        background: var(--oms-page-bg);
      }
      .crumb-bar {
        padding: 0.5rem 1.5rem;
        border-bottom: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.09));
        background: var(--oms-topbar-bg);
        backdrop-filter: blur(12px);
      }
      :host ::ng-deep .crumb-bar .p-breadcrumb {
        border: none;
        background: transparent;
        padding: 0;
      }
      .content {
        flex: 1;
        overflow-y: auto;
        background: var(--oms-page-bg);
      }
      .backdrop {
        display: none;
      }
      @media (max-width: 991px) {
        .sidebar-slot {
          position: fixed;
          inset: 0 auto 0 0;
          transform: translateX(-100%);
          transition: transform var(--oms-transition);
        }
        .mobile-open .sidebar-slot {
          transform: translateX(0);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }
        .mobile-open .backdrop {
          display: block;
          position: fixed;
          inset: 0;
          background: var(--oms-overlay-bg);
          backdrop-filter: blur(4px);
          z-index: 20;
        }
      }
    `,
  ],
})
export class MainLayout {
  readonly layout = inject(LayoutService);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  readonly home: MenuItem = { icon: 'pi pi-home', routerLink: '/dashboard' };
  readonly breadcrumbs = signal<MenuItem[]>([]);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.buildBreadcrumbs());
    this.buildBreadcrumbs();
  }

  private buildBreadcrumbs(): void {
    const crumbs: MenuItem[] = [];
    let route = this.router.routerState.snapshot.root.firstChild;
    while (route) {
      const label = route.data?.['breadcrumb'] as string | undefined;
      if (label && !crumbs.some((c) => c.label === label)) {
        crumbs.push({ label });
      }
      route = route.firstChild;
    }
    this.breadcrumbs.set(crumbs);
  }
}
