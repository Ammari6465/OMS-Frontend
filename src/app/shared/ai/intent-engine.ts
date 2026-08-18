import { Company, Department, Position, Staff } from '../../core/models/organization.model';
import { EntityStatus } from '../../core/models/enums';
import {
  AiAction,
  AiIntentKind,
  AiResult,
  AiSuggestion,
  AmbiguityBlock,
  AmbiguityCandidate,
  AskOmsBlock,
  AskOmsContext,
  CapabilityBlock,
  ComparisonBlock,
  DataQualityBlock,
  DataQualityIssue,
  DepartmentBlock,
  EmployeeBlock,
  PositionBlock,
  ReportingChainBlock,
  ReportingChainNode,
  VacancySummaryBlock,
} from './ai-models';
import { CONFIDENCE, bestIntent, detectSmallTalk, isCapabilityQuery } from './intent-classifier';
import { NormalizedQuery, fuzzyEquals, normalizeQuery } from './query-normalizer';
import {
  CHAIN_TERMS,
  CONTACT_TERMS,
  EMPLOYEE_TERMS,
  FULL_TEAM_TERMS,
  HEADCOUNT_TERMS,
  HEAD_TERMS,
  JOIN_TERMS,
  MANAGER_TERMS,
  VACANCY_TERMS,
  hasTerm,
} from './intent-vocabulary';

/** Read-only view of OMS data the engine is allowed to reason over. */
export interface AiDataContext {
  staff: Staff[];
  departments: Department[];
  positions: Position[];
  companies: Company[];
  currentStaffId: number | null;
  canViewActivity: boolean;
  deptName(id?: number | null): string;
  companyName(id?: number | null): string;
  currentContext?: AskOmsContext;
}

const RESTRICTED =
  /\bsalar|\bcompensat|\bremunerat|\bpayroll|\bwage|\bbonus|\bctc\b|\bincome|\bearn(s|ed|ing)?\b|\bpaid\b|\btake[\s-]?home\b|\bpay[\s-]?(grade|scale|slip|rate|band|check|cheque)/i;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function cleanTitle(name: string): string {
  return name.replace(/^(dr\.|dr|mr\.|mr|mrs\.|mrs|ms\.|ms|prof\.|prof|eng\.|eng|sir|rev\.|rev)\s+/i, '').trim();
}

function firstName(name: string): string {
  return cleanTitle(name).split(/\s+/)[0] ?? name;
}

function nameWords(name: string): string[] {
  const raw = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const clean = cleanTitle(name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return Array.from(new Set([...raw, ...clean]));
}

function normalizePhone(phone?: string | null): string {
  return (phone ?? '').replace(/\D+/g, '');
}

const STOP_WORDS = new Set([
  'find', 'locate', 'highlight', 'show', 'me', 'where', 'is', 'are', 'was', 'in', 'on', 'the', 'a', 'an', 'of', 'to',
  'who', 'reports', 'report', 'reporting', 'manager', 'managers', 'boss', 'and', 'staff', 'employee', 'employees',
  'person', 'people', 'my', 'their', 'his', 'her', 'for', 'under', 'works', 'work', 'about', 'tell', 'can', 'you',
  'please', 'when', 'did', 'does', 'do', 'join', 'joined', 'joining', 'has', 'have', 'with', 'at', 'from', 'view',
  'open', 'details', 'info', 'profile', 'what', 'which', 'how', 'many', 'much', 'compare', 'difference', 'between',
]);

// ---- Actions & Block Builders -----------------------------------------------

export const focusAction = (s: Staff): AiAction => ({
  kind: 'focus-organogram',
  label: `Show ${s.name} in the Organogram`,
  icon: 'pi pi-sitemap',
  staffId: s.id,
});

export function buildEmployeeBlock(s: Staff, ctx: AiDataContext): EmployeeBlock {
  const manager = s.managerId != null ? ctx.staff.find((m) => m.id === s.managerId) : null;
  const directReports = ctx.staff.filter((r) => r.managerId === s.id);
  const extendedTeam = getDescendantIds(s.id, ctx.staff);
  return {
    kind: 'employee',
    id: s.id,
    name: s.name,
    title: s.title,
    employeeCode: s.employeeCode,
    deptId: s.deptId,
    departmentName: ctx.deptName(s.deptId),
    companyId: s.companyId,
    companyName: ctx.companyName(s.companyId),
    managerId: s.managerId,
    managerName: manager ? manager.name : null,
    email: s.email,
    cellNumber: s.cellNumber,
    landline: s.landline,
    status: s.status,
    dateJoined: s.dateJoined,
    directReportsCount: directReports.length,
    extendedTeamCount: extendedTeam.length,
  };
}

export function buildDepartmentBlock(d: Department, ctx: AiDataContext): DepartmentBlock {
  const staffInDept = ctx.staff.filter((s) => s.deptId === d.id);
  const vacInDept = ctx.positions.filter((p) => p.deptId === d.id && p.isVacant && p.status !== 'CLOSED');
  const posInDept = ctx.positions.filter((p) => p.deptId === d.id);
  const head = d.headStaffId != null ? ctx.staff.find((s) => s.id === d.headStaffId) : null;
  return {
    kind: 'department',
    id: d.id,
    name: d.name,
    companyId: d.companyId,
    companyName: ctx.companyName(d.companyId),
    headStaffId: d.headStaffId,
    headName: head ? head.name : null,
    employeeCount: staffInDept.length,
    vacancyCount: vacInDept.length,
    positionCount: posInDept.length,
  };
}

export function buildPositionBlock(p: Position, ctx: AiDataContext): PositionBlock {
  return {
    kind: 'position',
    id: p.id,
    title: p.title,
    deptId: p.deptId,
    departmentName: ctx.deptName(p.deptId),
    companyId: p.companyId,
    companyName: ctx.companyName(p.companyId),
    isVacant: !!p.isVacant,
    status: p.status,
  };
}

/** Open positions, excluding closed requisitions — the single definition used everywhere. */
export function openVacancies(ctx: AiDataContext, deptId?: number | null): Position[] {
  return ctx.positions.filter(
    (p) => p.isVacant && p.status !== 'CLOSED' && (deptId == null || p.deptId === deptId),
  );
}

/** Roll-up of open roles, grouped by department and ordered largest first. */
export function buildVacancySummaryBlock(
  vacancies: Position[],
  ctx: AiDataContext,
  scope?: Department | null,
): VacancySummaryBlock {
  const byDept = new Map<number | null | undefined, { name: string; deptId?: number | null; count: number }>();
  for (const v of vacancies) {
    const key = v.deptId ?? null;
    const entry = byDept.get(key) ?? { name: ctx.deptName(v.deptId), deptId: v.deptId, count: 0 };
    entry.count += 1;
    byDept.set(key, entry);
  }

  return {
    kind: 'vacancy-summary',
    scopeName: scope?.name ?? null,
    scopeDeptId: scope?.id ?? null,
    totalOpen: vacancies.length,
    departmentCount: byDept.size,
    byDepartment: [...byDept.values()].sort((a, b) => b.count - a.count),
    titles: vacancies.map((v) => v.title),
  };
}

// ---- Context & Entity Resolvers ---------------------------------------------

function hasStaffPronoun(q: string): boolean {
  return /\b(he|she|him|her|his|they|them|their|this employee|that employee|this person|that person|the employee|the person)\b/i.test(q);
}

function hasDeptPronoun(q: string): boolean {
  return /\b(her department|his department|their department|that department|this department|the department|it|its)\b/i.test(q);
}

function hasCompanyPronoun(q: string): boolean {
  return /\b(her company|his company|their company|that company|this company|the company)\b/i.test(q);
}

function isSelfQuery(q: string): boolean {
  return /\b(my|me|i|myself)\b/i.test(q);
}

export function matchStaffWithContext(query: string, ctx: AiDataContext): Staff[] {
  const q = query.toLowerCase();

  // 1. Self references: "who is my manager", "show my team"
  if (isSelfQuery(q) && ctx.currentStaffId != null) {
    const self = ctx.staff.find((s) => s.id === ctx.currentStaffId);
    if (self) return [self];
  }

  // 2. Pronouns with active session context
  if (hasStaffPronoun(q) && ctx.currentContext?.staffId != null) {
    const current = ctx.staff.find((s) => s.id === ctx.currentContext!.staffId);
    if (current) return [current];
  }

  // 3. Search by Employee Code (e.g. "EMP-001")
  const codeMatch = q.match(/\b(emp[-_]?[0-9a-z]+)\b/i);
  if (codeMatch) {
    const cleanCode = codeMatch[1].replace(/[-_]/g, '').toLowerCase();
    const byCode = ctx.staff.filter((s) => (s.employeeCode ?? '').replace(/[-_]/g, '').toLowerCase() === cleanCode);
    if (byCode.length) return byCode;
  }

  // 4. Search by Email (e.g. "john@company.com")
  const emailMatch = q.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    const byEmail = ctx.staff.filter((s) => (s.email ?? '').toLowerCase() === emailMatch[1].toLowerCase());
    if (byEmail.length) return byEmail;
  }

  // 5. Search by Phone digits
  const phoneDigits = q.replace(/\D+/g, '');
  if (phoneDigits.length >= 6) {
    const byPhone = ctx.staff.filter(
      (s) => (normalizePhone(s.cellNumber).includes(phoneDigits) || normalizePhone(s.landline).includes(phoneDigits)),
    );
    if (byPhone.length) return byPhone;
  }

  // 6. Whole-name exact / substring match
  const full = ctx.staff.filter((s) => s.name && q.includes(s.name.toLowerCase()));
  if (full.length) {
    const longest = Math.max(...full.map((s) => s.name.length));
    return full.filter((s) => s.name.length === longest);
  }

  // 7. Token scoring on name words
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  if (!tokens.length) {
    if (ctx.currentContext?.staffId != null && /\b(manager|reports|team|boss|position|department|chain)\b/i.test(q)) {
      const current = ctx.staff.find((s) => s.id === ctx.currentContext!.staffId);
      if (current) return [current];
    }
    return [];
  }

  const scored = ctx.staff
    .map((s) => {
      const words = nameWords(s.name);
      const score = tokens.filter((t) => words.some((w) => w === t || w.startsWith(t))).length;
      return { s, score };
    })
    .filter((x) => x.score > 0);

  if (!scored.length) return [];
  const best = Math.max(...scored.map((x) => x.score));
  return scored.filter((x) => x.score === best).map((x) => x.s);
}

