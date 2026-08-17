/**
 * Ask OMS — lightweight deterministic intent scoring.
 *
 * This layer never answers a question; it only decides *what the user probably
 * meant* so the engine can either run the matching handler, offer a
 * "did you mean?", or fall back cleanly. Scoring is plain string/edit-distance
 * work — no model, no index, no extra dependency.
 *
 * Confidence bands (see {@link CONFIDENCE}):
 *   ≥ 0.80  run the intent directly
 *   ≥ 0.50  confirm with the user first
 *   < 0.50  compact "not sure" reply
 */

import { AiIntentKind } from './ai-models';
import { NormalizedQuery, fuzzyEquals, stem } from './query-normalizer';
import {
  CAPABILITY_TERMS,
  CHAIN_TERMS,
  CONTACT_TERMS,
  COURTESY_TERMS,
  DEPARTMENT_TERMS,
  EMPLOYEE_TERMS,
  FULL_TEAM_TERMS,
  GREETING_TERMS,
  HEADCOUNT_TERMS,
  JOIN_TERMS,
  MANAGER_TERMS,
  VACANCY_TERMS,
  hasTerm,
} from './intent-vocabulary';

export const CONFIDENCE = {
  /** At or above this, execute the intent without asking. */
  execute: 0.8,
  /** At or above this (but below `execute`), offer a "did you mean?". */
  clarify: 0.5,
} as const;

export interface IntentMatch {
  intent: AiIntentKind;
  confidence: number;
  /** The query to run if this interpretation is accepted. */
  canonicalQuery: string;
  /** Human-readable phrasing of the interpretation. */
  label: string;
}

/** Words that are part of addressing the assistant, not part of the greeting. */
const ADDRESSING = new Set([
  'ask', 'oms', 'askoms', 'bot', 'assistant', 'copilot', 'there', 'everyone', 'all', 'again', 'buddy', 'mate',
]);

/** Trailing pleasantries that keep a greeting a greeting. */
const GREETING_TAIL = /\b(?:how\s+are\s+you|how\s+are\s+things|how\s+is\s+it\s+going|hows\s+it\s+going|whats\s+up|sup)\b/g;

const GREETING_SET = new Set(GREETING_TERMS.filter((t) => !t.includes(' ')));
const COURTESY_SET = new Set(COURTESY_TERMS.filter((t) => !t.includes(' ')));

/**
 * Detects pure small talk. Requires the *whole* query to be conversational, so
 * "Hi" greets but "Find Hiran" still searches staff.
 */
export function detectSmallTalk(nq: NormalizedQuery): 'greeting' | 'courtesy' | null {
  let rest = nq.text.replace(GREETING_TAIL, ' ');

  // Multi-word greetings ("good morning") collapse to a single marker first.
  let sawGreeting = false;
  for (const term of GREETING_TERMS.filter((t) => t.includes(' '))) {
    const re = new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'g');
    if (re.test(rest)) {
      sawGreeting = true;
      rest = rest.replace(re, ' ');
    }
  }
  let sawCourtesy = false;
  for (const term of COURTESY_TERMS.filter((t) => t.includes(' '))) {
    const re = new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'g');
    if (re.test(rest)) {
      sawCourtesy = true;
      rest = rest.replace(re, ' ');
    }
  }

  const leftover = rest.split(/\s+/).filter(Boolean).filter((t) => !ADDRESSING.has(t));
  if (!leftover.length) return sawCourtesy && !sawGreeting ? 'courtesy' : sawGreeting ? 'greeting' : null;

  const allGreeting = leftover.every((t) => GREETING_SET.has(t));
  if (allGreeting) return 'greeting';

  const allCourtesy = leftover.every((t) => COURTESY_SET.has(t) || GREETING_SET.has(t));
  if (allCourtesy) return sawGreeting ? 'greeting' : 'courtesy';

  return null;
}

/**
 * Detects "what can you do?" style meta questions.
 *
 * `hasEntity` guards the common false positive: "help me find Sarah" mentions
 * a real person and must stay an employee lookup.
 */
export function isCapabilityQuery(nq: NormalizedQuery, hasEntity: boolean): boolean {
  if (hasEntity) return false;
  if (!hasTerm(nq.text, CAPABILITY_TERMS)) return false;
  // A long sentence that merely contains "help" is usually a real question.
  return nq.tokens.length <= 6;
}

