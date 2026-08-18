import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { OrganogramApiService } from './organogram-api.service';
import { OrganogramEvent } from './organogram.models';

@Injectable({ providedIn: 'root' })
export class OrganogramRealtimeService {
  private readonly api = inject(OrganogramApiService);
  private readonly auth = inject(AuthService);
  private controller?: AbortController;
  readonly events = new Subject<OrganogramEvent>();
  readonly connection = new Subject<'connected' | 'disconnected'>();
  connect(companyId: number): void {
    this.disconnect();
    const token = this.auth.token;
    if (!token) {
      this.connection.next('disconnected');
      return;
    }
    this.controller = new AbortController();
    void this.read(companyId, token, this.controller.signal);
  }
  disconnect() {
    this.controller?.abort();
    this.controller = undefined;
  }
  private async read(companyId: number, token: string, signal: AbortSignal) {
    let delay = 500;
    const seen = new Set<string>();
    while (!signal.aborted) {
      try {
        const response = await fetch(this.api.streamUrl(companyId), {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal,
        });
        if (!response.ok || !response.body) throw new Error('stream');
        this.connection.next('connected');
        delay = 500;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) throw new Error('closed');
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const data = frame
              .split('\n')
              .filter((x) => x.startsWith('data:'))
              .map((x) => x.slice(5).trim())
              .join('');
            if (!data) continue;
            const event = JSON.parse(data) as OrganogramEvent;
            if (event.companyId !== companyId) continue;
            const key = `${event.entityType}:${event.entityId}:${event.version}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (seen.size > 500) seen.delete(seen.values().next().value!);
            this.events.next(event);
          }
        }
      } catch {
        if (signal.aborted) return;
        this.connection.next('disconnected');
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 15000);
      }
    }
  }
}
