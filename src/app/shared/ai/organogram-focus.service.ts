import { Injectable, signal } from '@angular/core';

/**
 * A tiny signal bus that lets any feature (e.g. the Ask OMS copilot) ask the
 * Organogram to focus and highlight a person — without duplicating the
 * hierarchy logic that lives inside {@link OrganogramViewer}. The viewer
 * consumes these requests via an effect and performs the focus itself.
 */
export interface OrganogramFocusRequest {
  staffId: number;
  /** Monotonic token so repeated focus requests for the same person still fire. */
  nonce: number;
}

@Injectable({ providedIn: 'root' })
export class OrganogramFocusService {
  private seq = 0;
  readonly request = signal<OrganogramFocusRequest | null>(null);

  /** Request the Organogram to focus and highlight the given staff member. */
  focus(staffId: number): void {
    this.request.set({ staffId, nonce: ++this.seq });
  }

  /** Called by the viewer once a request has been handled. */
  clear(): void {
    this.request.set(null);
  }
}
