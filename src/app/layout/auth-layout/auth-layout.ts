import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet],
  template: `
    <div class="auth-shell">
      <aside class="brand-panel">
        <div class="brand-top">
          <img src="logo.png" alt="Sunrich Companies Logo" class="auth-logo-img" />
        </div>
        <div class="brand-copy">
          <h1>Sunrich Companies</h1>
          <p class="brand-tagline">Enterprise Organogram & Governance Platform</p>
          <p>
            Visualise, maintain, and govern Sunrich group companies' organizational hierarchies in real-time —
            across all operating entities, divisions, and reporting lines.
          </p>
          <ul class="brand-points">
            <li><i class="pi pi-check-circle"></i> Interactive multi-entity organogram tree</li>
            <li><i class="pi pi-check-circle"></i> Real-time staff transfers &amp; audit history</li>
            <li><i class="pi pi-check-circle"></i> Role-based enterprise security &amp; access control</li>
          </ul>
        </div>
        <div class="brand-footer">© {{ year }} Sunrich Companies · Internal Enterprise Governance</div>
      </aside>

      <main class="form-panel">
        <button type="button" class="theme-toggle" (click)="theme.toggle()"
          [attr.aria-label]="theme.mode() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'">
          <i class="pi" [class.pi-moon]="theme.mode() === 'light'" [class.pi-sun]="theme.mode() === 'dark'"></i>
        </button>
        <div class="form-wrap">
          <div class="mobile-brand">
            <img src="logo.png" alt="Sunrich Companies" class="mobile-logo" />
            <span>Sunrich · OMS</span>
          </div>
          <router-outlet />
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      .auth-shell {
        display: grid;
        grid-template-columns: 1.05fr 1fr;
        min-height: 100vh;
        background: var(--oms-page-bg, #07090e);
      }
      .brand-panel {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 3.5rem;
        color: #f3f4f6;
        background: radial-gradient(circle at 15% 15%, rgba(15, 139, 253, 0.28), transparent 45%),
          radial-gradient(circle at 85% 90%, rgba(15, 139, 253, 0.14), transparent 50%), #0b1220;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }
      .brand-top {
        display: flex;
        align-items: center;
      }
      .auth-logo-img {
        height: 68px;
        width: auto;
        filter: drop-shadow(0 4px 14px rgba(15, 139, 253, 0.45));
      }
      .brand-copy h1 {
        font-size: 2.2rem;
        font-weight: 900;
        line-height: 1.15;
        margin: 0 0 0.4rem;
        letter-spacing: -0.03em;
      }
      .brand-tagline {
        font-size: 0.95rem;
        font-weight: 700;
        color: #0f8bfd;
        margin: 0 0 1.25rem !important;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .brand-copy p {
        opacity: 0.85;
        max-width: 30rem;
        line-height: 1.6;
        font-size: 0.92rem;
      }
      .brand-points {
        list-style: none;
        padding: 0;
        margin: 1.75rem 0 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .brand-points li {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        opacity: 0.92;
        font-size: 0.9rem;
        font-weight: 500;
      }
      .brand-points i {
        color: #0f8bfd;
        font-size: 1rem;
      }
      .brand-footer {
        font-size: 0.8rem;
        opacity: 0.6;
      }
      .form-panel {
        position: relative;
        display: grid;
        place-items: center;
        padding: 2rem;
        background: var(--p-content-background, #0f1523);
      }
      .theme-toggle {
        position: absolute;
        top: 1.5rem;
        right: 1.5rem;
        width: 40px;
        height: 40px;
        border: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.08));
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.04);
        color: var(--p-text-color);
        cursor: pointer;
        transition: all 200ms;
      }
      .theme-toggle:hover {
        background: rgba(15, 139, 253, 0.15);
        color: #0f8bfd;
        border-color: rgba(15, 139, 253, 0.35);
      }
      .form-wrap {
        width: 100%;
        max-width: 400px;
      }
      /* Mobile brand header — only shown when the side panel is hidden */
      .mobile-brand {
        display: none;
        align-items: center;
        gap: 0.6rem;
        margin-bottom: 1.75rem;
      }
      .mobile-logo {
        height: 40px;
        width: auto;
      }
      .mobile-brand span {
        font-weight: 800;
        font-size: 1.05rem;
        color: var(--p-text-color);
        letter-spacing: -0.01em;
      }
      @media (max-width: 900px) {
        .auth-shell {
          grid-template-columns: 1fr;
        }
        .brand-panel {
          display: none;
        }
        .mobile-brand {
          display: flex;
        }
        .form-panel {
          padding: 1.5rem 1.25rem;
        }
      }
    `,
  ],
})
export class AuthLayout {
  readonly theme = inject(ThemeService);
  readonly year = new Date().getFullYear();
}
