/**
 * Ask OMS — deterministic intent engine (client-side "tools" layer).
 *
 * Every function here is pure: it takes an already-RBAC-scoped snapshot of OMS
 * data and returns a structured {@link AiResult}. This is the source of truth
 * for calculations — mirroring the backend intent/tool contract so the same
 * questions resolve identically whether answered locally or by the server.
 */
import { Company, Department, Position, Staff } from '../../core/models/organization.model';
import { EntityStatus } from '../../core/models/enums';
import { AiAction, AiResult } from './ai-models';

/** Read-only view of OMS data the engine is allowed to reason over. */
export interface AiDataContext {
  /** Staff already filtered to what the current user may see. */
  staff: Staff[];
  departments: Department[];
  positions: Position[];
  companies: Company[];
  /** The signed-in user's own staff record id, when linked. */
  currentStaffId: number | null;
  /** Whether the user may read the audit/activity trail (admins only). */
  canViewActivity: boolean;
  deptName(id?: number | null): string;
  companyName(id?: number | null): string;
}

// Prefix stems (no trailing \b) so "salary"/"salaries"/"compensation" all match.
const RESTRICTED = /\bsalar|\bcompensat|\bremunerat|\bpayroll|\bwage|\bbonus|\bctc\b|\bincome|\bpay[\s-]?(grade|scale|slip|rate|band)/i;

// ---- small helpers ----------------------------------------------------------

const isActive = (s: Staff) => s.status === EntityStatus.ACTIVE;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const titleCase = (v: string) => v.replace(/\b\w/g, (c) => c.toUpperCase());

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Command/filler words to ignore when extracting the person being asked about. */
const STOP_WORDS = new Set([
  'find', 'locate', 'highlight', 'show', 'me', 'where', 'is', 'are', 'was', 'in', 'on', 'the', 'a', 'an', 'of', 'to',
  'who', 'reports', 'report', 'reporting', 'manager', 'managers', 'boss', 'and', 'staff', 'employee', 'employees',
  'person', 'people', 'my', 'their', 'for', 'under', 'works', 'work', 'about', 'tell', 'can', 'you', 'please',
]);

