/**
 * Ask OMS — query normalisation.
 *
 * Turns whatever the user typed into a few stable views the intent layer can
 * reason over, without ever discarding the original: entity matching still
 * needs the raw text (emails, employee codes, names with punctuation), so the
 * cleaned forms are provided *alongside* it rather than replacing it.
 *
 *   raw    "  Can you please show me the VACANCIES???  "
 *   text   "can you please show me the vacancies"
 *   core   "the vacancies"          ← conversational filler removed
 */

import { FILLER_TERMS } from './intent-vocabulary';

export interface NormalizedQuery {
  /** Original input, trimmed. Use this for entity extraction. */
  raw: string;
  /** Lowercased `raw`, otherwise untouched. Matches the engine's legacy `q`. */
  lower: string;
  /** Lowercased, de-punctuated, whitespace-collapsed, possessives folded. */
  text: string;
  /** `text` with conversational filler removed. May be empty. */
  core: string;
  /** Word tokens of `text`. */
  tokens: string[];
  /** Word tokens of `core`. */
  coreTokens: string[];
  /** True when the user typed a question mark or opened with a question word. */
  isQuestion: boolean;
  /** True when filler was actually stripped — useful for confidence tuning. */
  hadFiller: boolean;
}

/**
 * Multi-word conversational wrappers. Removed only as whole phrases, so a
 * meaningful word is never lost on its own ("show me the team" keeps "team",
 * and "do we have vacancies" keeps "vacancies").
 */
const FILLER_PHRASES: RegExp[] = [
  /\b(?:can|could|would|will)\s+(?:you|u|we|i)\b/g,
  /\bi\s+(?:want|need|would\s+like|wanna)\s+to\s+know\b/g,
  /\bi\s+(?:want|need|would\s+like|wanna)\b/g,
  /\b(?:please|kindly)\s+(?:tell|show|give|list)\s+me\b/g,
  /\b(?:tell|show|give|list|get|find)\s+me\b/g,
  /\blet\s+me\s+know\b/g,
  /\bdo\s+(?:we|you|they|i)\s+have\b/g,
  /\bdoes\s+(?:the\s+)?(?:company|org|organisation|organization)\s+have\b/g,
  /\b(?:are|is)\s+there\s+(?:any|some)?\b/g,
  /\bwhat\s+about\b/g,
  /\bhow\s+about\b/g,
  /\bi\s+am\s+looking\s+for\b/g,
  /\blooking\s+for\b/g,
  /\bany\s+idea\b/g,
];

/** Single filler words, stripped after the phrase pass. */
const FILLER_WORDS = new RegExp(`\\b(?:${[...FILLER_TERMS, 'any', 'some', 'the', 'a', 'an'].join('|')})\\b`, 'g');

/** Question openers that signal intent but add no entity information. */
const QUESTION_OPENER = /^(?:who|what|which|where|when|how|do|does|did|is|are|can|could|show|list|find|tell|give)\b/i;

/**
 * Strips punctuation while protecting the characters that carry data:
 * `@` and `.` for emails, `-`/`_` for employee codes, `+` for phone numbers.
 */
function depunctuate(value: string): string {
  return value
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    // Possessives fold into the bare noun so "Sarah's" matches "Sarah".
    .replace(/'s\b/g, '')
    .replace(/s'\b/g, 's')
    .replace(/[^a-z0-9@._+\-\s]/gi, ' ')
    // A hyphen/underscore/dot/plus only survives between alphanumerics.
    .replace(/(^|\s)[._+\-]+/g, '$1')
    .replace(/[._+\-]+(\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return value.split(/[^a-z0-9@.+_-]+/i).filter(Boolean);
}

/** Normalises one user query into the views the intent layer consumes. */
export function normalizeQuery(rawInput: string): NormalizedQuery {
  const raw = (rawInput ?? '').trim().replace(/\s+/g, ' ');
  const lower = raw.toLowerCase();
  const text = depunctuate(lower);

  let core = text;
  for (const phrase of FILLER_PHRASES) core = core.replace(phrase, ' ');
  core = core.replace(FILLER_WORDS, ' ').replace(/\s+/g, ' ').trim();

  return {
    raw,
    lower,
    text,
    core,
    tokens: tokenize(text),
    coreTokens: tokenize(core),
    isQuestion: /\?/.test(raw) || QUESTION_OPENER.test(text),
    hadFiller: core !== text,
  };
}

/** Crude singular stem — enough to fold "vacancies"/"vacancy", "peoples"/"people". */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  // "-es" only drops whole after a sibilant ("boxes" → "box"); elsewhere the
  // plural is a bare "-s" and stripping two characters mangles the stem
  // ("employees" → "employe").
  if (/(?:ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Damerau-Levenshtein distance, capped early so a long non-match costs little.
 * Used only to recognise typos ("vacany" → "vacancy") for the did-you-mean
 * path; it never silently rewrites a query the user will not see confirmed.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  const prev2: number[] = [];
  let prev: number[] = [];
  let curr: number[] = [];

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      // Transposition ("hte" → "the").
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (prev2[j - 2] ?? Infinity) + 1);
      }
      curr[j] = v;
      rowBest = Math.min(rowBest, v);
    }
    if (rowBest > max) return max + 1;
    prev2.length = 0;
    prev2.push(...prev);
    prev = curr;
  }

  return prev[b.length];
}

/** Typo budget that scales with word length, so short words stay strict. */
export function typoBudget(word: string): number {
  if (word.length <= 3) return 0;
  if (word.length <= 6) return 1;
  return 2;
}

/**
 * True when `token` is `target`, a stem match, or within the typo budget.
 * Prefix matches are deliberately excluded — "man" should not match "manager".
 */
export function fuzzyEquals(token: string, target: string): boolean {
  if (token === target) return true;
  if (stem(token) === stem(target)) return true;
  const budget = Math.min(typoBudget(token), typoBudget(target));
  if (budget === 0) return false;
  return editDistance(stem(token), stem(target), budget) <= budget;
}
