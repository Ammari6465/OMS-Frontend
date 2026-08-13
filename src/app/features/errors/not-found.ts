import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-not-found',
  imports: [ButtonModule],
  template: `
    <div class="err-page">
      <div class="code">404</div>
      <h1>Page not found</h1>
      <p>The page you're looking for doesn't exist or has been moved.</p>
      <p-button label="Back to Dashboard" icon="pi pi-home" (onClick)="router.navigate(['/dashboard'])" />
    </div>
  `,
  styles: [
    `
      .err-page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 0.5rem;
        padding: 2rem;
        background: var(--p-surface-50, #f8fafc);
      }
      .code {
        font-size: 6rem;
        font-weight: 800;
        line-height: 1;
        background: linear-gradient(135deg, var(--p-primary-color), #0ea5e9);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      h1 {
        margin: 0.5rem 0 0.25rem;
        color: var(--p-text-color);
      }
      p {
        color: var(--p-text-muted-color, #64748b);
        margin: 0 0 1.5rem;
      }
    `,
  ],
})
export class NotFound {
  readonly router = inject(Router);
}