/** Lower-cased alphanumeric words of a name, stripping punctuation like "Dr.". */
function nameWords(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Best-effort person match. Prefers a whole-name hit, then matches on individual
 * name words (exact or prefix) so partials and honorifics work — e.g. "Dr.",
 * "Henry", "Jones" or "Hen" all resolve to "Dr. Henry Jones". Command words are
 * ignored. May return several people; callers disambiguate.
 */
function matchStaff(query: string, staff: Staff[]): Staff[] {
  const q = query.toLowerCase();
  // 1) Whole-name containment wins (most specific).
  const full = staff.filter((s) => s.name && q.includes(s.name.toLowerCase()));
  if (full.length) {
    const longest = Math.max(...full.map((s) => s.name.length));
    return full.filter((s) => s.name.length === longest);
  }
  // 2) Score each person by how many query tokens match a name word (exact or
  //    prefix), ignoring command/question words. The best-scoring people win, so
  //    "Henry Jones" beats "Henry Smith", while "when did Sarah join" still
  //    resolves to Sarah without the question words interfering.
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  if (!tokens.length) return [];
  const scored = staff
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

function matchDepartment(query: string, departments: Department[]): Department | undefined {
  const q = query.toLowerCase();
  return (
    departments.find((d) => d.name && q.includes(d.name.toLowerCase())) ??
    departments.find((d) => {
      const key = firstName(d.name).toLowerCase();
      return key.length > 2 && new RegExp(`\\b${key}\\b`, 'i').test(q);
    })
  );
}

const focusAction = (s: Staff): AiAction => ({
  kind: 'focus-organogram',
  label: `Show ${firstName(s.name)} in the Organogram`,
  icon: 'pi pi-sitemap',
  staffId: s.id,
});

function ambiguous(matches: Staff[], ctx: AiDataContext): AiResult {
  return {
    intent: 'find-employee',
    context: { ambiguous: matches.map((s) => ({ name: s.name, department: ctx.deptName(s.deptId) })) },
    answer:
      `I found ${matches.length} people matching that name: ` +
      matches.map((s) => `${s.name} (${ctx.deptName(s.deptId)})`).join(', ') +
      '. Which one did you mean?',
    actions: matches.slice(0, 5).map(focusAction),
    tone: 'normal',
  };
}

function noPerson(intent: AiResult['intent']): AiResult {
  return {
    intent,
    context: {},
    answer: "I couldn't find anyone by that name in the records you can access. Try their full name.",
    actions: [{ kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' }],
    tone: 'empty',
  };
}

// ---- tools ------------------------------------------------------------------

function getReportingHierarchy(person: Staff, ctx: AiDataContext): AiResult {
  const reports = ctx.staff.filter((s) => s.managerId === person.id);
  const context = {
    manager: person.name,
    title: person.title ?? null,
    department: ctx.deptName(person.deptId),
    directReports: reports.map((r) => ({ name: r.name, title: r.title ?? null })),
  };
  const actions: AiAction[] = [focusAction(person), { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' }];
  if (!reports.length) {
    return {
      intent: 'reporting-hierarchy',
      context,
      answer: `${person.name}${person.title ? ` (${person.title})` : ''} has no direct reports on record.`,
      actions,
      tone: 'empty',
    };
  }
  const names = reports.map((r) => `${r.name}${r.title ? ` — ${r.title}` : ''}`);
  return {
    intent: 'reporting-hierarchy',
    context,
    answer:
      `${plural(reports.length, 'person', 'people')} report directly to ${person.name} in ${ctx.deptName(person.deptId)}:\n` +
      names.map((n) => `• ${n}`).join('\n'),
    actions,
    tone: 'normal',
  };
}

function getManagerOf(person: Staff, ctx: AiDataContext): AiResult {
  const manager = person.managerId != null ? ctx.staff.find((s) => s.id === person.managerId) : undefined;
  const context = { employee: person.name, manager: manager?.name ?? null };
  if (!manager) {
    return {
      intent: 'manager-of',
      context,
      answer: `${person.name} has no manager assigned — they may sit at the top of their reporting line.`,
      actions: [focusAction(person)],
      tone: 'empty',
    };
  }
  return {
    intent: 'manager-of',
    context,
    answer: `${person.name} reports to ${manager.name}${manager.title ? `, ${manager.title}` : ''}.`,
    actions: [focusAction(manager), focusAction(person)],
    tone: 'normal',
  };
}

function getContact(person: Staff, ctx: AiDataContext): AiResult {
  const lines: string[] = [];
  if (person.email) lines.push(`Email: ${person.email}`);
  if (person.cellNumber) lines.push(`Mobile: ${person.cellNumber}`);
  if (person.landline) lines.push(`Landline: ${person.landline}`);
  const context = {
    name: person.name,
    email: person.email ?? null,
    mobile: person.cellNumber ?? null,
    landline: person.landline ?? null,
    department: ctx.deptName(person.deptId),
  };
  const actions: AiAction[] = [focusAction(person), { kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' }];
  if (!lines.length) {
    return { intent: 'contact-info', context, answer: `No contact details are on record for ${person.name}.`, actions, tone: 'empty' };
  }
  return {
    intent: 'contact-info',
    context,
    answer: `You can reach ${person.name}${person.title ? ` (${person.title})` : ''}:\n` + lines.map((l) => `• ${l}`).join('\n'),
    actions,
    tone: 'normal',
  };
}

function getPersonPosition(person: Staff, ctx: AiDataContext): AiResult {
  const dept = ctx.deptName(person.deptId);
  const company = ctx.companyName(person.companyId);
  const context = { name: person.name, title: person.title ?? null, department: dept, company };
  const answer = person.title
    ? `${person.name}'s position is ${person.title} — ${dept}, ${company}.`
    : `${person.name} has no job title on record (${dept}, ${company}).`;
  return { intent: 'person-attribute', context, answer, actions: [focusAction(person)], tone: person.title ? 'normal' : 'empty' };
}

function getPersonDepartment(person: Staff, ctx: AiDataContext): AiResult {
  const dept = ctx.deptName(person.deptId);
  const company = ctx.companyName(person.companyId);
  return {
    intent: 'person-attribute',
    context: { name: person.name, department: dept, company },
    answer: `${person.name} works in ${dept}, ${company}.`,
    actions: [focusAction(person)],
    tone: 'normal',
  };
}

function getRecentJoinees(ctx: AiDataContext, days: number, label: string): AiResult {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const recent = ctx.staff
    .filter((s) => s.dateJoined && !Number.isNaN(Date.parse(s.dateJoined)) && new Date(s.dateJoined) >= cutoff)
    .sort((a, b) => Date.parse(b.dateJoined!) - Date.parse(a.dateJoined!));
  const context = { window: label, count: recent.length, joiners: recent.map((s) => ({ name: s.name, department: ctx.deptName(s.deptId), joined: s.dateJoined })) };
  if (!recent.length) {
    return { intent: 'recent-hires', context, answer: `No one joined ${label} on record.`, actions: [{ kind: 'navigate', label: 'Open Staff', icon: 'pi pi-users', route: '/staff' }], tone: 'empty' };
  }
  return {
    intent: 'recent-hires',
    context,
    answer:
      `${plural(recent.length, 'person', 'people')} joined ${label}:\n` +
      recent.slice(0, 12).map((s) => `• ${s.name} — ${ctx.deptName(s.deptId)} (${s.dateJoined})`).join('\n'),
    actions: [{ kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' }],
    tone: 'normal',
  };
}

/** Full joining roster (everyone with a recorded start date), most recent first. */
function getJoinRoster(ctx: AiDataContext): AiResult {
  const dated = ctx.staff
    .filter((s) => s.dateJoined && !Number.isNaN(Date.parse(s.dateJoined)))
    .sort((a, b) => Date.parse(b.dateJoined!) - Date.parse(a.dateJoined!));
  const undated = ctx.staff.length - dated.length;
  const context = {
    count: dated.length,
    joiners: dated.map((s) => ({ name: s.name, department: ctx.deptName(s.deptId), joined: s.dateJoined })),
    withoutDate: undated,
  };
  if (!dated.length) {
    return {
      intent: 'join-roster',
      context,
      answer: 'None of the staff records include a joining date yet.',
      actions: [{ kind: 'navigate', label: 'Open Staff', icon: 'pi pi-users', route: '/staff' }],
      tone: 'empty',
    };
  }
  const lines = dated.slice(0, 20).map((s) => `• ${s.name} — ${ctx.deptName(s.deptId)} · joined ${s.dateJoined}`);
  const more = dated.length > 20 ? `\n…and ${dated.length - 20} more.` : '';
  const note = undated ? `\n(${plural(undated, 'record')} ${undated === 1 ? 'has' : 'have'} no joining date on file.)` : '';
  return {
    intent: 'join-roster',
    context,
    answer: `Here's who joined and when — most recent first:\n${lines.join('\n')}${more}${note}`,
    actions: [{ kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' }],
    tone: 'normal',
  };
}

/** When a single person is named: "When did Sarah join?" */
function getJoinDateOf(person: Staff, ctx: AiDataContext): AiResult {
  const context = { name: person.name, joined: person.dateJoined ?? null };
  if (!person.dateJoined) {
    return {
      intent: 'join-roster',
      context,
      answer: `${person.name}'s joining date isn't recorded in OMS.`,
      actions: [focusAction(person)],
      tone: 'empty',
    };
  }
  return {
    intent: 'join-roster',
    context,
    answer: `${person.name}${person.title ? ` (${person.title})` : ''} joined on ${person.dateJoined}.`,
    actions: [focusAction(person)],
    tone: 'normal',
  };
}

function getDepartmentStats(ctx: AiDataContext): AiResult {
  const counts = ctx.departments
    .map((d) => ({ name: d.name, count: ctx.staff.filter((s) => s.deptId === d.id).length }))
    .sort((a, b) => b.count - a.count);
  const context = { departments: counts, largest: counts[0] ?? null };
  if (!counts.length) {
    return { intent: 'department-stats', context, answer: 'There are no departments on record yet.', actions: [{ kind: 'navigate', label: 'Open Departments', icon: 'pi pi-briefcase', route: '/departments' }], tone: 'empty' };
  }
  const top = counts[0];
  return {
    intent: 'department-stats',
    context,
    answer:
      `${top.name} is the largest department with ${plural(top.count, 'employee')}.\n` +
      counts.slice(0, 6).map((d) => `• ${d.name}: ${plural(d.count, 'employee')}`).join('\n'),
    actions: [{ kind: 'navigate', label: 'Open Departments', icon: 'pi pi-briefcase', route: '/departments' }],
    tone: 'normal',
  };
}

function getDepartmentHead(dept: Department, ctx: AiDataContext): AiResult {
  const head = dept.headStaffId != null ? ctx.staff.find((s) => s.id === dept.headStaffId) : undefined;
  const context = { department: dept.name, head: head?.name ?? null };
  if (!head) {
    return { intent: 'department-head', context, answer: `${dept.name} has no department head assigned.`, actions: [{ kind: 'navigate', label: 'Open Departments', icon: 'pi pi-briefcase', route: '/departments' }], tone: 'empty' };
  }
  return {
    intent: 'department-head',
    context,
    answer: `${dept.name} is headed by ${head.name}${head.title ? `, ${head.title}` : ''}.`,
    actions: [focusAction(head)],
    tone: 'normal',
  };
}

function getPositionsByTitle(query: string, ctx: AiDataContext): AiResult {
  // Extract the role phrase after common verbs, else use the whole query.
  const m = query.match(/(?:all|show|list|find)\s+(?:the\s+)?([a-z0-9 ]+?)(?:\s+(?:staff|employees|people|positions|roles))?$/i);
  const term = (m?.[1] ?? query).trim().toLowerCase();
  const people = ctx.staff.filter((s) => (s.title ?? '').toLowerCase().includes(term));
  const openPositions = ctx.positions.filter((p) => (p.title ?? '').toLowerCase().includes(term));
  const context = { query: term, people: people.map((s) => ({ name: s.name, title: s.title, department: ctx.deptName(s.deptId) })), positionCount: openPositions.length };
  if (!people.length && !openPositions.length) {
    return { intent: 'positions-by-title', context, answer: `No staff or positions matching "${titleCase(term)}" were found.`, actions: [{ kind: 'navigate', label: 'Open Positions', icon: 'pi pi-id-card', route: '/positions' }], tone: 'empty' };
  }
  const lines = people.slice(0, 12).map((s) => `• ${s.name} — ${s.title} (${ctx.deptName(s.deptId)})`);
  return {
    intent: 'positions-by-title',
    context,
    answer:
      `${plural(people.length, 'person', 'people')} match "${titleCase(term)}"` +
      (people.length ? `:\n${lines.join('\n')}` : '.'),
    actions: [{ kind: 'navigate', label: 'Open Staff', icon: 'pi pi-users', route: '/staff' }],
    tone: people.length ? 'normal' : 'empty',
  };
}

function getVacancies(query: string, ctx: AiDataContext): AiResult {
  const open = ctx.positions.filter((p) => p.isVacant && p.status !== 'CLOSED');
  const byDept = new Map<string, number>();
  for (const p of open) byDept.set(ctx.deptName(p.deptId), (byDept.get(ctx.deptName(p.deptId)) ?? 0) + 1);
  const context = { openVacancies: open.length, byDepartment: [...byDept].map(([d, n]) => ({ department: d, count: n })) };
  const note = /this\s+week|closing|deadline/i.test(query)
    ? '\n(Closing dates aren’t tracked in OMS, so I can’t filter by “this week”.)'
    : '';
  if (!open.length) {
    return { intent: 'vacancies', context, answer: 'There are no open vacancies right now — every position is filled.', actions: [{ kind: 'navigate', label: 'Open Vacancies', icon: 'pi pi-inbox', route: '/vacancies' }], tone: 'empty' };
  }
  return {
    intent: 'vacancies',
    context,
    answer:
      `There ${open.length === 1 ? 'is' : 'are'} ${plural(open.length, 'open vacancy', 'open vacancies')}:\n` +
      [...byDept].map(([d, n]) => `• ${d}: ${n}`).join('\n') +
      note,
    actions: [{ kind: 'navigate', label: 'Open Vacancies', icon: 'pi pi-inbox', route: '/vacancies' }],
    tone: 'normal',
  };
}

function findEmployee(person: Staff, ctx: AiDataContext): AiResult {
  // Build the reporting chain upward (reuses the same rule the Organogram uses).
  const byId = new Map(ctx.staff.map((s) => [s.id, s] as const));
  const chain: string[] = [];
  let cur: Staff | undefined = person;
  const guard = new Set<number>();
  while (cur && !guard.has(cur.id)) {
    chain.unshift(cur.name);
    guard.add(cur.id);
    cur = cur.managerId != null ? byId.get(cur.managerId) : undefined;
  }
  const reports = ctx.staff.filter((s) => s.managerId === person.id);
  const context = {
    name: person.name,
    title: person.title ?? null,
    department: ctx.deptName(person.deptId),
    company: ctx.companyName(person.companyId),
    reportingChain: chain,
    directReports: reports.length,
  };
  return {
    intent: 'find-employee',
    context,
    answer:
      `${person.name}${person.title ? ` — ${person.title}` : ''} · ${ctx.deptName(person.deptId)}, ${ctx.companyName(person.companyId)}.\n` +
      `Reporting line: ${chain.join(' → ')}.` +
      (reports.length ? ` Manages ${plural(reports.length, 'person', 'people')}.` : '') +
      `\nOpening the Organogram and highlighting their reporting chain…`,
    actions: [focusAction(person), { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' }],
    tone: 'normal',
  };
}

function generateInsights(ctx: AiDataContext): AiResult {
  const active = ctx.staff.filter(isActive).length;
  const deptCounts = ctx.departments.map((d) => ({ name: d.name, count: ctx.staff.filter((s) => s.deptId === d.id).length })).sort((a, b) => b.count - a.count);
  const openVac = ctx.positions.filter((p) => p.isVacant && p.status !== 'CLOSED').length;
  const noHead = ctx.departments.filter((d) => d.headStaffId == null);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 1);
  const joinedThisMonth = ctx.staff.filter((s) => s.dateJoined && new Date(s.dateJoined) >= cutoff).length;

  const bullets: string[] = [];
  if (deptCounts[0]?.count) bullets.push(`${deptCounts[0].name} is the largest department (${plural(deptCounts[0].count, 'employee')}).`);
  bullets.push(`${plural(active, 'active employee')} across ${plural(ctx.departments.length, 'department')}.`);
  if (openVac) bullets.push(`${plural(openVac, 'open vacancy', 'open vacancies')} awaiting a hire.`);
  if (noHead.length) bullets.push(`${plural(noHead.length, 'department')} without a head: ${noHead.slice(0, 4).map((d) => d.name).join(', ')}.`);
  if (joinedThisMonth) bullets.push(`${plural(joinedThisMonth, 'person', 'people')} joined in the last month.`);

  return {
    intent: 'insights',
    context: { active, departments: deptCounts, openVacancies: openVac, departmentsWithoutHead: noHead.map((d) => d.name), joinedLastMonth: joinedThisMonth },
    answer: `Here’s a snapshot of your organisation:\n${bullets.map((b) => `• ${b}`).join('\n')}`,
    actions: [{ kind: 'navigate', label: 'Open Dashboard', icon: 'pi pi-th-large', route: '/dashboard' }],
    tone: 'normal',
  };
}

function helpResult(): AiResult {
  return {
    intent: 'help',
    context: {},
    answer:
      'I can answer questions about your organisation using live OMS data. Try:\n' +
      '• Who reports to <name>?\n• Which department has the most employees?\n' +
      '• Show open vacancies\n• Who joined this month?\n• Find <name> in the Organogram\n• Summarise today’s activity',
    actions: [],
    tone: 'normal',
  };
}

// ---- entry point ------------------------------------------------------------

/**
 * Interprets a natural-language question synchronously against loaded data.
 * `activity-summary` is handled by the service (it needs an async audit read).
 */
export function interpret(rawQuery: string, ctx: AiDataContext): AiResult {
  const query = rawQuery.trim();
  if (!query) return helpResult();

  if (RESTRICTED.test(query)) {
    return {
      intent: 'denied',
      context: { reason: 'restricted-field' },
      answer: "You don't have permission to access salary or compensation information, and OMS doesn't store it.",
      actions: [],
      tone: 'denied',
    };
  }

  const q = query.toLowerCase();

  // Reporting hierarchy / direct reports
  if (/\breport(s|ing)?\b|\bdirect reports?\b|\bteam of\b|\bwho works (for|under)\b/.test(q) && !/report\s+(a|an|the)?\s*(bug|issue)/.test(q)) {
    const people = matchStaff(query, ctx.staff);
    if (!people.length) return noPerson('reporting-hierarchy');
    if (people.length > 1) return ambiguous(people, ctx);
    return getReportingHierarchy(people[0], ctx);
  }

  // Manager of / who manages
  if (/\bmanager of\b|\bwho manages\b|\bwho.s the manager\b|\bboss of\b|\bwho does .* report to\b/.test(q)) {
    const dept = matchDepartment(query, ctx.departments);
    const people = matchStaff(query, ctx.staff);
    if (people.length === 1) return getManagerOf(people[0], ctx);
    if (dept) return getDepartmentHead(dept, ctx);
    if (people.length > 1) return ambiguous(people, ctx);
    return noPerson('manager-of');
  }

  // Contact details for a person ("how can I contact Marcus")
  if (/\bcontact\b|\be-?mail\b|\bphone\b|\bnumber\b|\breach\b|\bcall\b|\bmobile\b|\blandline\b|\bextension\b|\bget in touch\b/.test(q)) {
    const people = matchStaff(query, ctx.staff);
    if (people.length === 1) return getContact(people[0], ctx);
    if (people.length > 1) return ambiguous(people, ctx);
    return noPerson('contact-info');
  }

  // A person's position / title / role ("what is the position of Marcus")
  if (/\bposition\b|\btitle\b|\brole\b|\bdesignation\b|\bjob\b|\bwhat does .* do\b/.test(q)) {
    const people = matchStaff(query, ctx.staff);
    if (people.length === 1) return getPersonPosition(people[0], ctx);
    if (people.length > 1) return ambiguous(people, ctx);
    // No named person — fall through (may be a "show all managers" style query).
  }

  // Which department a specific person is in ("what department is Marcus in")
  if (/\b(which|what)\s+(department|team)\b|\bdepartment (is|does)\b|\bwhat team\b/.test(q)) {
    const people = matchStaff(query, ctx.staff);
    if (people.length === 1) return getPersonDepartment(people[0], ctx);
    if (people.length > 1) return ambiguous(people, ctx);
    // fall through to department-head / stats
  }

  // Department head / who heads X
  if (/\bwho (heads|leads|runs)\b|\bhead of\b|\bdepartment head\b/.test(q)) {
    const dept = matchDepartment(query, ctx.departments);
    if (dept) return getDepartmentHead(dept, ctx);
    return { intent: 'department-head', context: {}, answer: 'Which department did you mean? For example: “Who heads Finance?”', actions: [{ kind: 'navigate', label: 'Open Departments', icon: 'pi pi-briefcase', route: '/departments' }], tone: 'empty' };
  }

  // Department stats / headcount
  if (/\bmost employees\b|\blargest department\b|\bheadcount\b|\bdepartment (stats|size|breakdown)\b|\bbiggest (team|department)\b/.test(q)) {
    return getDepartmentStats(ctx);
  }

  // Joining information
  if (/\bjoin(ed|ing|ers?)?\b|\brecent (hires?|staff|joiners?)\b|\bnew (hires?|joiners?|staff|employees?)\b|\bstart(ed|ing)? date\b/.test(q)) {
    // "When did <name> join?" — answer for the specific person.
    const named = matchStaff(query, ctx.staff);
    if (named.length === 1 && /\bwhen\b|\bjoin(ed|ing)?\s+date\b|\bdate\b/.test(q)) return getJoinDateOf(named[0], ctx);

    // Time-bounded phrasing → recent-hires window.
    if (/this week|last 7|past week/.test(q)) return getRecentJoinees(ctx, 7, 'in the last 7 days');
    if (/this month|last 30|past month|recent|new hire|new joiner|newly|lately/.test(q)) return getRecentJoinees(ctx, 31, 'in the last month');

    // Open-ended "who joined when / joining dates" → the full roster.
    return getJoinRoster(ctx);
  }

  // Vacancies
  if (/\bvacanc|\bopen (position|role|vacanc)|\bopenings?\b|\bhiring\b/.test(q)) {
    return getVacancies(query, ctx);
  }

  // Positions by title
  if (/\b(senior|junior|lead|manager|managers|analyst|analysts|engineer|engineers|director|directors|officer|officers|executive|executives)\b/.test(q) && /\b(show|list|all|find|who)\b/.test(q)) {
    return getPositionsByTitle(query, ctx);
  }

  // Insights / overview
  if (/\binsight|\boverview\b|\bsummar(y|ise|ize) (the )?(org|organi|company|workforce)|\bhow are we doing\b|\bhealth\b/.test(q)) {
    return generateInsights(ctx);
  }

  // Find / highlight / locate a person
  if (/\bfind\b|\bhighlight\b|\blocate\b|\bwhere is\b|\bshow me\b/.test(q)) {
    const people = matchStaff(query, ctx.staff);
    if (people.length === 1) return findEmployee(people[0], ctx);
    if (people.length > 1) return ambiguous(people, ctx);
    // Not a person — maybe a department.
    const dept = matchDepartment(query, ctx.departments);
    if (dept) return getDepartmentHead(dept, ctx);
    return noPerson('find-employee');
  }

  // Bare-name fallback: if the whole query is essentially a known person, locate them.
  const nameOnly = matchStaff(query, ctx.staff);
  if (nameOnly.length === 1 && query.split(/\s+/).length <= 4) return findEmployee(nameOnly[0], ctx);
  if (nameOnly.length > 1 && query.split(/\s+/).length <= 4) return ambiguous(nameOnly, ctx);

  if (/\bhelp\b|\bwhat can you\b|\bhow do you\b/.test(q)) return helpResult();

  return {
    intent: 'unknown',
    context: { query },
    answer:
      "I couldn't map that to OMS data. I can help with reporting lines, department headcount, vacancies, recent joiners, finding people in the Organogram, and activity summaries. Ask “help” to see examples.",
    actions: [],
    tone: 'empty',
  };
}
