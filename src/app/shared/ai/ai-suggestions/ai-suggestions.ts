import { Component, input, output } from '@angular/core';

import { AiSuggestion } from '../ai-models';

/** Presentational list of starter prompts shown when the copilot opens. */
@Component({
  selector: 'app-ai-suggestions',
  template: `
    <div class="suggests" role="list" aria-label="Suggested questions">
      @for (s of suggestions(); track s.query) {
        <button type="button" role="listitem" class="chip" (click)="pick.emit(s.query)">
          <i [class]="s.icon" aria-hidden="true"></i>
          <span>{{ s.label }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      .suggests { display: flex; flex-direction: column; gap: 0.5rem; }
      .chip {
        display: flex; align-items: center; gap: 0.6rem; width: 100%; text-align: left;
        padding: 0.65rem 0.8rem; border: 1px solid var(--p-content-border-color); border-radius: 12px;
        background: color-mix(in srgb, var(--p-primary-color) 4%, var(--p-content-background));
        color: var(--p-text-color); cursor: pointer; font-size: 0.85rem; font-weight: 500;
        transition: border-color 0.15s, background 0.15s, transform 0.15s;
      }
      .chip:hover { border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 9%, transparent); transform: translateY(-1px); }
      .chip:focus-visible { outline: 2px solid var(--p-primary-color); outline-offset: 2px; }
      .chip i { color: var(--p-primary-color); font-size: 0.9rem; flex: 0 0 auto; }
      @media (prefers-reduced-motion: reduce) { .chip { transition: none; } }
    `,
  ],
})
export class AiSuggestions {
  readonly suggestions = input.required<AiSuggestion[]>();
  readonly pick = output<string>();
}
