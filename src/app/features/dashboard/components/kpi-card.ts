import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { DashboardKpi } from '../dashboard.model';
import { CountUp } from '../../../shared/count-up.directive';

@Component({
  selector: 'app-kpi-card',
  imports: [CountUp],
  template: `
    <button
      type="button"
      class="kpi"
      [class.clickable]="!!kpi().route"
      [style.--accent]="kpi().color"
      (click)="open()"
      [attr.aria-label]="kpi().label + ': ' + kpi().value"
    >
      <div class="kpi-top">
        <span class="kpi-icon"><i [class]="kpi().icon" aria-hidden="true"></i></span>
        @if (kpi().route) {
          <i class="pi pi-arrow-up-right kpi-go" aria-hidden="true"></i>
        }
      </div>
      <div class="kpi-value" [appCountUp]="kpi().value"></div>
      <div class="kpi-label">{{ kpi().label }}</div>
      <div class="kpi-sub">{{ kpi().sublabel }}</div>
    </button>
  `,
  styles: [
    `
      .kpi {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        --accent: var(--p-primary-color);
        width: 100%;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 1.25rem 1.35rem;
        border: 1px solid var(--oms-glass-border);
        border-radius: var(--oms-radius, 14px);
        border-top: 3px solid var(--accent);
        background: var(--oms-glass-strong);
        -webkit-backdrop-filter: var(--oms-glass-filter);
        backdrop-filter: var(--oms-glass-filter);
        box-shadow: var(--oms-glass-shadow);
        cursor: default;
        transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
      }
      .kpi::before{content:'';position:absolute;inset:-70% 45% 45% -30%;z-index:-1;background:linear-gradient(125deg,rgba(255,255,255,.16),transparent 62%);transform:rotate(10deg);transition:transform .35s ease}.kpi::after{content:'';position:absolute;width:90px;height:90px;right:-42px;bottom:-52px;border-radius:50%;background:color-mix(in srgb,var(--accent) 13%,transparent);filter:blur(2px)}
      .kpi.clickable {
        cursor: pointer;
      }
      .kpi.clickable:hover {
        transform: perspective(700px) translateY(-5px) rotateX(1.5deg);
        border-color: color-mix(in srgb, var(--accent) 55%, var(--p-content-border-color));
        box-shadow: 0 12px 26px -6px color-mix(in srgb, var(--accent) 30%, transparent);
      }
      .kpi.clickable:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .kpi-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.6rem;
      }
      .kpi-icon {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border-radius: 11px;
        font-size: 1.15rem;
        color: var(--accent);
        background: color-mix(in srgb, var(--accent) 15%, transparent);
        box-shadow:0 10px 18px -10px color-mix(in srgb,var(--accent) 65%,transparent),inset 0 1px rgba(255,255,255,.22);
        transform:translateZ(18px);
      }
      .kpi.clickable:hover::before{transform:translateX(65%) rotate(10deg)}
      @media(prefers-reduced-motion:reduce){.kpi,.kpi::before,.kpi-go{transition:none}}
      .kpi-go {
        color: var(--p-text-muted-color);
        opacity: 0;
        transition: opacity 0.18s ease, transform 0.18s ease;
        font-size: 0.85rem;
      }
      .kpi.clickable:hover .kpi-go {
        opacity: 1;
        transform: translate(2px, -2px);
        color: var(--accent);
      }
      .kpi-value {
        font-size: 1.9rem;
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: -0.02em;
        color: var(--p-text-color);
      }
      .kpi-label {
        font-weight: 600;
        color: var(--p-text-color);
        font-size: 0.92rem;
      }
      .kpi-sub {
        font-size: 0.8rem;
        color: var(--p-text-muted-color);
      }
    `,
  ],
})
export class KpiCard {
  readonly kpi = input.required<DashboardKpi>();
  private readonly router = inject(Router);

  open(): void {
    const route = this.kpi().route;
    if (route) this.router.navigate([route]);
  }
}
