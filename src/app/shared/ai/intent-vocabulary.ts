/**
 * Ask OMS — shared terminology groups.
 *
 * Every intent in the engine recognises a *concept* ("vacancy", "manager")
 * rather than a fixed sentence. Phrasings live here once, so adding "job
 * opening" as a synonym teaches every vacancy code path at the same time
 * instead of requiring a new regex at each call site.
 *
 * Ordering matters only for multi-word phrases: list the longer phrase first
 * so the compiled alternation prefers it ("open position" before "position").
 */

/** Open roles. */
export const VACANCY_TERMS = [
  'open vacancies', 'open vacancy', 'vacant position', 'vacant positions', 'vacant role', 'vacant roles',
  'open position', 'open positions', 'open role', 'open roles', 'available position', 'available positions',
  'job opening', 'job openings', 'job vacancy', 'job vacancies', 'jobs available', 'available jobs',
  'positions are open', 'position is open', 'roles are open', 'position open', 'positions open', 'roles open',
  'unfilled position', 'unfilled positions', 'open job', 'open jobs',
  'vacancy', 'vacancies', 'vacant', 'openings', 'opening', 'hiring', 'recruiting', 'recruitment',
  // Bare "job(s)" reads as an open role in an org context; "position" alone is
  // deliberately excluded because it usually means a job *title*.
  'jobs', 'job',
];

/** People. */
export const EMPLOYEE_TERMS = [
  'team members', 'team member', 'head count', 'headcount',
  'employees', 'employee', 'staff', 'people', 'person', 'peoples', 'personnel',
  'workers', 'worker', 'colleagues', 'colleague', 'members', 'member',
];

/** Line management. */
export const MANAGER_TERMS = [
  'reports to', 'report to', 'reporting to', 'line manager', 'direct manager',
  'manager', 'managers', 'boss', 'bosses', 'supervisor', 'supervisors', 'superior', 'manages', 'managed by',
];

/** Organisational units. */
export const DEPARTMENT_TERMS = [
  'department', 'departments', 'dept', 'depts', 'division', 'divisions', 'unit', 'units', 'team', 'teams',
];

/** Starting at the company. */
export const JOIN_TERMS = [
  'recent hires', 'recent hire', 'new hires', 'new hire', 'new joiners', 'new joiner', 'new employees',
  'recently joined', 'newly joined', 'joining date', 'start date', 'started on',
  'joined', 'joiners', 'joiner', 'joining', 'onboarded', 'newcomers',
];

/** Whole-tree team questions (as opposed to direct reports). */
export const FULL_TEAM_TERMS = [
  'whole team', 'full team', 'entire team', 'extended team', 'complete team', 'total team',
  'everyone under', 'all reports', 'all the reports', 'team size', 'org under', 'everybody under',
  'downline', 'sub team', 'subtree',
];

/** Upward chain questions. */
export const CHAIN_TERMS = [
  'reporting chain', 'reporting line', 'reporting lines', 'management chain', 'chain of command',
  'reports up to', 'report up to', 'escalation path', 'up the chain', 'reporting hierarchy',
];

/** Contact detail lookups. */
export const CONTACT_TERMS = [
  'contact details', 'contact detail', 'contact info', 'contact information', 'phone number', 'mobile number',
  'contact', 'email', 'e-mail', 'phone', 'mobile', 'landline', 'extension', 'reach', 'telephone',
];

/** Department leadership. */
export const HEAD_TERMS = [
  'department head', 'head of department', 'head of', 'heads', 'headed by', 'leads', 'led by', 'runs',
  'in charge of', 'in charge', 'hod',
];

/** Size / counting questions. */
export const HEADCOUNT_TERMS = [
  'how many', 'head count', 'headcount', 'how big', 'how large', 'size of', 'total number', 'number of',
  'staff count', 'employee count', 'strength',
];

/** Side-by-side questions. */
export const COMPARE_TERMS = [
  'compare', 'comparison', 'versus', ' vs ', 'vs.', 'bigger', 'larger', 'smaller', 'difference between',
  'more employees', 'fewer employees', 'against',
];

/** Small talk openers. */
export const GREETING_TERMS = [
  'good morning', 'good afternoon', 'good evening', 'good day',
  'hi', 'hii', 'hiii', 'hello', 'helo', 'hey', 'heya', 'hiya', 'yo', 'howdy',
  'greetings', 'hi there', 'hello there', 'hey there', 'morning', 'afternoon', 'evening',
];

/** "What can you do?" style meta questions. */
export const CAPABILITY_TERMS = [
  'what can you do', 'what can i ask', 'what can you help', 'what do you do', 'what do you know',
  'how can you help', 'how do you help', 'what are you able', 'what are your capabilities',
  'capabilities', 'commands', 'examples', 'example questions', 'sample questions', 'help me', 'help',
  'what should i ask', 'options', 'features',
];

/** Acknowledgements that deserve a short reply, not a data lookup. */
export const COURTESY_TERMS = [
  'thanks', 'thank you', 'thankyou', 'thx', 'ty', 'cheers', 'appreciated', 'nice', 'great', 'awesome',
  'cool', 'perfect', 'ok', 'okay', 'got it', 'good job', 'well done',
];

/** Query-level noise that carries no organisational meaning. */
export const FILLER_TERMS = [
  'please', 'kindly', 'pls', 'plz', 'just', 'quickly', 'actually', 'basically',
];

const cache = new Map<string, RegExp>();

/** Escapes a phrase and allows any whitespace run between its words. */
function toPattern(term: string): string {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  // Only apply word boundaries where the edge character is a word character;
  // "vs." and " vs " would otherwise never match.
  const left = /^\w/.test(term.trim()) ? '\\b' : '';
  const right = /\w$/.test(term.trim()) ? '\\b' : '';
  return `${left}${escaped}${right}`;
}

/** Compiles (and memoises) an alternation matching any term in the group. */
export function termsRegex(terms: readonly string[]): RegExp {
  const key = terms.join('|');
  let re = cache.get(key);
  if (!re) {
    re = new RegExp(`(?:${terms.map(toPattern).join('|')})`, 'i');
    cache.set(key, re);
  }
  return re;
}

/** True when `text` mentions any term in the group. */
export function hasTerm(text: string, terms: readonly string[]): boolean {
  return termsRegex(terms).test(text);
}

/** The first term in the group that `text` mentions, or undefined. */
export function firstTerm(text: string, terms: readonly string[]): string | undefined {
  return terms.find((t) => termsRegex([t]).test(text));
}
