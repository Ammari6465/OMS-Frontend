/**
 * Ask OMS — natural-language provider seam.
 *
 * The engine computes the answer from real data; a provider only turns that
 * already-correct result into prose. This is the single place an LLM plugs in,
 * which guarantees the model never performs a calculation or sees raw records
 * beyond the minimal `context`.
 */
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';

import { ApiResponse } from '../../core/models/api.model';
import { AiResult } from './ai-models';

export interface AiProvider {
  readonly id: string;
  /** Return user-facing prose for a computed result. Must not alter the data. */
  rephrase(result: AiResult, query: string): Observable<string>;
}

/** Default provider: returns the deterministic, data-derived answer verbatim. */
export class LocalTemplateProvider implements AiProvider {
  readonly id = 'local-template';
  rephrase(result: AiResult): Observable<string> {
    return of(result.answer);
  }
}

/**
 * Opt-in provider that asks the backend AI orchestration layer to polish the
 * draft. The backend holds the API key and calls the configured LLM. On any
 * failure it falls back to the deterministic draft, so the copilot never breaks.
 */
export class BackendAiProvider implements AiProvider {
  readonly id = 'backend';
  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl: string,
  ) {}

  rephrase(result: AiResult, query: string): Observable<string> {
    return this.http
      .post<ApiResponse<{ answer: string }>>(`${this.baseUrl}/ai/rephrase`, {
        query,
        intent: result.intent,
        context: result.context,
        draft: result.answer,
      })
      .pipe(
        timeout(8000),
        map((r) => r.data?.answer?.trim() || result.answer),
        catchError(() => of(result.answer)),
      );
  }
}