/** One scoreable interpretation: which terms trigger it and how to phrase it. */
interface Candidate {
  intent: AiIntentKind;
  terms: readonly string[];
  canonicalQuery: string;
  label: string;
  /** Extra weight when the query also mentions this group. */
  boostWith?: readonly string[];
}

const CANDIDATES: Candidate[] = [
  { intent: 'vacancies', terms: VACANCY_TERMS, canonicalQuery: 'Show open vacancies', label: 'Show open vacancies' },
  { intent: 'recent-hires', terms: JOIN_TERMS, canonicalQuery: 'Who joined recently?', label: 'Show recent joiners' },
  { intent: 'reporting-chain', terms: CHAIN_TERMS, canonicalQuery: 'Show reporting chain', label: 'Show a reporting chain' },
  { intent: 'team-hierarchy', terms: FULL_TEAM_TERMS, canonicalQuery: 'Show whole team', label: 'Show a full team' },
  { intent: 'manager-of', terms: MANAGER_TERMS, canonicalQuery: 'Who is the manager?', label: 'Look up a manager' },
  { intent: 'contact-info', terms: CONTACT_TERMS, canonicalQuery: 'Show contact details', label: 'Show contact details' },
  { intent: 'department-stats', terms: HEADCOUNT_TERMS, canonicalQuery: 'Compare department sizes', label: 'Show department sizes' },
  { intent: 'department-scoped', terms: DEPARTMENT_TERMS, canonicalQuery: 'Show department sizes', label: 'Explore departments' },
  { intent: 'find-employee', terms: EMPLOYEE_TERMS, canonicalQuery: 'Show employees', label: 'Find an employee' },
];

/**
 * Best fuzzy score for a term group against the query.
 *
 * Exact phrase hits score highest; a single mistyped word still scores inside
 * the clarify band so the user gets a "did you mean?" rather than a dead end.
 */
function scoreTerms(nq: NormalizedQuery, terms: readonly string[]): number {
  if (hasTerm(nq.text, terms)) return 1;
  if (nq.core && hasTerm(nq.core, terms)) return 0.92;

  const singles = terms.filter((t) => !t.includes(' '));
  let best = 0;

  for (const token of nq.tokens) {
    if (token.length < 4) continue;
    for (const term of singles) {
      if (fuzzyEquals(token, term)) {
        // An exact stem hit here means punctuation/plural noise only.
        best = Math.max(best, stem(token) === stem(term) ? 0.9 : 0.68);
      }
    }
  }

  // A two-word phrase where one word is mistyped ("vacant postions").
  for (const term of terms.filter((t) => t.includes(' '))) {
    const parts = term.split(/\s+/);
    if (parts.length !== 2) continue;
    for (let i = 0; i + 1 < nq.tokens.length; i++) {
      if (fuzzyEquals(nq.tokens[i], parts[0]) && fuzzyEquals(nq.tokens[i + 1], parts[1])) {
        best = Math.max(best, 0.72);
      }
    }
  }

  return best;
}

/**
 * Ranks possible interpretations of a query, best first.
 *
 * Only used when the deterministic chain could not answer — it turns a dead
 * end into either a confident retry or a specific suggestion.
 */
export function rankIntents(nq: NormalizedQuery): IntentMatch[] {
  if (!nq.tokens.length) return [];

  const matches: IntentMatch[] = [];
  for (const candidate of CANDIDATES) {
    let score = scoreTerms(nq, candidate.terms);
    if (score <= 0) continue;
    if (candidate.boostWith && hasTerm(nq.text, candidate.boostWith)) score = Math.min(1, score + 0.05);

    // A query that is *only* the concept ("vacancy") is unambiguous; a long
    // sentence with one incidental keyword is less so.
    if (nq.coreTokens.length > 6) score -= 0.08;

    matches.push({
      intent: candidate.intent,
      confidence: Math.round(Math.max(0, Math.min(1, score)) * 100) / 100,
      canonicalQuery: candidate.canonicalQuery,
      label: candidate.label,
    });
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

/** The single best interpretation above the clarify floor, if any. */
export function bestIntent(nq: NormalizedQuery): IntentMatch | null {
  const [top] = rankIntents(nq);
  return top && top.confidence >= CONFIDENCE.clarify ? top : null;
}
