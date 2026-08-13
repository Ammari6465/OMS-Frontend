import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-forbidden',
  imports: [ButtonModule],
  template: `
    <div class="err-page">
      <div class="code"><i class="pi pi-lock"></i>403</div>
      <h1>Access denied</h1>
      <p>You don't have permission to view this page. Contact your administrator if you believe this is an error.</p>
      <p-button label="Back to Dashboard" icon="pi pi-home" (onClick)="router.navigate(['/dashboard'])" />
    </div>
  `,
  styles: [
    `
      .err-page {
        min-height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 0.5rem;
        padding: 4rem 2rem;
      }
      .code {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 4rem;
        font-weight: 800;
        color: var(--p-red-500, #ef4444);
      }
      h1 {
        margin: 0.5rem 0 0.25rem;
        color: var(--p-text-color);
      }
      p {
        color: var(--p-text-muted-color, #64748b);
        margin: 0 0 1.5rem;
        max-width: 32rem;
      }
    `,
  ],
})
export class Forbidden {
  readonly router = inject(Router);
}
