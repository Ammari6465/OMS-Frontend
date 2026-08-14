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
  ComparisonBlock,
  DataQualityBlock,
  DataQualityIssue,
  DepartmentBlock,
  EmployeeBlock,
  PositionBlock,
  ReportingChainBlock,
  ReportingChainNode,
} from './ai-models';

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

const RESTRICTED = /\bsalar|\bcompensat|\bremunerat|\bpayroll|\bwage|\bbonus|\bctc\b|\bincome|\bpay[\s-]?(grade|scale|slip|rate|band)/i;
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

export function generateFollowUpSuggestions(
  intent: AiIntentKind,
  context: Partial<AskOmsContext>,
  ctx: AiDataContext,
): AiSuggestion[] {
  const list: AiSuggestion[] = [];

  if (context.staffName) {
    const name = context.staffName;
    const first = firstName(name);
    list.push(
      { label: `Who is ${first}'s manager?`, query: `Who is the manager of ${name}?`, icon: 'pi pi-user' },
      { label: `Who reports to ${first}?`, query: `Who reports to ${name}?`, icon: 'pi pi-sitemap' },
      { label: `Show ${first}'s team`, query: `Show ${name}'s team`, icon: 'pi pi-users' },
      { label: `Show ${first}'s reporting chain`, query: `Show ${name}'s reporting chain`, icon: 'pi pi-arrows-v' },
      { label: `Show ${first}'s department`, query: `Show ${first}'s department`, icon: 'pi pi-building' },
      { label: `Vacancies in ${first}'s department`, query: `Any vacancies in ${first}'s department?`, icon: 'pi pi-inbox' },
    );
  } else if (context.departmentName) {
    const dept = context.departmentName;
    list.push(
      { label: `Employees in ${dept}`, query: `Show employees in ${dept}`, icon: 'pi pi-users' },
      { label: `Who heads ${dept}?`, query: `Who heads ${dept}?`, icon: 'pi pi-user' },
      { label: `Vacancies in ${dept}`, query: `Show vacancies in ${dept}`, icon: 'pi pi-inbox' },
      { label: `Compare ${dept} with Operations`, query: `Compare ${dept} and Operations`, icon: 'pi pi-chart-bar' },
      { label: `${dept} headcount`, query: `How many employees are in ${dept}?`, icon: 'pi pi-hashtag' },
    );
  } else if (intent === 'vacancies') {
    const topDept = ctx.departments[0]?.name ?? 'Operations';
    list.push(
      { label: `Vacancies in ${topDept}`, query: `Vacancies in ${topDept}`, icon: 'pi pi-inbox' },
      { label: 'Department with most vacancies', query: 'Which department has the most vacancies?', icon: 'pi pi-chart-bar' },
      { label: 'Show all open positions', query: 'Show open vacancies', icon: 'pi pi-briefcase' },
    );
  } else if (intent === 'data-quality') {
    list.push(
      { label: 'Staff with no manager', query: 'Which employees have no manager?', icon: 'pi pi-exclamation-circle' },
      { label: 'Departments with no head', query: 'Which departments have no head?', icon: 'pi pi-exclamation-triangle' },
      { label: 'Incomplete employee records', query: 'Show incomplete employee records', icon: 'pi pi-id-card' },
    );
  }

  if (list.length < 3) {
    list.push(
      { label: 'Show open vacancies', query: 'Show open vacancies', icon: 'pi pi-inbox' },
      { label: 'Who joined recently?', query: 'Who joined recently?', icon: 'pi pi-calendar' },
      { label: 'Compare department sizes', query: 'Compare department sizes', icon: 'pi pi-chart-bar' },
    );
  }

  return list.slice(0, 5);
}

// ---- Ambiguity Handler ------------------------------------------------------

