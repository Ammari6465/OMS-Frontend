import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

/**
 * Placeholder for modules whose backend is being delivered in a later build.
 * The page title comes from the route's `data.title`.
 */
@Component({
  selector: 'app-coming-soon',
  imports: [ButtonModule],
  template: `
    <div class="oms-page">
      <div class="placeholder">
        <div class="icon"><i [class]="icon"></i></div>
        <h1>{{ title }}</h1>
        <p>
          This module is part of the phased delivery plan and is currently under construction.
          The screen will be enabled here as soon as its backend services are in place.
        </p>
        <p-button label="Back to Dashboard" icon="pi pi-arrow-left" [text]="true" (onClick)="router.navigate(['/dashboard'])" />
      </div>
    </div>
  `,
  styles: [
    `
      .placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 4rem 1rem;
        color: var(--p-text-muted-color, #64748b);
      }
      .icon {
        display: grid;
        place-items: center;
        width: 84px;
        height: 84px;
        border-radius: 20px;
        margin-bottom: 1.5rem;
        font-size: 2.2rem;
        color: var(--p-primary-color);
        background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
      }
      h1 {
        margin: 0 0 0.75rem;
        color: var(--p-text-color);
        font-size: 1.6rem;
      }
      p {
        max-width: 32rem;
        line-height: 1.6;
        margin: 0 0 1.5rem;
      }
    `,
  ],
})
export class ComingSoon {
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  get title(): string {
    return (this.route.snapshot.data['title'] as string) ?? 'Coming Soon';
  }
  get icon(): string {
    return (this.route.snapshot.data['icon'] as string) ?? 'pi pi-cog';
  }
}
