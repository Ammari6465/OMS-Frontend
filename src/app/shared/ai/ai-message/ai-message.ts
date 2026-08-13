import { Component, computed, input, output } from '@angular/core';

import { AiAction, AiMessage } from '../ai-models';

/** Renders a single chat message (user or assistant) with optional actions. */
@Component({
  selector: 'app-ai-message',
  template: `
    <div class="row" [class.user]="message().role === 'user'" [class.assistant]="message().role === 'assistant'">
      @if (message().role === 'assistant') {
        <span class="ai-avatar" aria-hidden="true"><i class="pi pi-sparkles"></i></span>
      }
      <div class="bubble" [attr.data-tone]="message().tone ?? 'normal'">
        @if (message().pending) {
          <span class="typing" role="status" aria-label="Assistant is thinking">
            <span></span><span></span><span></span>
          </span>
        } @else {
          <p class="text">{{ message().text }}</p>
          @if (actions().length) {
            <div class="actions">
              @for (a of actions(); track a.label) {
                <button type="button" class="act" (click)="action.emit(a)">
                  <i [class]="a.icon" aria-hidden="true"></i>{{ a.label }}
                </button>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [
    `
      .row { display: flex; gap: 0.6rem; align-items: flex-start; }
      .row.user { justify-content: flex-end; }
      .ai-avatar {
        display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 auto; border-radius: 9px;
        color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 14%, transparent);
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.18);
      }
      .bubble {
        max-width: 84%; padding: 0.7rem 0.85rem; border-radius: 14px; font-size: 0.88rem; line-height: 1.5;
        border: 1px solid var(--p-content-border-color); background: var(--p-content-background); color: var(--p-text-color);
      }
      .row.user .bubble {
        background: var(--p-primary-color); border-color: transparent;
        color: var(--p-primary-contrast-color, #fff); border-bottom-right-radius: 5px;
      }
      .row.assistant .bubble { border-bottom-left-radius: 5px; }
      .bubble[data-tone='denied'] { border-color: color-mix(in srgb, #f59e0b 45%, transparent); background: color-mix(in srgb, #f59e0b 8%, var(--p-content-background)); }
      .bubble[data-tone='error'] { border-color: color-mix(in srgb, #f87171 45%, transparent); background: color-mix(in srgb, #f87171 8%, var(--p-content-background)); }
      .text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.65rem; }
      .act {
        display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.6rem; border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--p-primary-color) 35%, var(--p-content-border-color));
        background: color-mix(in srgb, var(--p-primary-color) 8%, transparent); color: var(--p-primary-color);
        font-size: 0.76rem; font-weight: 650; cursor: pointer; transition: background 0.15s, transform 0.15s;
      }
      .act:hover { background: color-mix(in srgb, var(--p-primary-color) 16%, transparent); transform: translateY(-1px); }
      .act:focus-visible { outline: 2px solid var(--p-primary-color); outline-offset: 2px; }
      .typing { display: inline-flex; gap: 4px; align-items: center; padding: 0.2rem 0; }
      .typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--p-text-muted-color); opacity: 0.5; animation: ai-blink 1.2s infinite ease-in-out; }
      .typing span:nth-child(2) { animation-delay: 0.2s; }
      .typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes ai-blink { 0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { .typing span { animation: none; } .act:hover { transform: none; } }
    `,
  ],
})
export class AiMessageComponent {
  readonly message = input.required<AiMessage>();
  readonly action = output<AiAction>();
  readonly actions = computed(() => this.message().actions ?? []);
}