function handleAmbiguousStaff(matches: Staff[], ctx: AiDataContext): AiResult {
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
    prompt: `I found ${matches.length} employees matching that query. Which one do you mean?`,
    candidates,
  };

  return {
    intent: 'ambiguity',
    context: { count: matches.length, candidateIds: matches.map((m) => m.id) },
    answer: `I found ${matches.length} employees matching that query. Select an employee to view details or continue asking questions:`,
    blocks: [block],
    actions,
    tone: 'normal',
  };
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

  const q = query.toLowerCase();
  const normalized = q.replace(/[?!.,;:'"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  const isGuide = /\b(guide|how\s+to|how\s+do\s+i|steps\s+to|where\s+to|teach|tutorial|instructions|walkthrough)\b/i.test(normalized);

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

  // 5. Reporting Chain: "Show Sarah's reporting chain", "Who is Sarah's manager's manager?"
  if (/\b(reporting chain|management chain|chain of command|levels below|manager.s manager|boss.s boss)\b/i.test(q)) {
    const people = matchStaffWithContext(query, ctx);
    if (people.length === 1) return getReportingChain(people[0], ctx);
    if (people.length > 1) return handleAmbiguousStaff(people, ctx);
    return noPersonResult('reporting-chain', query);
  }

  // 6. Team Hierarchy: "Show Sarah's team", "How big is Sarah's team?", "Everyone under Sarah"
  if (/\b(whole team|full team|extended team|team size|everyone under|all reports|entire team)\b/i.test(q)) {
    const people = matchStaffWithContext(query, ctx);
    if (people.length === 1) return getTeamHierarchy(people[0], ctx);
    if (people.length > 1) return handleAmbiguousStaff(people, ctx);
    return noPersonResult('team-hierarchy', query);
  }

  // 7. Manager Of / Direct Supervisor:
  if (
    /\b(manager of|who manages|who is (the |her |his |their |this |my )?manager|who.s (the |her |his |their |my )?manager|boss of|who does .* report to|my manager|her manager|his manager|their manager)\b/i.test(
      q,
    )
  ) {
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

    const dept = matchDepartmentWithContext(query, ctx);
    if (dept) return getDepartmentDetail(dept, ctx);

    if (people.length > 1) return handleAmbiguousStaff(people, ctx);
    return noPersonResult('manager-of', query);
  }

  // 8. Direct Reports: "Who reports to Sarah?", "Who reports to her?", "Her direct reports"
  if (
    /\breport(s|ing)?\b|\bdirect reports?\b|\bteam of\b|\bwho works (for|under)\b/.test(q) &&
    !/report\s+(a|an|the)?\s*(bug|issue)/.test(q)
  ) {
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
    if (people.length > 1) return handleAmbiguousStaff(people, ctx);
    return noPersonResult('reporting-hierarchy', query);
  }

  // 9. Contact details: "Contact details for Sarah", "What is her email/phone?"
  if (/\bcontact\b|\be-?mail\b|\bphone\b|\bnumber\b|\breach\b|\bcall\b|\bmobile\b|\blandline\b|\bextension\b/.test(q)) {
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
    if (people.length > 1) return handleAmbiguousStaff(people, ctx);
    return noPersonResult('contact-info', query);
  }

  // 10. Vacancies (General or Scoped): "Any vacancies in her department?", "Vacancies in IT", "Show open vacancies"
  if (/\b(vacanc(y|ies)?|open\s+positions?|jobs?|openings?|hiring)\b/i.test(q)) {
    const dept = matchDepartmentWithContext(query, ctx);
    if (dept) {
      const vacs = ctx.positions.filter((p) => p.deptId === dept.id && p.isVacant && p.status !== 'CLOSED');
      const vacBlocks = vacs.map((v) => buildPositionBlock(v, ctx));
      const answer = vacs.length
        ? `There ${vacs.length === 1 ? 'is' : 'are'} ${plural(vacs.length, 'open vacancy')} in ${dept.name}:\n` +
          vacs.map((v) => `• ${v.title}`).join('\n')
        : `There are currently no open vacancies in ${dept.name}.`;

      return {
        intent: 'vacancies',
        context: { department: dept.name, openCount: vacs.length },
        answer,
        blocks: [buildDepartmentBlock(dept, ctx), ...vacBlocks],
        actions: [{ kind: 'navigate', label: `View ${dept.name} Vacancies`, route: '/vacancies', deptId: dept.id, icon: 'pi pi-inbox' }],
        updatedContext: { departmentId: dept.id, departmentName: dept.name, lastEntityType: 'department', lastIntent: 'vacancies' },
        tone: vacs.length ? 'normal' : 'empty',
      };
    }

    const open = ctx.positions.filter((p) => p.isVacant && p.status !== 'CLOSED');
    const byDept = new Map<string, number>();
    for (const p of open) byDept.set(ctx.deptName(p.deptId), (byDept.get(ctx.deptName(p.deptId)) ?? 0) + 1);

    const vacBlocks = open.slice(0, 6).map((v) => buildPositionBlock(v, ctx));
    const answer = open.length
      ? `There ${open.length === 1 ? 'is' : 'are'} ${plural(open.length, 'open vacancy', 'open vacancies')}:\n` +
        [...byDept].map(([d, n]) => `• ${d}: ${n}`).join('\n')
      : 'There are currently no active open vacancies across the group.';

    return {
      intent: 'vacancies',
      context: { openCount: open.length, byDepartment: [...byDept].map(([d, n]) => ({ department: d, count: n })) },
      answer,
      blocks: vacBlocks,
      actions: [
        { kind: 'navigate', label: 'Open Vacancies', icon: 'pi pi-inbox', route: '/vacancies' },
        { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' },
      ],
      updatedContext: { lastEntityType: 'vacancy', lastIntent: 'vacancies' },
      tone: open.length ? 'normal' : 'empty',
    };
  }

  // 11. Department-Scoped Staff & Managers Queries: "Show employees in Finance", "Managers in IT"
  const deptMatch = matchDepartmentWithContext(query, ctx);
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

  // 12. Company-Scoped Queries: "Show employees in ABC Company", "How many employees does ABC have?"
  const compMatch = matchCompanyWithContext(query, ctx);
  if (compMatch && (/\b(employees|staff|departments|vacancies|positions|largest department)\b/i.test(q) || q.split(/\s+/).length <= 4)) {
    return getCompanyDetail(compMatch, ctx);
  }

  // 13. Department Head: "Who heads IT?", "Who is the head of Finance?"
  if (/\bwho (heads|leads|runs)\b|\bhead of\b|\bdepartment head\b/.test(q)) {
    const dept = matchDepartmentWithContext(query, ctx);
    if (dept) {
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
        updatedContext: { staffId: head.id, staffName: head.name, departmentId: dept.id, departmentName: dept.name, lastEntityType: 'staff', lastIntent: 'department-head' },
        tone: 'normal',
      };
    }
  }

  // 14. Joining & Recent Hires: "Who joined recently?", "When did Sarah join?"
  if (/\bjoin(ed|ing|ers?)?\b|\brecent (hires?|staff|joiners?)\b|\bnew (hires?|joiners?|staff|employees?)\b|\bstart(ed|ing)? date\b/.test(q)) {
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
    return handleAmbiguousStaff(foundPeople, ctx);
  }

  // 16. Organization Stats / Largest Department: "Which department has the most employees?"
  if (/\bmost employees\b|\blargest department\b|\bheadcount\b|\bdepartment (stats|size|breakdown)\b|\bbiggest (team|department)\b/.test(q)) {
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

  // 17. Help Fallback
  if (/\bhelp\b|\bwhat can you\b|\bhow do you\b|\bcommands\b/.test(q)) return helpResult();

  // 18. Unknown Fallback
  return {
    intent: 'unknown',
    context: { query },
    answer:
      `I couldn't map "${query}" to OMS data.\n\n` +
      `Try asking:\n` +
      `• "Find Sarah Perera"\n` +
      `• "Who is her manager?"\n` +
      `• "Show employees in Finance"\n` +
      `• "Compare Finance and Operations"\n` +
      `• "Show open vacancies"\n` +
      `• "Which departments have no head?"\n\n` +
      `Type "help" for more examples.`,
    actions: [
      { kind: 'navigate', label: 'Open Staff directory', icon: 'pi pi-users', route: '/staff' },
      { kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' },
    ],
    tone: 'empty',
  };
}