/**
 * True when the query literally names a department or a person.
 *
 * Deliberately narrower than {@link matchStaffWithContext}, which also resolves
 * "my"/"her" to the signed-in user — that shortcut would make "what can I ask"
 * look like it named someone and hide the capability screen behind a lookup.
 */
function namesConcreteEntity(query: string, ctx: AiDataContext): boolean {
  const q = query.toLowerCase();

  const deptHit = ctx.departments.some(
    (d) => d.name && new RegExp(`\\b${d.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(q),
  );
  if (deptHit) return true;

  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t));
  if (!tokens.length) return false;
  return ctx.staff.some((s) => {
    const words = nameWords(s.name);
    return tokens.some((t) => words.includes(t));
  });
}

export function matchDepartmentWithContext(query: string, ctx: AiDataContext): Department | undefined {
  const q = query.toLowerCase();

  // 1. Direct name match with word boundary or longer match
  const direct = ctx.departments.find((d) => d.name && (new RegExp(`\\b${d.name}\\b`, 'i').test(q) || (d.name.length > 3 && q.includes(d.name.toLowerCase()))));
  if (direct) return direct;

  // 2. Department by word tokens
  const byWord = ctx.departments.find((d) => {
    const key = firstName(d.name).toLowerCase();
    return key.length > 2 && new RegExp(`\\b${key}\\b`, 'i').test(q);
  });
  if (byWord) return byWord;

  // 3. Pronoun context: "her department", "in that department"
  if (hasDeptPronoun(q) && ctx.currentContext?.staffId != null) {
    const s = ctx.staff.find((st) => st.id === ctx.currentContext!.staffId);
    if (s?.deptId != null) return ctx.departments.find((d) => d.id === s.deptId);
  }

  if (hasDeptPronoun(q) && ctx.currentContext?.departmentId != null) {
    return ctx.departments.find((d) => d.id === ctx.currentContext!.departmentId);
  }

  return undefined;
}

export function matchCompanyWithContext(query: string, ctx: AiDataContext): Company | undefined {
  const q = query.toLowerCase();

  const direct = ctx.companies.find((c) => c.name && (new RegExp(`\\b${c.name}\\b`, 'i').test(q) || (c.name.length > 3 && q.includes(c.name.toLowerCase()))));
  if (direct) return direct;

  const byWord = ctx.companies.find((c) => {
    const key = firstName(c.name).toLowerCase();
    return key.length > 2 && new RegExp(`\\b${key}\\b`, 'i').test(q);
  });
  if (byWord) return byWord;

  if (hasCompanyPronoun(q) && ctx.currentContext?.companyId != null) {
    return ctx.companies.find((c) => c.id === ctx.currentContext!.companyId);
  }

  return undefined;
}

// ---- Dynamic Follow-Up Suggestions ------------------------------------------

/**
 * Follow-ups for the answer the user just received.
 *
 * Keyed on intent first, then on the entity in play — a vacancy answer scoped
 * to a department should offer vacancy follow-ups, not department ones. Capped
 * at three so the thread stays readable; the panel repeats no global list.
 */
export function generateFollowUpSuggestions(
  intent: AiIntentKind,
  context: Partial<AskOmsContext>,
  ctx: AiDataContext,
): AiSuggestion[] {
  const list: AiSuggestion[] = [];
  const dept = context.departmentName;
  const name = context.staffName;
  const first = name ? firstName(name) : null;

  // Conversational and meta replies carry their own suggestions.
  if (intent === 'greeting' || intent === 'courtesy' || intent === 'capabilities' || intent === 'did-you-mean') {
    return [];
  }

  if (intent === 'vacancies') {
    const busiest = [...ctx.departments]
      .map((d) => ({ d, n: openVacancies(ctx, d.id).length }))
      .sort((a, b) => b.n - a.n)
      .filter((x) => x.n > 0)[0]?.d;
    if (dept) list.push(suggest(`Employees in ${dept}`, `Show employees in ${dept}`, 'pi pi-users'));
    if (busiest && busiest.name !== dept) {
      list.push(suggest(`Vacancies in ${busiest.name}`, `Vacancies in ${busiest.name}`, 'pi pi-inbox'));
    }
    list.push(suggest('Which department has most vacancies?', 'Which department has the most vacancies?', 'pi pi-chart-bar'));
  } else if (intent === 'data-quality') {
    list.push(
      suggest('Staff with no manager', 'Which employees have no manager?', 'pi pi-exclamation-circle'),
      suggest('Departments with no head', 'Which departments have no head?', 'pi pi-exclamation-triangle'),
      suggest('Incomplete employee records', 'Show incomplete employee records', 'pi pi-id-card'),
    );
  } else if (name && first) {
    // Skip the follow-up that just repeats the question that was answered.
    if (intent !== 'manager-of') list.push(suggest(`Who is ${first}'s manager?`, `Who is the manager of ${name}?`, 'pi pi-arrow-up'));
    if (intent !== 'reporting-hierarchy' && intent !== 'team-hierarchy') {
      list.push(suggest(`Show ${first}'s team`, `Show ${name}'s whole team`, 'pi pi-users'));
    }
    if (intent !== 'reporting-chain') list.push(suggest(`${first}'s reporting chain`, `Show ${name}'s reporting chain`, 'pi pi-arrows-v'));
    if (dept) list.push(suggest(`Vacancies in ${dept}`, `Any vacancies in ${dept}?`, 'pi pi-inbox'));
  } else if (dept) {
    // `intent` is already known not to be 'vacancies' or 'data-quality' here.
    if (intent !== 'department-scoped') list.push(suggest('Show employees', `Show employees in ${dept}`, 'pi pi-users'));
    list.push(suggest('Show vacancies', `Vacancies in ${dept}`, 'pi pi-inbox'));
    if (intent !== 'department-head') list.push(suggest(`Who heads ${dept}?`, `Who heads ${dept}?`, 'pi pi-user'));
    const other = ctx.departments.find((d) => d.name !== dept)?.name;
    if (other) list.push(suggest('Compare department size', `Compare ${dept} and ${other}`, 'pi pi-chart-bar'));
  }

  if (!list.length) {
    list.push(
      suggest('Show open vacancies', 'Show open vacancies', 'pi pi-inbox'),
      suggest('Who joined recently?', 'Who joined recently?', 'pi pi-calendar'),
      suggest('Compare department sizes', 'Which department has the most employees?', 'pi pi-chart-bar'),
    );
  }

  return list.slice(0, 3);
}

// ---- Ambiguity Handler ------------------------------------------------------

/**
 * The part of the query that actually matched the candidates, so the
 * disambiguation prompt can quote it ("3 employees matching \"John\"").
 */
function searchTermFor(query: string, matches: Staff[]): string | null {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  const hits = tokens.filter((t) => matches.some((m) => nameWords(m.name).some((w) => w === t || w.startsWith(t))));
  if (!hits.length) return null;
  return hits.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
}

function handleAmbiguousStaff(matches: Staff[], ctx: AiDataContext, term?: string | null): AiResult {
  const quoted = term ? ` matching "${term}"` : '';
  const candidates: AmbiguityCandidate[] = matches.map((s) => ({
    id: s.id,
    name: s.name,
    employeeCode: s.employeeCode,
    title: s.title,
    deptId: s.deptId,
    departmentName: ctx.deptName(s.deptId),
    companyId: s.companyId,
    companyName: ctx.companyName(s.companyId),
  }));

  const actions: AiAction[] = matches.slice(0, 4).map((s) => ({
    kind: 'select-context',
    label: `${s.name} (${ctx.deptName(s.deptId)})`,
    icon: 'pi pi-user',
    staffId: s.id,
  }));

  const block: AmbiguityBlock = {
    kind: 'ambiguity',
    prompt: `I found ${matches.length} employees${quoted}. Which one do you mean?`,
    candidates,
  };

  return {
    intent: 'ambiguity',
    context: { count: matches.length, term: term ?? null, candidateIds: matches.map((m) => m.id) },
    answer: `I found ${matches.length} employees${quoted}. Which one do you mean?`,
    blocks: [block],
    actions,
    suggestions: [],
    tone: 'normal',
  };
}

/** Distinguishes "no such department" from "no results", per error-handling rules. */
function departmentNotFound(name: string, ctx: AiDataContext): AiResult {
  const known = ctx.departments.slice(0, 4).map((d) => d.name);
  return {
    intent: 'department-scoped',
    context: { query: name, known },
    answer:
      `I couldn't find a department matching "${name}".` +
      (known.length ? `\n\nDepartments on record include: ${known.join(', ')}.` : ''),
    actions: [{ kind: 'navigate', label: 'Open Departments', icon: 'pi pi-briefcase', route: '/departments' }],
    suggestions: [],
    tone: 'empty',
    skipRephrase: true,
  };
}

/**
 * The department-ish name in an explicit scope such as "... in Finance".
 * Pronoun scopes ("in her department") are resolved by the context layer and
 * are deliberately excluded here.
 */
function explicitScopeName(text: string): string | null {
  const m = text.match(
    /\b(?:in|for|within|under|from)\s+(?:the\s+)?([a-z][a-z0-9&' -]{1,30}?)(?:\s+(?:department|dept|division|team))?\s*$/,
  );
  if (!m) return null;
  const name = m[1].trim();
  if (name.length < 2) return null;
  if (/^(?:her|his|their|its|this|that|the|my|our|your|them|it|us)$/.test(name)) return null;
  return name;
}

function noPersonResult(intent: AiIntentKind, query: string): AiResult {
  return {
    intent,
    context: { query },
    answer: `I couldn't find an employee matching "${query}". Try searching by full name, employee code (e.g. EMP-001), email, or mobile number.`,
    actions: [{ kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' }],
    tone: 'empty',
  };
}

/**
 * True only for organisation counting language. In particular, a bare
 * "number" is deliberately excluded so "What is Sarah's number?" remains a
 * contact lookup while "Number of staff in Finance" becomes a headcount.
 */
function isStaffHeadcountQuery(text: string): boolean {
  return (
    /\b(?:head\s*count|staff count|employee count|people count|team size|strength|size of|how big|how large)\b/i.test(text) ||
    /\b(?:how many|number of|total number of|count of)\s+(?:active\s+)?(?:staff|employees?|people|personnel|team members?)\b/i.test(text) ||
    /\b(?:total\s+(?:staff|employees?|people)|(?:staff|employee|people)\s+total)\b/i.test(text)
  );
}

// ---- Hierarchy & Team Helpers -----------------------------------------------

function getDescendantIds(rootId: number, staff: Staff[]): number[] {
  const byManager = new Map<number, Staff[]>();
  for (const s of staff) {
    if (s.managerId != null) {
      (byManager.get(s.managerId) ?? byManager.set(s.managerId, []).get(s.managerId)!).push(s);
    }
  }

  const result: number[] = [];
  const guard = new Set<number>([rootId]);
  const queue: { id: number; depth: number }[] = [{ id: rootId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= 20) break;
    const direct = byManager.get(current.id) ?? [];
    for (const child of direct) {
      if (!guard.has(child.id)) {
        guard.add(child.id);
        result.push(child.id);
        queue.push({ id: child.id, depth: current.depth + 1 });
      }
    }
  }

  return result;
}

function getReportingChain(person: Staff, ctx: AiDataContext): AiResult {
  const byId = new Map(ctx.staff.map((s) => [s.id, s] as const));
  const chainNodes: ReportingChainNode[] = [];
  let cur: Staff | undefined = person;
  const guard = new Set<number>();
  let level = 0;

  while (cur && !guard.has(cur.id) && level < 25) {
    guard.add(cur.id);
    chainNodes.unshift({
      id: cur.id,
      name: cur.name,
      title: cur.title,
      departmentName: ctx.deptName(cur.deptId),
      level: 0,
      isTarget: cur.id === person.id,
    });
    cur = cur.managerId != null ? byId.get(cur.managerId) : undefined;
    level++;
  }

  chainNodes.forEach((node, index) => {
    node.level = index;
  });

  const updatedContext: AskOmsContext = {
    staffId: person.id,
    staffName: person.name,
    departmentId: person.deptId,
    departmentName: ctx.deptName(person.deptId),
    companyId: person.companyId,
    companyName: ctx.companyName(person.companyId),
    lastEntityType: 'staff',
    lastIntent: 'reporting-chain',
  };

  const block: ReportingChainBlock = {
    kind: 'reporting-chain',
    targetStaffName: person.name,
    levelsAboveTarget: Math.max(0, chainNodes.length - 1),
    nodes: chainNodes,
  };

  const answer =
    `${person.name}'s Management Chain (${chainNodes.length} level${chainNodes.length === 1 ? '' : 's'}):\n\n` +
    chainNodes.map((n) => `• Level ${n.level}: ${n.name}${n.title ? ` — ${n.title}` : ''}${n.isTarget ? ' (Selected)' : ''}`).join('\n');

  return {
    intent: 'reporting-chain',
    context: { person: person.name, chain: chainNodes.map((n) => n.name), levels: chainNodes.length },
    answer,
    blocks: [block, buildEmployeeBlock(person, ctx)],
    actions: [focusAction(person), { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' }],
    updatedContext,
    tone: 'normal',
  };
}

function getTeamHierarchy(person: Staff, ctx: AiDataContext): AiResult {
  const direct = ctx.staff.filter((s) => s.managerId === person.id);
  const descendantIds = getDescendantIds(person.id, ctx.staff);
  const extendedCount = descendantIds.length;

  const updatedContext: AskOmsContext = {
    staffId: person.id,
    staffName: person.name,
    departmentId: person.deptId,
    departmentName: ctx.deptName(person.deptId),
    companyId: person.companyId,
    companyName: ctx.companyName(person.companyId),
    lastEntityType: 'staff',
    lastIntent: 'team-hierarchy',
  };

  const empBlock = buildEmployeeBlock(person, ctx);
  const directBlocks = direct.slice(0, 6).map((d) => buildEmployeeBlock(d, ctx));

  let answer: string;
  if (!direct.length) {
    answer = `${person.name} (${person.title || 'Staff'}) has no direct reports and 0 team members in their extended hierarchy.`;
  } else {
    answer =
      `${person.name} manages ${plural(direct.length, 'direct report')} and has ${plural(extendedCount, 'employee')} in their total extended reporting team.\n\n` +
      `Direct Reports:\n` +
      direct.map((d) => `• ${d.name}${d.title ? ` — ${d.title}` : ''} (${ctx.deptName(d.deptId)})`).join('\n');
  }

  return {
    intent: 'team-hierarchy',
    context: {
      manager: person.name,
      directReportsCount: direct.length,
      extendedTeamCount: extendedCount,
      directReportNames: direct.map((d) => d.name),
    },
    answer,
    blocks: [empBlock, ...directBlocks],
    actions: [
      focusAction(person),
      { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' },
    ],
    updatedContext,
    tone: direct.length ? 'normal' : 'empty',
  };
}

// ---- Department & Company Handlers ------------------------------------------

function getDepartmentDetail(dept: Department, ctx: AiDataContext): AiResult {
  const staffInDept = ctx.staff.filter((s) => s.deptId === dept.id);
  const vacInDept = ctx.positions.filter((p) => p.deptId === dept.id && p.isVacant && p.status !== 'CLOSED');
  const head = dept.headStaffId != null ? ctx.staff.find((s) => s.id === dept.headStaffId) : null;

  const deptBlock = buildDepartmentBlock(dept, ctx);
  const employeeBlocks = staffInDept.slice(0, 6).map((s) => buildEmployeeBlock(s, ctx));

  const updatedContext: AskOmsContext = {
    departmentId: dept.id,
    departmentName: dept.name,
    companyId: dept.companyId,
    companyName: ctx.companyName(dept.companyId),
    lastEntityType: 'department',
    lastIntent: 'department-scoped',
  };

  const listSample = staffInDept.slice(0, 10).map((s) => `• ${s.name}${s.title ? ` — ${s.title}` : ''}`);
  const more = staffInDept.length > 10 ? `\n…and ${staffInDept.length - 10} more.` : '';

  const answer =
    `${dept.name} (${ctx.companyName(dept.companyId)}):\n` +
    `• Head of Department: ${head ? `${head.name}${head.title ? ` (${head.title})` : ''}` : 'Not assigned'}\n` +
    `• Headcount: ${plural(staffInDept.length, 'employee')}\n` +
    `• Open Vacancies: ${vacInDept.length}\n\n` +
    (staffInDept.length ? `Team Members:\n${listSample.join('\n')}${more}` : 'No staff currently assigned.');

  return {
    intent: 'department-scoped',
    context: {
      department: dept.name,
      employeeCount: staffInDept.length,
      vacancyCount: vacInDept.length,
      head: head?.name ?? null,
    },
    answer,
    blocks: [deptBlock, ...employeeBlocks],
    actions: [
      { kind: 'navigate', label: `View ${dept.name} Staff`, route: '/staff', deptId: dept.id, icon: 'pi pi-users' },
      { kind: 'navigate', label: 'Open Organogram', route: '/organogram', icon: 'pi pi-sitemap' },
    ],
    updatedContext,
    tone: 'normal',
  };
}

/** Answers a scoped counting question without dumping the full staff roster. */
function getDepartmentHeadcount(dept: Department, ctx: AiDataContext): AiResult {
  const count = ctx.staff.filter((s) => s.deptId === dept.id).length;
  return {
    intent: 'department-stats',
    context: { department: dept.name, employeeCount: count },
    answer: `${dept.name} has ${plural(count, 'staff member')}.`,
    blocks: [buildDepartmentBlock(dept, ctx)],
    actions: [{ kind: 'navigate', label: `View ${dept.name} Staff`, route: '/staff', deptId: dept.id, icon: 'pi pi-users' }],
    updatedContext: {
      departmentId: dept.id,
      departmentName: dept.name,
      companyId: dept.companyId,
      companyName: ctx.companyName(dept.companyId),
      lastEntityType: 'department',
      lastIntent: 'department-stats',
    },
    tone: count ? 'normal' : 'empty',
  };
}

function getCompanyDetail(company: Company, ctx: AiDataContext): AiResult {
  const staffInCo = ctx.staff.filter((s) => s.companyId === company.id);
  const deptsInCo = ctx.departments.filter((d) => d.companyId === company.id);
  const vacInCo = ctx.positions.filter((p) => p.companyId === company.id && p.isVacant && p.status !== 'CLOSED');

  const deptLines = deptsInCo.map((d) => {
    const c = staffInCo.filter((s) => s.deptId === d.id).length;
    return `• ${d.name}: ${plural(c, 'employee')}`;
  });

  const updatedContext: AskOmsContext = {
    companyId: company.id,
    companyName: company.name,
    lastEntityType: 'company',
    lastIntent: 'company-scoped',
  };

  const answer =
    `${company.name} Group Overview:\n` +
    `• Total Employees: ${plural(staffInCo.length, 'employee')}\n` +
    `• Departments: ${deptsInCo.length}\n` +
    `• Open Vacancies: ${vacInCo.length}\n\n` +
    (deptLines.length ? `Departments Breakdown:\n${deptLines.join('\n')}` : 'No departments registered under this entity.');

  return {
    intent: 'company-scoped',
    context: {
      company: company.name,
      employeeCount: staffInCo.length,
      departmentCount: deptsInCo.length,
      vacancyCount: vacInCo.length,
    },
    answer,
    actions: [
      { kind: 'navigate', label: `View ${company.name} Staff`, route: '/staff', companyId: company.id, icon: 'pi pi-users' },
      { kind: 'navigate', label: 'Open Organogram', route: '/organogram', companyId: company.id, icon: 'pi pi-sitemap' },
    ],
    updatedContext,
    tone: 'normal',
  };
}

// ---- Comparison Engine ------------------------------------------------------

function compareDepartments(deptA: Department, deptB: Department, ctx: AiDataContext): AiResult {
  const staffA = ctx.staff.filter((s) => s.deptId === deptA.id);
  const staffB = ctx.staff.filter((s) => s.deptId === deptB.id);
  const vacA = ctx.positions.filter((p) => p.deptId === deptA.id && p.isVacant && p.status !== 'CLOSED');
  const vacB = ctx.positions.filter((p) => p.deptId === deptB.id && p.isVacant && p.status !== 'CLOSED');

  const headA = deptA.headStaffId ? ctx.staff.find((s) => s.id === deptA.headStaffId) : null;
  const headB = deptB.headStaffId ? ctx.staff.find((s) => s.id === deptB.headStaffId) : null;

  const diff = Math.abs(staffA.length - staffB.length);
  let summary: string;
  if (staffA.length > staffB.length) {
    summary = `${deptA.name} has ${diff} more employee${diff === 1 ? '' : 's'} than ${deptB.name}.`;
  } else if (staffB.length > staffA.length) {
    summary = `${deptB.name} has ${diff} more employee${diff === 1 ? '' : 's'} than ${deptA.name}.`;
  } else {
    summary = `Both ${deptA.name} and ${deptB.name} have an equal headcount of ${staffA.length} employee${staffA.length === 1 ? '' : 's'}.`;
  }

  const block: ComparisonBlock = {
    kind: 'comparison',
    title: `Headcount Comparison: ${deptA.name} vs ${deptB.name}`,
    itemA: {
      id: deptA.id,
      name: deptA.name,
      entityType: 'department',
      employeeCount: staffA.length,
      vacancyCount: vacA.length,
      headName: headA ? headA.name : null,
    },
    itemB: {
      id: deptB.id,
      name: deptB.name,
      entityType: 'department',
      employeeCount: staffB.length,
      vacancyCount: vacB.length,
      headName: headB ? headB.name : null,
    },
    differenceSummary: summary,
  };

  const answer =
    `Department Comparison:\n\n` +
    `• ${deptA.name}: ${plural(staffA.length, 'employee')}, ${plural(vacA.length, 'open vacancy')}, Head: ${headA ? headA.name : 'None'}\n` +
    `• ${deptB.name}: ${plural(staffB.length, 'employee')}, ${plural(vacB.length, 'open vacancy')}, Head: ${headB ? headB.name : 'None'}\n\n` +
    `${summary}`;

  return {
    intent: 'comparison',
    context: {
      deptA: deptA.name,
      countA: staffA.length,
      deptB: deptB.name,
      countB: staffB.length,
      diff,
    },
    answer,
    blocks: [block],
    actions: [
      { kind: 'navigate', label: `View ${deptA.name}`, route: '/staff', deptId: deptA.id, icon: 'pi pi-users' },
      { kind: 'navigate', label: `View ${deptB.name}`, route: '/staff', deptId: deptB.id, icon: 'pi pi-users' },
    ],
    updatedContext: {
      departmentId: deptA.id,
      departmentName: deptA.name,
      comparisonDeptId: deptB.id,
      lastIntent: 'comparison',
    },
    tone: 'normal',
  };
}

// ---- Data Quality Queries ---------------------------------------------------

function evaluateDataQuality(q: string, ctx: AiDataContext): AiResult {
  if (!ctx.canViewActivity) {
    return {
      intent: 'denied',
      context: { reason: 'rbac-admin-only' },
      answer: 'Organizational data quality and audit metrics are restricted to Administrators.',
      actions: [],
      tone: 'denied',
    };
  }

  const issues: DataQualityIssue[] = [];
  let category = 'General Data Quality';

  if (q.includes('no manager') || q.includes('missing manager') || q.includes('without manager')) {
    category = 'Staff without Manager';
    const noMgr = ctx.staff.filter((s) => s.managerId == null && s.status === EntityStatus.ACTIVE);
    noMgr.forEach((s) => {
      issues.push({
        id: s.id,
        entityType: 'staff',
        name: s.name,
        issue: 'No reporting manager assigned (Root node)',
        route: '/staff',
        staffId: s.id,
      });
    });
  } else if (q.includes('no head') || q.includes('without head') || q.includes('missing head')) {
    category = 'Departments without Head';
    const noHead = ctx.departments.filter((d) => d.headStaffId == null);
    noHead.forEach((d) => {
      issues.push({
        id: d.id,
        entityType: 'department',
        name: d.name,
        issue: 'No Department Head (Manager) assigned',
        route: '/departments',
      });
    });
  } else if (q.includes('phone') || q.includes('email') || q.includes('contact') || q.includes('incomplete')) {
    category = 'Incomplete Employee Records';
    ctx.staff.forEach((s) => {
      const missing: string[] = [];
      if (!s.email) missing.push('Email');
      if (!s.cellNumber && !s.landline) missing.push('Phone');
      if (!s.employeeCode) missing.push('Employee Code');
      if (missing.length > 0) {
        issues.push({
          id: s.id,
          entityType: 'staff',
          name: s.name,
          issue: `Missing ${missing.join(', ')}`,
          route: '/staff',
          staffId: s.id,
        });
      }
    });
  } else {
    category = 'OMS Data Health Overview';
    const noMgr = ctx.staff.filter((s) => s.managerId == null && s.status === EntityStatus.ACTIVE).length;
    const noHead = ctx.departments.filter((d) => d.headStaffId == null).length;
    const noEmail = ctx.staff.filter((s) => !s.email).length;
    const noPhone = ctx.staff.filter((s) => !s.cellNumber && !s.landline).length;

    const summary =
      `Data Quality Summary across ${ctx.staff.length} staff and ${ctx.departments.length} departments:\n` +
      `• Staff without manager: ${noMgr}\n` +
      `• Departments without head: ${noHead}\n` +
      `• Staff without email: ${noEmail}\n` +
      `• Staff without phone: ${noPhone}`;

    return {
      intent: 'data-quality',
      context: { noMgr, noHead, noEmail, noPhone },
      answer: summary,
      actions: [{ kind: 'navigate', label: 'Open Staff Directory', route: '/staff', icon: 'pi pi-users' }],
      tone: 'normal',
    };
  }

  const block: DataQualityBlock = {
    kind: 'data-quality',
    category,
    summary: `Found ${issues.length} record(s) with ${category.toLowerCase()}:`,
    totalIssues: issues.length,
    issues: issues.slice(0, 15),
  };

  const lines = issues.slice(0, 10).map((i) => `• ${i.name} — ${i.issue}`);
  const more = issues.length > 10 ? `\n…and ${issues.length - 10} more.` : '';

  return {
    intent: 'data-quality',
    context: { category, issueCount: issues.length },
    answer: `Found ${plural(issues.length, 'record')} with ${category.toLowerCase()}:\n\n${lines.join('\n')}${more}`,
    blocks: [block],
    actions: [{ kind: 'navigate', label: 'Review in Staff Directory', route: '/staff', icon: 'pi pi-users' }],
    tone: issues.length ? 'normal' : 'empty',
  };
}

// ---- Step-by-Step How-To Guides ---------------------------------------------

function guideAddStaff(): AiResult {
  return {
    intent: 'how-to',
    context: { topic: 'add-staff' },
    answer:
      `Here is the step-by-step guide to add a new staff member to OMS:\n\n` +
      `1. Open Staff Directory:\n` +
      `   Click "Open Staff directory" below or choose Staff from the sidebar.\n\n` +
      `2. Launch the Add Staff Form:\n` +
      `   Click the "+ Add Staff" button in the top-right toolbar.\n\n` +
      `3. Assign Company & Department:\n` +
      `   Select the operating entity and division.\n\n` +
      `4. Enter Employee Information:\n` +
      `   Fill in Full Name, Job Title / Designation, and Contact details (Email, Landline, Mobile).\n\n` +
      `5. Set Reporting Manager:\n` +
      `   Select their supervisor from the "Reports To" dropdown to place them directly in the Organogram hierarchy.\n\n` +
      `6. Save:\n` +
      `   Click "Save Staff" — the Organogram tree and company directories update instantly.`,
    actions: [
      { kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' },
      { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' },
    ],
    tone: 'normal',
  };
}

function guideAddCompany(): AiResult {
  return {
    intent: 'how-to',
    context: { topic: 'add-company' },
    answer:
      `Here is how to register a new group company/entity:\n\n` +
      `1. Open the Companies page from the sidebar menu.\n` +
      `2. Click the "+ Add Company" button in the top toolbar.\n` +
      `3. Enter the Company Name, Registration Code (e.g. REG-01), and Head Office address.\n` +
      `4. Set the operational status to Active and click "Save Company".\n` +
      `5. Once registered, you can assign departments and staff to this entity.`,
    actions: [
      { kind: 'navigate', label: 'Open Companies', icon: 'pi pi-building', route: '/companies' },
    ],
    tone: 'normal',
  };
}

function guideAddDepartment(): AiResult {
  return {
    intent: 'how-to',
    context: { topic: 'add-department' },
    answer:
      `Here is how to create a new department:\n\n` +
      `1. Open Departments from the main sidebar.\n` +
      `2. Click the "+ Add Department" button.\n` +
      `3. Select the parent Company and enter the Department Name and Description.\n` +
      `4. Designate a Department Head (Manager) from your staff list.\n` +
      `5. Click "Save Department" to structure reporting teams under this division.`,
    actions: [
      { kind: 'navigate', label: 'Open Departments', icon: 'pi pi-briefcase', route: '/departments' },
    ],
    tone: 'normal',
  };
}

function guideAddVacancy(): AiResult {
  return {
    intent: 'how-to',
    context: { topic: 'add-vacancy' },
    answer:
      `Here is how to create and manage an open vacancy:\n\n` +
      `1. Navigate to Open Vacancies in the sidebar.\n` +
      `2. Click the "+ Add Position" button in the upper toolbar.\n` +
      `3. Specify the Position Title, Company, and Department.\n` +
      `4. Check "Mark as Vacant" and set the Status to "OPEN".\n` +
      `5. Save — the position will be displayed on both the Organogram tree and Vacancies board.`,
    actions: [
      { kind: 'navigate', label: 'Open Vacancies', icon: 'pi pi-inbox', route: '/vacancies' },
      { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' },
    ],
    tone: 'normal',
  };
}

function guideChangeManager(): AiResult {
  return {
    intent: 'how-to',
    context: { topic: 'change-manager' },
    answer:
      `You can reassign reporting lines in two quick ways:\n\n` +
      `• Method 1 (Interactive Drag & Drop in Organogram):\n` +
      `  Open the Organogram Tree Viewer, click & drag any employee card, and drop it directly onto their new manager's card. The hierarchy updates immediately with cycle-prevention safety.\n\n` +
      `• Method 2 (Staff Directory):\n` +
      `  Go to Staff Directory, click "Edit" on the employee, choose their new manager in the "Reports To" dropdown, and click Save.`,
    actions: [
      { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' },
      { kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' },
    ],
    tone: 'normal',
  };
}

function guideExportOrganogram(): AiResult {
  return {
    intent: 'how-to',
    context: { topic: 'export-organogram' },
    answer:
      `Here is how to export the Organogram structure:\n\n` +
      `1. Open the Organogram Tree Viewer.\n` +
      `2. In the top-right toolbar, click the Export Organogram button (download icon).\n` +
      `3. A dedicated printable high-resolution document opens in a new tab where you can save as PDF, PNG, or print directly.`,
    actions: [
      { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' },
    ],
    tone: 'normal',
  };
}

// ---- Conversational & Recovery Responses ------------------------------------

const ask = (label: string, prompt: string, icon: string): AiAction => ({
  kind: 'ask-prompt',
  label,
  icon,
  prompt,
});

const suggest = (label: string, query: string, icon: string): AiSuggestion => ({ label, query, icon });

/**
 * Picks a real department name so starter prompts reference live data rather
 * than a hard-coded example that may not exist in this tenant.
 */
function sampleDeptName(ctx: AiDataContext): string {
  const byHeadcount = [...ctx.departments].sort(
    (a, b) => ctx.staff.filter((s) => s.deptId === b.id).length - ctx.staff.filter((s) => s.deptId === a.id).length,
  );
  return byHeadcount[0]?.name ?? 'Finance';
}

function greetingResult(ctx: AiDataContext): AiResult {
  return {
    intent: 'greeting',
    context: { kind: 'greeting' },
    answer:
      'Hi! What would you like to know about your organization?\n\n' +
      'I can help you find employees, explore departments, check vacancies, ' +
      'understand reporting lines and view organisation insights.',
    actions: [],
    suggestions: [
      suggest('Find an employee', 'Find an employee', 'pi pi-search'),
      suggest('Show open vacancies', 'Show open vacancies', 'pi pi-inbox'),
      suggest('Explore departments', 'Show department sizes', 'pi pi-building'),
      suggest('Organisation overview', `Who heads ${sampleDeptName(ctx)}?`, 'pi pi-chart-bar'),
    ],
    tone: 'normal',
    skipRephrase: true,
  };
}

function courtesyResult(): AiResult {
  return {
    intent: 'courtesy',
    context: { kind: 'courtesy' },
    answer: "You're welcome. Anything else you'd like to know?",
    actions: [],
    suggestions: [
      suggest('Show open vacancies', 'Show open vacancies', 'pi pi-inbox'),
      suggest('Who joined recently?', 'Who joined recently?', 'pi pi-calendar'),
      suggest('Explore departments', 'Show department sizes', 'pi pi-building'),
    ],
    tone: 'normal',
    skipRephrase: true,
  };
}

/**
 * The full capability reference. Shown only when the user explicitly asks —
 * never as the reply to a query the engine merely failed to understand.
 */
function capabilityResult(ctx: AiDataContext): AiResult {
  const person = ctx.staff[0]?.name ?? 'Sarah Perera';
  const first = firstName(person);
  const dept = sampleDeptName(ctx);
  const otherDept = ctx.departments.find((d) => d.name !== dept)?.name ?? 'Operations';

  const block: CapabilityBlock = {
    kind: 'capability',
    groups: [
      {
        title: 'People',
        icon: 'pi pi-users',
        examples: [
          { label: `Find ${person}`, query: `Find ${person}` },
          { label: `Who is ${first}'s manager?`, query: `Who is the manager of ${person}?` },
          { label: `Who reports to ${first}?`, query: `Who reports to ${person}?` },
          { label: `Show employees in ${dept}`, query: `Show employees in ${dept}` },
        ],
      },
      {
        title: 'Organisation',
        icon: 'pi pi-building',
        examples: [
          { label: `Who heads ${dept}?`, query: `Who heads ${dept}?` },
          { label: `Compare ${dept} and ${otherDept}`, query: `Compare ${dept} and ${otherDept}` },
          { label: 'Show department sizes', query: 'Which department has the most employees?' },
        ],
      },
      {
        title: 'Vacancies',
        icon: 'pi pi-inbox',
        examples: [
          { label: 'Show open vacancies', query: 'Show open vacancies' },
          { label: `Vacancies in ${dept}`, query: `Vacancies in ${dept}` },
        ],
      },
      {
        title: 'Insights',
        icon: 'pi pi-chart-bar',
        examples: [
          { label: 'Who joined recently?', query: 'Who joined recently?' },
          { label: 'Which departments have no head?', query: 'Which departments have no head?' },
        ],
      },
    ],
  };

  return {
    intent: 'capabilities',
    context: { kind: 'capabilities' },
    answer: 'Here is what I can help with — tap any example to run it.',
    blocks: [block],
    actions: [],
    suggestions: [],
    tone: 'normal',
    skipRephrase: true,
  };
}

/**
 * Compact recovery for a query we could not map. Replaces the former
 * six-bullet help dump, which consumed most of the panel on every miss.
 */
function compactUnknown(query: string): AiResult {
  const shown = query.length > 40 ? `${query.slice(0, 40)}…` : query;
  return {
    intent: 'unknown',
    context: { query },
    answer:
      `I'm not sure what you mean by "${shown}".\n\n` +
      'Try asking about an employee, department, vacancy or reporting line.',
    actions: [
      ask('See examples', 'What can you do?', 'pi pi-list'),
      ask('Find employee', 'Find an employee', 'pi pi-search'),
    ],
    suggestions: [],
    tone: 'empty',
    skipRephrase: true,
  };
}

/**
 * Offered when scoring found a likely interpretation but not a confident one —
 * a typo, or a phrasing close to a known concept. The user confirms rather than
 * the engine guessing, so a wrong reading is never presented as a fact.
 */
function didYouMeanResult(query: string, label: string, canonicalQuery: string, confidence: number): AiResult {
  return {
    intent: 'did-you-mean',
    context: { query, suggestion: canonicalQuery, confidence },
    answer: `Did you mean "${label}"?`,
    actions: [
      ask(label, canonicalQuery, 'pi pi-check'),
      ask('See examples', 'What can you do?', 'pi pi-list'),
    ],
    suggestions: [],
    confidence,
    tone: 'empty',
    skipRephrase: true,
  };
}

function helpResult(): AiResult {
  return {
    intent: 'help',
    context: {},
    answer:
      'I can answer questions and guide you through your organisation. Try:\n' +
      '• Find Sarah Perera\n' +
      '• Who is her manager?\n' +
      '• Show her whole team\n' +
      '• Show employees in Finance\n' +
      '• Compare Finance and Operations headcount\n' +
      '• Which departments have no head?\n' +
      '• Show open vacancies\n' +
      '• Guide me how to add a staff',
    actions: [],
    tone: 'normal',
  };
}

// ---- Concept Detectors ------------------------------------------------------
//
// Each detector answers "is this query about X?" from the normalised text, so
// synonyms live in intent-vocabulary.ts instead of being duplicated per branch.
// Possessives are already folded by the normaliser ("Sarah's manager" reads as
// "sarah manager"), which is what lets the short forms below work.

/** "Who is X's manager?", "Sarah manager", "who does X report to", "managed by". */
function isManagerOfQuery(text: string): boolean {
  return (
    /\b(?:manager|boss|supervisor|superior)\s+of\b/.test(text) ||
    /\bwho\s+(?:is|are)\b.*\b(?:manager|boss|supervisor|superior)\b/.test(text) ||
    /\bwho\s+manages\b/.test(text) ||
    /\bwho\s+does\b.*\breports?\s+to\b/.test(text) ||
    /\breports?\s+to\s+who(?:m)?\b/.test(text) ||
    /\b(?:my|her|his|their|this|that|the)\s+(?:line\s+)?(?:manager|boss|supervisor)\b/.test(text) ||
    /\bmanaged\s+by\b/.test(text) ||
    // Trailing role word: "Sarah manager", "Finance boss".
    /\b(?:manager|boss|supervisor)\s*$/.test(text)
  );
}

/** "Who heads Finance?", "Finance head", "head of Operations", "led by". */
function isDepartmentHeadQuery(text: string): boolean {
  return (
    /\b(?:head|hod)\s+of\b/.test(text) ||
    /\bdepartment\s+head\b/.test(text) ||
    /\bwho\s+(?:heads|leads|runs)\b/.test(text) ||
    /\b(?:headed|led|run)\s+by\b/.test(text) ||
    /\bin\s+charge\s+of\b/.test(text) ||
    /\bhead\s*$/.test(text)
  );
}

/** "Who reports to Sarah?", "her direct reports", "who works under X". */
function isDirectReportsQuery(text: string): boolean {
  if (/\breport\s+(?:a|an|the)?\s*(?:bug|issue|problem)\b/.test(text)) return false;
  return (
    /\bwho\s+reports?\s+to\b/.test(text) ||
    /\bdirect\s+reports?\b/.test(text) ||
    /\breports?\s+of\b/.test(text) ||
    /\bteam\s+of\b/.test(text) ||
    /\bwho\s+works\s+(?:for|under)\b/.test(text) ||
    /\breport(?:s|ing)?\b/.test(text)
  );
}

/**
 * Staff whose job title matches the query phrase — "Operations Manager".
 *
 * Deliberately conservative: only whole-phrase containment, and only for
 * queries short enough to plausibly *be* a title, so a long sentence never
 * matches a person because it happens to contain the word "Director".
 */
function extractTitlePhrase(text: string): string {
  return text
    .trim()
    .replace(/^(?:who|which)\s+(?:is|are)\s+(?:(?:a|an|the)\s+)?/, '')
    .replace(/^(?:find|show|list|locate)\s+(?:me\s+)?(?:(?:a|an|the)\s+)?/, '')
    .replace(/\b(?:employee|employees|person|people)\s+(?:who|that)\s+(?:is|are|works?)\s+(?:(?:a|an|the)\s+)?/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchStaffByTitle(text: string, ctx: AiDataContext): Staff[] {
  const phrase = extractTitlePhrase(text);
  const phraseTokens = phrase.split(/\s+/).filter(Boolean);
  if (phrase.length < 4 || phraseTokens.length > 4) return [];

  const exact = ctx.staff.filter((s) => (s.title ?? '').toLowerCase() === phrase);
  if (exact.length) return exact;

  return ctx.staff.filter((s) => {
    const title = (s.title ?? '').toLowerCase();
    if (title.length < 4) return false;
    if (title.includes(phrase) || phrase.includes(title)) return true;

    const titleTokens = title.split(/[^a-z0-9]+/).filter(Boolean);
    return phraseTokens.every((queryToken) =>
      titleTokens.some((titleToken) => fuzzyEquals(queryToken, titleToken)),
    );
  });
}

function resolvedTitleLabel(matches: Staff[], text: string): string {
  const distinctTitles = Array.from(new Set(matches.map((s) => s.title).filter((title): title is string => !!title)));
  return distinctTitles.length === 1 ? distinctTitles[0] : extractTitlePhrase(text);
}

/** True when the query asks to search staff but names nobody in particular. */
function isBareEmployeeSearch(nq: NormalizedQuery): boolean {
  const words = nq.coreTokens.filter((t) => !['find', 'search', 'lookup', 'look', 'up', 'for', 'show', 'list'].includes(t));
  return words.length > 0 && words.every((w) => hasTerm(w, EMPLOYEE_TERMS));
}

function employeeSearchPrompt(): AiResult {
  return {
    intent: 'find-employee',
    context: { needs: 'employee-identifier' },
    answer:
      'Who are you looking for? Type a name, employee code (e.g. EMP-001), email address or mobile number.\n\n' +
      'You can also ask for a whole department, such as "Show employees in Finance".',
    actions: [{ kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' }],
    suggestions: [],
    tone: 'empty',
    skipRephrase: true,
  };
}

function titleSearchResult(matches: Staff[], phrase: string, ctx: AiDataContext): AiResult {
  const blocks = matches.slice(0, 6).map((s) => buildEmployeeBlock(s, ctx));
  return {
    intent: 'positions-by-title',
    context: { title: phrase, count: matches.length, names: matches.map((m) => m.name) },
    answer:
      `${plural(matches.length, 'employee')} match "${phrase}":\n` +
      matches.slice(0, 10).map((s) => `• ${s.name} — ${s.title} (${ctx.deptName(s.deptId)})`).join('\n'),
    blocks,
    actions: [{ kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' }],
    updatedContext:
      matches.length === 1
        ? {
            staffId: matches[0].id,
            staffName: matches[0].name,
            departmentId: matches[0].deptId,
            departmentName: ctx.deptName(matches[0].deptId),
            lastEntityType: 'staff',
            lastIntent: 'positions-by-title',
          }
        : { lastIntent: 'positions-by-title' },
    tone: 'normal',
  };
}

/** Answers "who heads X" for a resolved department. */
function departmentHeadResult(dept: Department, ctx: AiDataContext): AiResult {
  const head = dept.headStaffId != null ? ctx.staff.find((s) => s.id === dept.headStaffId) : null;
  if (!head) {
    return {
      intent: 'department-head',
      context: { department: dept.name, head: null },
      answer: `${dept.name} has no department head assigned.`,
      blocks: [buildDepartmentBlock(dept, ctx)],
      actions: [{ kind: 'navigate', label: 'Open Departments', icon: 'pi pi-briefcase', route: '/departments' }],
      updatedContext: { departmentId: dept.id, departmentName: dept.name, lastEntityType: 'department', lastIntent: 'department-head' },
      tone: 'empty',
    };
  }
  return {
    intent: 'department-head',
    context: { department: dept.name, head: head.name },
    answer: `${dept.name} is headed by ${head.name}${head.title ? `, ${head.title}` : ''}.`,
    blocks: [buildDepartmentBlock(dept, ctx), buildEmployeeBlock(head, ctx)],
    actions: [focusAction(head), { kind: 'navigate', label: `View ${dept.name} Staff`, route: '/staff', deptId: dept.id, icon: 'pi pi-users' }],
    updatedContext: {
      staffId: head.id,
      staffName: head.name,
      departmentId: dept.id,
      departmentName: dept.name,
      lastEntityType: 'staff',
      lastIntent: 'department-head',
    },
    tone: 'normal',
  };
}

// ---- Main Pure Entry Point --------------------------------------------------

export function interpret(rawQuery: string, ctx: AiDataContext): AiResult {
  const query = rawQuery.trim();
  if (!query) return helpResult();

  // 1. Security Check: Restricted Compensation Fields
  if (RESTRICTED.test(query)) {
    return {
      intent: 'denied',
      context: { reason: 'restricted-field' },
      answer: "You don't have permission to access salary or compensation information, and OMS does not expose it.",
      actions: [],
      tone: 'denied',
    };
  }

  const nq = normalizeQuery(query);
  const q = nq.lower;
  const normalized = nq.text;
  const isGuide = /\b(guide|how\s+to|how\s+do\s+i|steps\s+to|where\s+to|teach|tutorial|instructions|walkthrough)\b/i.test(normalized);

  // 1b. Small talk — answered conversationally, never sent to a data lookup.
  if (!isGuide) {
    const smallTalk = detectSmallTalk(nq);
    if (smallTalk === 'greeting') return greetingResult(ctx);
    if (smallTalk === 'courtesy') return courtesyResult();
  }

  // 1c. Capability questions ("what can you do?", "examples", bare "help").
  // Guarded on entities so "help me find Sarah" stays an employee lookup.
  if (!isGuide && isCapabilityQuery(nq, namesConcreteEntity(query, ctx))) return capabilityResult(ctx);

  // 2. Step-by-Step How-To Guides
  if (isGuide) {
    if (/\b(staff|employee|person|user|member|hire|onboard)\b/i.test(normalized)) return guideAddStaff();
    if (/\b(company|entity|firm|subsidiary)\b/i.test(normalized)) return guideAddCompany();
    if (/\b(department|dept|division|team)\b/i.test(normalized)) return guideAddDepartment();
    if (/\b(vacancy|vacancies|job|position|opening|hiring)\b/i.test(normalized)) return guideAddVacancy();
    if (/\b(reporting|manager|supervisor|reassign|transfer|drag|hierarchy)\b/i.test(normalized)) return guideChangeManager();
    if (/\b(export|download|print|save|pdf|png)\b/i.test(normalized)) return guideExportOrganogram();
  }

  // 3. Comparisons: "Compare Finance and Operations headcount", "Which department is bigger, HR or Finance?"
  if (/\b(compare|versus|vs|bigger|larger|difference between|more employees)\b/i.test(q)) {
    const matchedDepts = ctx.departments.filter((d) => q.includes(d.name.toLowerCase()));
    if (matchedDepts.length >= 2) {
      return compareDepartments(matchedDepts[0], matchedDepts[1], ctx);
    }
    if (matchedDepts.length === 1 && (hasDeptPronoun(q) || ctx.currentContext?.departmentId != null)) {
      const activeDeptId = ctx.currentContext?.departmentId;
      const activeDept = activeDeptId ? ctx.departments.find((d) => d.id === activeDeptId) : null;
      if (activeDept && activeDept.id !== matchedDepts[0].id) {
        return compareDepartments(activeDept, matchedDepts[0], ctx);
      }
    }
    if (ctx.departments.length >= 2) {
      const sorted = [...ctx.departments].sort(
        (a, b) => ctx.staff.filter((s) => s.deptId === b.id).length - ctx.staff.filter((s) => s.deptId === a.id).length,
      );
      return compareDepartments(sorted[0], sorted[1], ctx);
    }
  }

  // 4. Data Quality Queries (Admins): "Which employees have no manager?", "Departments without head"
  if (/\b(no manager|without manager|no head|without head|incomplete|missing manager|no email|no phone)\b/i.test(q)) {
    return evaluateDataQuality(q, ctx);
  }

  // 5. Reporting Chain: "Show Sarah's reporting chain", "How does Sarah report up to the CEO?"
  if (hasTerm(normalized, CHAIN_TERMS) || /\b(?:levels below|manager.s manager|boss.s boss)\b/i.test(q)) {
    const people = matchStaffWithContext(query, ctx);
    if (people.length === 1) return getReportingChain(people[0], ctx);
    if (people.length > 1) return handleAmbiguousStaff(people, ctx, searchTermFor(query, people));
    return noPersonResult('reporting-chain', query);
  }

  // 6. Team Hierarchy: "Show Sarah's whole team", "Everyone under Sarah"
  if (hasTerm(normalized, FULL_TEAM_TERMS)) {
    const people = matchStaffWithContext(query, ctx);
    if (people.length === 1) return getTeamHierarchy(people[0], ctx);
    if (people.length > 1) return handleAmbiguousStaff(people, ctx, searchTermFor(query, people));
    return noPersonResult('team-hierarchy', query);
  }

  // 7. Manager Of / Direct Supervisor: "Who manages Sarah?", "Sarah's boss", "Finance manager"
  if (isManagerOfQuery(normalized)) {
    const people = matchStaffWithContext(query, ctx);
    if (people.length === 1) {
      const person = people[0];
      const manager = person.managerId != null ? ctx.staff.find((s) => s.id === person.managerId) : null;
      const updatedContext: AskOmsContext = {
        staffId: person.id,
        staffName: person.name,
        departmentId: person.deptId,
        departmentName: ctx.deptName(person.deptId),
        companyId: person.companyId,
        companyName: ctx.companyName(person.companyId),
        lastEntityType: 'staff',
        lastIntent: 'manager-of',
      };

      if (!manager) {
        return {
          intent: 'manager-of',
          context: { employee: person.name, manager: null },
          answer: `${person.name} has no manager assigned — sitting at the top of their reporting line in ${ctx.companyName(person.companyId)}.`,
          blocks: [buildEmployeeBlock(person, ctx)],
          actions: [focusAction(person)],
          updatedContext,
          tone: 'empty',
        };
      }

      return {
        intent: 'manager-of',
        context: { employee: person.name, manager: manager.name },
        answer: `${person.name} reports directly to ${manager.name}${manager.title ? `, ${manager.title}` : ''} in ${ctx.deptName(manager.deptId)}.`,
        blocks: [buildEmployeeBlock(person, ctx), buildEmployeeBlock(manager, ctx)],
        actions: [focusAction(manager), focusAction(person)],
        updatedContext,
        tone: 'normal',
      };
    }

    // "Operations Manager" is a job title before it is a question about a
    // department's leader, so a title hit wins over the department fallback.
    const byTitle = matchStaffByTitle(normalized, ctx);
    if (byTitle.length) return titleSearchResult(byTitle, normalized, ctx);

    // "Who manages Finance?" / "Finance manager" — the department's head.
    const dept = matchDepartmentWithContext(query, ctx);
    if (dept) return departmentHeadResult(dept, ctx);

    if (people.length > 1) return handleAmbiguousStaff(people, ctx, searchTermFor(query, people));
    return noPersonResult('manager-of', query);
  }

  // 8. Direct Reports: "Who reports to Sarah?", "Who reports to her?", "Her direct reports"
  if (isDirectReportsQuery(normalized)) {
    const people = matchStaffWithContext(query, ctx);
    if (people.length === 1) {
      const person = people[0];
      const direct = ctx.staff.filter((s) => s.managerId === person.id);
      const updatedContext: AskOmsContext = {
        staffId: person.id,
        staffName: person.name,
        departmentId: person.deptId,
        departmentName: ctx.deptName(person.deptId),
        companyId: person.companyId,
        companyName: ctx.companyName(person.companyId),
        lastEntityType: 'staff',
        lastIntent: 'reporting-hierarchy',
      };

      const empBlock = buildEmployeeBlock(person, ctx);
      const reportBlocks = direct.map((r) => buildEmployeeBlock(r, ctx));

      const answer = direct.length
        ? `${plural(direct.length, 'person', 'people')} report directly to ${person.name} in ${ctx.deptName(person.deptId)}:\n` +
          direct.map((r) => `• ${r.name}${r.title ? ` — ${r.title}` : ''}`).join('\n')
        : `${person.name}${person.title ? ` (${person.title})` : ''} has no direct reports on record.`;

      return {
        intent: 'reporting-hierarchy',
        context: { manager: person.name, count: direct.length, reports: direct.map((d) => d.name) },
        answer,
        blocks: [empBlock, ...reportBlocks],
        actions: [focusAction(person), { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' }],
        updatedContext,
        tone: direct.length ? 'normal' : 'empty',
      };
    }
    if (people.length > 1) return handleAmbiguousStaff(people, ctx, searchTermFor(query, people));
    return noPersonResult('reporting-hierarchy', query);
  }

  // 8b. Scoped department headcount must precede contact lookup because
  // phrases such as "number of staff" contain the otherwise-contact keyword
  // "number".
  const deptMatch = matchDepartmentWithContext(query, ctx);
  if (isStaffHeadcountQuery(normalized)) {
    if (deptMatch) return getDepartmentHeadcount(deptMatch, ctx);
    const scope = explicitScopeName(normalized);
    if (scope) return departmentNotFound(scope, ctx);
  }

  // 9. Contact details: "Contact details for Sarah", "What is her email/phone?"
  if (hasTerm(normalized, CONTACT_TERMS) || /\bnumber\b|\bcall\b/.test(normalized)) {
    const people = matchStaffWithContext(query, ctx);
    if (people.length === 1) {
      const person = people[0];
      const lines: string[] = [];
      if (person.email) lines.push(`Email: ${person.email}`);
      if (person.cellNumber) lines.push(`Mobile: ${person.cellNumber}`);
      if (person.landline) lines.push(`Landline: ${person.landline}`);

      const updatedContext: AskOmsContext = {
        staffId: person.id,
        staffName: person.name,
        departmentId: person.deptId,
        departmentName: ctx.deptName(person.deptId),
        companyId: person.companyId,
        companyName: ctx.companyName(person.companyId),
        lastEntityType: 'staff',
        lastIntent: 'contact-info',
      };

      return {
        intent: 'contact-info',
        context: { name: person.name, email: person.email, mobile: person.cellNumber },
        answer: lines.length
          ? `Contact details for ${person.name}${person.title ? ` (${person.title})` : ''}:\n` + lines.map((l) => `• ${l}`).join('\n')
          : `No contact details are recorded for ${person.name}.`,
        blocks: [buildEmployeeBlock(person, ctx)],
        actions: [focusAction(person), { kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' }],
        updatedContext,
        tone: lines.length ? 'normal' : 'empty',
      };
    }
    if (people.length > 1) return handleAmbiguousStaff(people, ctx, searchTermFor(query, people));
    return noPersonResult('contact-info', query);
  }

  // 10. Vacancies (General or Scoped): "Any vacancies in her department?", "Vacancies in IT", "vacant positions"
  if (hasTerm(normalized, VACANCY_TERMS)) {
    const dept = matchDepartmentWithContext(query, ctx);
    if (dept) {
      const vacs = openVacancies(ctx, dept.id);
      const answer = vacs.length
        ? `${dept.name} currently has ${plural(vacs.length, 'open vacancy', 'open vacancies')}:\n` +
          vacs.map((v) => `• ${v.title}`).join('\n')
        : `${dept.name} currently has no open vacancies.`;

      return {
        intent: 'vacancies',
        context: { department: dept.name, openCount: vacs.length, titles: vacs.map((v) => v.title) },
        answer,
        blocks: vacs.length
          ? [buildVacancySummaryBlock(vacs, ctx, dept)]
          : [buildDepartmentBlock(dept, ctx)],
        actions: [
          { kind: 'navigate', label: `View ${dept.name} Vacancies`, route: '/vacancies', deptId: dept.id, icon: 'pi pi-inbox' },
        ],
        updatedContext: { departmentId: dept.id, departmentName: dept.name, lastEntityType: 'vacancy', lastIntent: 'vacancies' },
        tone: vacs.length ? 'normal' : 'empty',
      };
    }

    // "Vacancies in Treasury" must not silently answer with every vacancy in
    // the group � an unresolvable scope is its own, distinct outcome.
    const scope = explicitScopeName(normalized);
    if (scope) return departmentNotFound(scope, ctx);

    const open = openVacancies(ctx);
    const summary = buildVacancySummaryBlock(open, ctx);
    const answer = open.length
      ? `There ${open.length === 1 ? 'is' : 'are'} ${plural(open.length, 'open vacancy', 'open vacancies')} across ` +
        `${plural(summary.departmentCount, 'department')}:\n` +
        summary.byDepartment.map((d) => `• ${d.name}: ${d.count}`).join('\n')
      : 'There are currently no active open vacancies across the group.';

    return {
      intent: 'vacancies',
      context: {
        openCount: open.length,
        byDepartment: summary.byDepartment.map((d) => ({ department: d.name, count: d.count })),
      },
      answer,
      blocks: open.length ? [summary] : [],
      // Department drill-down is offered as a follow-up suggestion, so it is
      // deliberately not repeated as an action here.
      actions: [{ kind: 'navigate', label: 'View vacancies', icon: 'pi pi-inbox', route: '/vacancies' }],
      updatedContext: { lastEntityType: 'vacancy', lastIntent: 'vacancies' },
      tone: open.length ? 'normal' : 'empty',
    };
  }

  // 10b. Department Head: "Who heads IT?", "Finance head", "head of Finance".
  // Sits ahead of the department-scoped branch, which would otherwise swallow
  // short forms like "Finance head" and answer with the full department card.
  if (isDepartmentHeadQuery(normalized)) {
    const headDept = matchDepartmentWithContext(query, ctx);
    if (headDept) return departmentHeadResult(headDept, ctx);
  }

  // 11. Department-Scoped Staff & Managers Queries: "Show employees in Finance", "Managers in IT"
  if (deptMatch && (/\b(employees|staff|people|who works|managers|headcount)\b/i.test(q) || q.split(/\s+/).length <= 4)) {
    if (/\b(manager|managers|leads|supervisors)\b/i.test(q)) {
      const deptStaff = ctx.staff.filter((s) => s.deptId === deptMatch.id);
      const managers = deptStaff.filter((s) => ctx.staff.some((r) => r.managerId === s.id) || s.id === deptMatch.headStaffId);
      const mgrBlocks = managers.map((m) => buildEmployeeBlock(m, ctx));
      const answer = managers.length
        ? `Managers in ${deptMatch.name} (${managers.length}):\n` +
          managers.map((m) => `• ${m.name} — ${m.title || 'Manager'}`).join('\n')
        : `No manager records designated in ${deptMatch.name}.`;

      return {
        intent: 'department-scoped',
        context: { department: deptMatch.name, managers: managers.map((m) => m.name) },
        answer,
        blocks: [buildDepartmentBlock(deptMatch, ctx), ...mgrBlocks],
        actions: [{ kind: 'navigate', label: `View ${deptMatch.name} Staff`, route: '/staff', deptId: deptMatch.id, icon: 'pi pi-users' }],
        updatedContext: { departmentId: deptMatch.id, departmentName: deptMatch.name, lastEntityType: 'department', lastIntent: 'department-scoped' },
        tone: managers.length ? 'normal' : 'empty',
      };
    }

    return getDepartmentDetail(deptMatch, ctx);
  }

  // 11b. An explicit but unresolvable scope on a people query.
  if (!deptMatch && hasTerm(normalized, EMPLOYEE_TERMS) && !matchCompanyWithContext(query, ctx)) {
    const scope = explicitScopeName(normalized);
    if (scope) return departmentNotFound(scope, ctx);
  }

  // 12. Company-Scoped Queries: "Show employees in ABC Company", "How many employees does ABC have?"
  const compMatch = matchCompanyWithContext(query, ctx);
  if (compMatch && (/\b(employees|staff|departments|vacancies|positions|largest department)\b/i.test(q) || q.split(/\s+/).length <= 4)) {
    return getCompanyDetail(compMatch, ctx);
  }

  // 14. Joining & Recent Hires: "Who joined recently?", "When did Sarah join?"
  if (hasTerm(normalized, JOIN_TERMS)) {
    const named = matchStaffWithContext(query, ctx);
    if (named.length === 1 && /\bwhen\b|\bjoin(ed|ing)?\s+date\b|\bdate\b/.test(q)) {
      const person = named[0];
      return {
        intent: 'join-roster',
        context: { name: person.name, joined: person.dateJoined ?? null },
        answer: person.dateJoined
          ? `${person.name}${person.title ? ` (${person.title})` : ''} joined on ${person.dateJoined}.`
          : `${person.name}'s joining date is not on record in OMS.`,
        blocks: [buildEmployeeBlock(person, ctx)],
        actions: [focusAction(person)],
        updatedContext: { staffId: person.id, staffName: person.name, lastEntityType: 'staff', lastIntent: 'join-roster' },
        tone: person.dateJoined ? 'normal' : 'empty',
      };
    }

    const cutoffDays = /this week|last 7/.test(q) ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cutoffDays);

    const recent = ctx.staff
      .filter((s) => s.dateJoined && !Number.isNaN(Date.parse(s.dateJoined)) && new Date(s.dateJoined) >= cutoff)
      .sort((a, b) => Date.parse(b.dateJoined!) - Date.parse(a.dateJoined!));

    const recentBlocks = recent.slice(0, 6).map((s) => buildEmployeeBlock(s, ctx));
    const answer = recent.length
      ? `${plural(recent.length, 'person', 'people')} joined in the last ${cutoffDays} days:\n` +
        recent.slice(0, 10).map((s) => `• ${s.name} — ${ctx.deptName(s.deptId)} (${s.dateJoined})`).join('\n')
      : `No staff joinings recorded in the last ${cutoffDays} days.`;

    return {
      intent: 'recent-hires',
      context: { count: recent.length, joiners: recent.map((r) => r.name) },
      answer,
      blocks: recentBlocks,
      actions: [{ kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' }],
      updatedContext: { lastIntent: 'recent-hires' },
      tone: recent.length ? 'normal' : 'empty',
    };
  }

  // 15. Single Person Lookup / Find Employee: "Find Sarah Perera", "Where is John?"
  const foundPeople = matchStaffWithContext(query, ctx);
  if (foundPeople.length === 1) {
    const person = foundPeople[0];
    const updatedContext: AskOmsContext = {
      staffId: person.id,
      staffName: person.name,
      departmentId: person.deptId,
      departmentName: ctx.deptName(person.deptId),
      companyId: person.companyId,
      companyName: ctx.companyName(person.companyId),
      lastEntityType: 'staff',
      lastIntent: 'find-employee',
    };

    return {
      intent: 'find-employee',
      context: {
        name: person.name,
        title: person.title,
        department: ctx.deptName(person.deptId),
        company: ctx.companyName(person.companyId),
      },
      answer: `Found ${person.name}, ${person.title || 'Staff'} in ${ctx.deptName(person.deptId)} (${ctx.companyName(person.companyId)}).`,
      blocks: [buildEmployeeBlock(person, ctx)],
      actions: [
        focusAction(person),
        { kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' },
      ],
      updatedContext,
      tone: 'normal',
    };
  }
  if (foundPeople.length > 1 && !isGuide) {
    return handleAmbiguousStaff(foundPeople, ctx, searchTermFor(query, foundPeople));
  }

  // 16. Organization Stats / Largest Department: "Which department has the most employees?"
  if (
    /\bmost employees\b|\blargest department\b|\bdepartment (stats|size|sizes|breakdown)\b|\bbiggest (team|department)\b/.test(normalized) ||
    (hasTerm(normalized, HEADCOUNT_TERMS) && hasTerm(normalized, EMPLOYEE_TERMS))
  ) {
    const counts = ctx.departments
      .map((d) => ({ dept: d, count: ctx.staff.filter((s) => s.deptId === d.id).length }))
      .sort((a, b) => b.count - a.count);

    if (!counts.length) {
      return { intent: 'department-stats', context: {}, answer: 'There are no departments on record yet.', actions: [], tone: 'empty' };
    }

    const top = counts[0];
    const deptBlocks = counts.slice(0, 4).map((c) => buildDepartmentBlock(c.dept, ctx));
    const answer =
      `${top.dept.name} is the largest department with ${plural(top.count, 'employee')}.\n\n` +
      counts.slice(0, 6).map((c) => `• ${c.dept.name}: ${plural(c.count, 'employee')}`).join('\n');

    return {
      intent: 'department-stats',
      context: { largest: top.dept.name, count: top.count },
      answer,
      blocks: deptBlocks,
      actions: [{ kind: 'navigate', label: 'Open Departments', icon: 'pi pi-briefcase', route: '/departments' }],
      updatedContext: { departmentId: top.dept.id, departmentName: top.dept.name, lastEntityType: 'department', lastIntent: 'department-stats' },
      tone: 'normal',
    };
  }

  // 17. Job-title search: "Operations Manager", "Senior Engineer"
  const titleHits = matchStaffByTitle(normalized, ctx);
  if (titleHits.length) return titleSearchResult(titleHits, resolvedTitleLabel(titleHits, normalized), ctx);

  // 17b. "Find an employee" with no identifier — ask for one instead of guessing.
  if (isBareEmployeeSearch(nq)) return employeeSearchPrompt();

  // 18. Explicit help request
  if (/\bhelp\b|\bwhat can you\b|\bhow do you\b|\bcommands\b/.test(normalized)) return capabilityResult(ctx);

  // 19. Recovery: a scored interpretation the user can confirm, rather than a
  // wall of examples. Anything below the clarify floor gets the compact reply.
  const guess = bestIntent(nq);
  if (guess && guess.confidence >= CONFIDENCE.clarify) {
    return didYouMeanResult(query, guess.label, guess.canonicalQuery, guess.confidence);
  }

  return compactUnknown(query);
}
