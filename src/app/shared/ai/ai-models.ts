/**
 * Ask OMS — shared AI copilot models.
 *
 * The copilot follows an intent → structured-context → natural-language flow.
 * The *engine* (see intent-engine.ts) performs all calculation from real OMS
 * data; a pluggable {@link AiProvider} only rephrases the already-computed
 * result. No model ever calculates business metrics or sees raw records beyond
 * the minimal `context` payload.
 */

export type AiRole = 'user' | 'assistant';

export type AiIntentKind =
  | 'reporting-hierarchy'
  | 'manager-of'
  | 'recent-hires'
  | 'join-roster'
  | 'department-stats'
  | 'department-head'
  | 'positions-by-title'
  | 'vacancies'
  | 'find-employee'
  | 'insights'
  | 'activity-summary'
  | 'help'
  | 'unknown'
  | 'denied';

/** A follow-up the user can take from an answer (navigate, focus the organogram). */
export interface AiAction {
  kind: 'navigate' | 'focus-organogram';
  label: string;
  icon: string;
  route?: string;
  staffId?: number;
}

/** The outcome of interpreting one question. */
export interface AiResult {
  intent: AiIntentKind;
  /** Minimal structured context — exactly what would be sent to an LLM. */
  context: Record<string, unknown>;
  /** Deterministic, data-derived natural-language answer. */
  answer: string;
  actions: AiAction[];
  tone: 'normal' | 'denied' | 'empty' | 'error';
}

export interface AiMessage {
  id: number;
  role: AiRole;
  text: string;
  actions?: AiAction[];
  tone?: AiResult['tone'];
  /** True while the assistant reply is streaming/being computed. */
  pending?: boolean;
  ts: number;
}

export interface AiSuggestion {
  label: string;
  query: string;
  icon: string;
}
