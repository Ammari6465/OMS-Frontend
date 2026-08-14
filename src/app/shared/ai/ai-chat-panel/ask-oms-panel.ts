import { Component, ElementRef, HostListener, effect, inject, viewChild } from '@angular/core';

import { AskOmsService } from '../ask-oms.service';
import { AiAction } from '../ai-models';
import { AiSuggestions } from '../ai-suggestions/ai-suggestions';
import { AiMessageComponent } from '../ai-message/ai-message';

/**
 * Ask OMS organizational copilot — a collapsible context-aware chat panel plus a floating launcher.
 * Globally mounted once in the app shell. Fully keyboard-operable:
 *   • Ctrl/⌘ + J toggles the panel (Ctrl/⌘ + K is the command palette)
 *   • Esc closes it · Enter sends · Shift+Enter inserts a newline
 */
@Component({
  selector: 'app-ask-oms-panel',
  imports: [AiSuggestions, AiMessageComponent],
  template: `
    <!-- Floating launcher -->
    @if (!ai.open()) {
      <button type="button" class="ai-fab" (click)="ai.show()"
        aria-label="Open Ask OMS assistant (Ctrl+J)" aria-keyshortcuts="Control+J">
        <i class="pi pi-sparkles" aria-hidden="true"></i>
        <span class="ai-fab-label">Ask OMS</span>
      </button>
    }

    @if (ai.open()) {
      <div class="ai-scrim" (click)="ai.close()" aria-hidden="true"></div>
      <aside class="ai-panel" role="dialog" aria-modal="true" aria-labelledby="ai-title">
        <header class="ai-head">
          <div class="ai-head-id">
            <span class="ai-mark"><i class="pi pi-sparkles"></i></span>
            <div>
              <h2 id="ai-title">Ask OMS</h2>
              <p>Context-aware organizational copilot</p>
            </div>
          </div>
          <div class="ai-head-actions">
            @if (ai.messages().length) {
              <button type="button" class="ai-icon" (click)="ai.reset()" aria-label="New conversation" title="New conversation">
                <i class="pi pi-plus-circle"></i>
              </button>
              <button type="button" class="ai-icon" (click)="ai.reset()" aria-label="Clear conversation" title="Clear conversation">
                <i class="pi pi-eraser"></i>
              </button>
            }
            <button type="button" class="ai-icon" (click)="ai.close()" aria-label="Close Ask OMS" title="Close">
              <i class="pi pi-times"></i>
            </button>
          </div>
        </header>

        <!-- Conversational Context Indicator Bar -->
        @if (ai.sessionContext().staffName || ai.sessionContext().departmentName || ai.sessionContext().companyName) {
          <div class="ai-context-banner">
            <div class="ctx-pill">
              <i class="pi pi-compass"></i>
              <span>
                Active:
                @if (ai.sessionContext().staffName) {
                  <strong>{{ ai.sessionContext().staffName }}</strong>
                  @if (ai.sessionContext().departmentName) {
                    <small> · {{ ai.sessionContext().departmentName }}</small>
                  }
                } @else if (ai.sessionContext().departmentName) {
                  <strong>{{ ai.sessionContext().departmentName }} Department</strong>
                } @else if (ai.sessionContext().companyName) {
                  <strong>{{ ai.sessionContext().companyName }}</strong>
                }
              </span>
            </div>
            <button type="button" class="clear-ctx-btn" (click)="ai.clearContext()" title="Clear entity context">
              <i class="pi pi-times"></i>
            </button>
          </div>
        }

        <div class="ai-body" #scroll>
          @if (!ai.messages().length) {
            <div class="ai-welcome">
              <span class="ai-mark lg"><i class="pi pi-sparkles"></i></span>
              <h3>How can I help?</h3>
              <p>Ask about employees, managers, team hierarchies, vacancies, department comparisons, or find anyone in the Organogram.</p>
              <app-ai-suggestions [suggestions]="ai.suggestions()" (pick)="send($event)" />
            </div>
          } @else {
            <div class="ai-thread">
              @for (m of ai.messages(); track m.id) {
                <app-ai-message [message]="m" (action)="onAction($event)" />
              }
            </div>
          }
        </div>

        <form class="ai-input" (submit)="submit($event)">
          <textarea #box rows="1" [value]="draft" (input)="draft = $any($event.target).value"
            (keydown)="onKey($event)" [disabled]="ai.busy()"
            placeholder="Ask about your organisation (e.g. Find Sarah, Who reports to her?)..."
            aria-label="Ask OMS a question"></textarea>
          <button type="submit" class="ai-send" [disabled]="ai.busy() || !draft.trim()" aria-label="Send question">
            <i class="pi" [class.pi-send]="!ai.busy()" [class.pi-spin]="ai.busy()" [class.pi-spinner]="ai.busy()"></i>
          </button>
        </form>
        <p class="ai-foot">Ask OMS derives answers deterministically from live OMS records. Context is maintained for this session.</p>
      </aside>
    }
  `,
  styles: [
    `
      :host { position: fixed; inset: auto 0 0 auto; z-index: 1200; pointer-events: none; }
      :host > * { pointer-events: auto; }
      .ai-fab {
        position: fixed; right: 1.5rem; bottom: 1.5rem; z-index: 1200;
        display: inline-flex; align-items: center; gap: 0.55rem; padding: 0.8rem 1.15rem;
        border: 1px solid color-mix(in srgb, var(--p-primary-color) 45%, transparent); border-radius: 999px;
        background: linear-gradient(135deg, var(--p-primary-color), color-mix(in srgb, var(--p-primary-color) 70%, #7c3aed));
        color: var(--p-primary-contrast-color, #fff); font-weight: 700; font-size: 0.9rem; cursor: pointer;
        box-shadow: 0 16px 34px -12px color-mix(in srgb, var(--p-primary-color) 70%, transparent);
        transition: transform 0.18s ease, box-shadow 0.18s ease;
      }
      .ai-fab:hover { transform: translateY(-2px); box-shadow: 0 22px 40px -14px color-mix(in srgb, var(--p-primary-color) 80%, transparent); }
      .ai-fab:focus-visible { outline: 2px solid var(--p-primary-color); outline-offset: 3px; }
      .ai-fab i { font-size: 1.05rem; }

      .ai-scrim { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.35); z-index: 1199; backdrop-filter: blur(1px); }
      .ai-panel {
        position: fixed; right: 1.25rem; bottom: 1.25rem; top: auto; z-index: 1201;
        width: min(440px, calc(100vw - 2rem)); height: min(670px, calc(100vh - 2.5rem));
        display: flex; flex-direction: column; overflow: hidden;
        border: 1px solid var(--p-content-border-color); border-radius: 18px;
        background: var(--p-content-background);
        box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.6);
        animation: ai-rise 0.22s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      @keyframes ai-rise { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: none; } }

      .ai-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.9rem 1rem;
        border-bottom: 1px solid var(--p-content-border-color);
        background: linear-gradient(135deg, color-mix(in srgb, var(--p-primary-color) 10%, var(--p-content-background)), var(--p-content-background)); }
      .ai-head-id { display: flex; align-items: center; gap: 0.65rem; min-width: 0; }
      .ai-mark { display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 auto; border-radius: 10px;
        color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.2); }
      .ai-mark.lg { width: 46px; height: 46px; font-size: 1.25rem; margin: 0 auto; }
      .ai-head h2 { margin: 0; font-size: 1rem; font-weight: 700; }
      .ai-head p { margin: 0.1rem 0 0; font-size: 0.72rem; color: var(--p-text-muted-color); }
      .ai-head-actions { display: flex; gap: 0.3rem; }
      .ai-icon { width: 32px; height: 32px; border: 1px solid transparent; border-radius: 8px; background: transparent;
        color: var(--p-text-muted-color); cursor: pointer; transition: background 0.15s, color 0.15s; }
      .ai-icon:hover { background: var(--oms-hover-bg, color-mix(in srgb, var(--p-primary-color) 8%, transparent)); color: var(--p-text-color); }
      .ai-icon:focus-visible { outline: 2px solid var(--p-primary-color); outline-offset: 2px; }

      .ai-context-banner {
        display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.4rem 0.9rem;
        background: color-mix(in srgb, var(--p-primary-color) 8%, var(--p-content-background));
        border-bottom: 1px solid color-mix(in srgb, var(--p-primary-color) 20%, transparent);
        font-size: 0.76rem;
      }
      .ctx-pill { display: flex; align-items: center; gap: 0.45rem; color: var(--p-primary-color); }
      .ctx-pill i { font-size: 0.8rem; }
      .ctx-pill strong { color: var(--p-text-color); }
      .clear-ctx-btn { border: none; background: transparent; color: var(--p-text-muted-color); cursor: pointer; padding: 2px; border-radius: 4px; font-size: 0.75rem; }
      .clear-ctx-btn:hover { color: var(--p-primary-color); }

      .ai-body { flex: 1; overflow-y: auto; padding: 1rem; }
      .ai-welcome { text-align: center; padding: 0.5rem 0.25rem 0; }
      .ai-welcome h3 { margin: 0.75rem 0 0.3rem; font-size: 1.05rem; }
      .ai-welcome > p { margin: 0 auto 1.1rem; max-width: 21rem; font-size: 0.84rem; color: var(--p-text-muted-color); }
      .ai-thread { display: flex; flex-direction: column; gap: 0.85rem; }

      .ai-input { display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid var(--p-content-border-color); }
      .ai-input textarea {
        flex: 1; resize: none; max-height: 120px; padding: 0.6rem 0.75rem; border-radius: 12px; font: inherit; font-size: 0.88rem;
        border: 1px solid var(--p-content-border-color); background: var(--p-content-background); color: var(--p-text-color); outline: none;
      }
      .ai-input textarea:focus { border-color: var(--p-primary-color); }
      .ai-send { flex: 0 0 auto; width: 40px; height: 40px; border: none; border-radius: 11px; cursor: pointer;
        background: var(--p-primary-color); color: var(--p-primary-contrast-color, #fff); transition: filter 0.15s; }
      .ai-send:hover:not(:disabled) { filter: brightness(1.06); }
      .ai-send:disabled { opacity: 0.5; cursor: default; }
      .ai-send:focus-visible { outline: 2px solid var(--p-primary-color); outline-offset: 2px; }
      .ai-foot { margin: 0; padding: 0 0.9rem 0.65rem; font-size: 0.65rem; color: var(--p-text-muted-color); text-align: center; }

      @media (max-width: 720px) {
        .ai-panel { right: 0; left: 0; bottom: 0; width: 100%; height: 85vh; border-radius: 18px 18px 0 0; }
        .ai-fab { right: 1rem; bottom: 1rem; }
        .ai-fab-label { display: none; }
      }
      @media (prefers-reduced-motion: reduce) { .ai-panel { animation: none; } .ai-fab { transition: none; } }
    `,
  ],
})
export class AskOmsPanel {
  readonly ai = inject(AskOmsService);
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');
  private readonly scroll = viewChild<ElementRef<HTMLElement>>('scroll');

  draft = '';

  constructor() {
    // Focus the input when the panel opens.
    effect(() => {
      if (this.ai.open()) queueMicrotask(() => this.box()?.nativeElement.focus());
    });
    // Keep the thread scrolled to the latest message.
    effect(() => {
      this.ai.messages();
      queueMicrotask(() => {
        const el = this.scroll()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  @HostListener('window:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
      event.preventDefault();
      this.ai.toggle();
    } else if (event.key === 'Escape' && this.ai.open()) {
      this.ai.close();
    }
  }

  onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send(this.draft);
    }
  }

  submit(event: Event): void {
    event.preventDefault();
    this.send(this.draft);
  }

  send(query: string): void {
    const q = query.trim();
    if (!q) return;
    this.ai.ask(q);
    this.draft = '';
    const el = this.box()?.nativeElement;
    if (el) el.style.height = 'auto';
  }

  onAction(action: AiAction): void {
    this.ai.runAction(action);
  }
}
