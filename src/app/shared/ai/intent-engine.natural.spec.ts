/**
 * Natural-phrasing coverage for Ask OMS.
 *
 * The point of these cases is that the user should not have to guess the
 * engine's wording: every phrasing below is something a colleague would
 * actually type, and each must reach the same deterministic intent.
 */
import { describe, it, expect } from 'vitest';

import { AiDataContext, interpret } from './intent-engine';
import { AiIntentKind } from './ai-models';
import { Company, Department, Position, Staff } from '../../core/models/organization.model';
import { EmploymentType, EntityStatus } from '../../core/models/enums';

const staff: Staff[] = [
  { id: 1, companyId: 10, name: 'John Smith', employeeCode: 'EMP-001', title: 'IT Director', deptId: 100, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1, email: 'john@acme.com', cellNumber: '0771234567' } as Staff,
  { id: 2, companyId: 10, name: 'Sarah Khan', employeeCode: 'EMP-002', title: 'Operations Manager', deptId: 300, managerId: 1, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1, email: 'sarah@acme.com' } as Staff,
  { id: 3, companyId: 10, name: 'Ahmed Patel', employeeCode: 'EMP-003', title: 'Junior Engineer', deptId: 100, managerId: 2, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff,
  { id: 4, companyId: 10, name: 'Mary Lee', employeeCode: 'EMP-004', title: 'Accountant', deptId: 200, managerId: 1, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff,
];

const departments: Department[] = [
  { id: 100, companyId: 10, name: 'IT', headStaffId: 1, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Department,
  { id: 200, companyId: 10, name: 'Finance', headStaffId: 4, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Department,
  { id: 300, companyId: 10, name: 'Operations', headStaffId: 2, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Department,
];

const positions: Position[] = [
  { id: 1, companyId: 10, title: 'Senior Engineer', deptId: 100, isVacant: true, status: 'OPEN', isDeleted: false, version: 1 } as Position,
  { id: 2, companyId: 10, title: 'Analyst', deptId: 200, isVacant: true, status: 'OPEN', isDeleted: false, version: 1 } as Position,
  { id: 3, companyId: 10, title: 'Coordinator', deptId: 300, isVacant: true, status: 'OPEN', isDeleted: false, version: 1 } as Position,
  { id: 4, companyId: 10, title: 'Retired Role', deptId: 300, isVacant: true, status: 'CLOSED', isDeleted: false, version: 1 } as Position,
  { id: 5, companyId: 10, title: 'Accountant', deptId: 200, isVacant: false, status: 'FILLED', isDeleted: false, version: 1 } as Position,
];

const companies: Company[] = [{ id: 10, name: 'Sunrich Global', status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Company];

const ctx: AiDataContext = {
  staff,
  departments,
  positions,
  companies,
  currentStaffId: 3,
  canViewActivity: true,
  deptName: (id) => departments.find((d) => d.id === id)?.name ?? '—',
  companyName: (id) => companies.find((c) => c.id === id)?.name ?? '—',
};

const withContext = (currentContext: AiDataContext['currentContext']): AiDataContext => ({ ...ctx, currentContext });

/** Asserts every phrasing reaches the same intent. */
function expectIntent(intent: AiIntentKind, phrasings: string[], context = ctx): void {
  for (const phrase of phrasings) {
    expect(interpret(phrase, context).intent, `"${phrase}"`).toBe(intent);
  }
}

describe('Ask OMS — greetings and small talk', () => {
  it('greets instead of attempting a data lookup', () => {
    expectIntent('greeting', ['Hi', 'hello', 'Hey Ask OMS', 'good morning', 'Good Evening', 'hey there']);
  });

  it('answers a greeting with an invitation and starter suggestions', () => {
    const r = interpret('Hi', ctx);
    expect(r.answer).toContain('What would you like to know');
    expect(r.suggestions?.length).toBeGreaterThanOrEqual(3);
    expect(r.tone).toBe('normal');
  });

  it('never sends conversational replies to the AI provider', () => {
    expect(interpret('Hi', ctx).skipRephrase).toBe(true);
    expect(interpret('thanks', ctx).skipRephrase).toBe(true);
  });

  it('acknowledges thanks without a data lookup', () => {
    expectIntent('courtesy', ['thanks', 'thank you', 'thx']);
  });
});

describe('Ask OMS — vacancy phrasings', () => {
  it('maps every natural vacancy phrasing to the vacancy intent', () => {
    expectIntent('vacancies', [
      'vacancy',
      'vacancies',
      'any vacancy',
      'any vacancies',
      'any vacancy?',
      'show vacancy',
      'show vacancies',
      'show open vacancies',
      'open vacancies',
      'do we have vacancies',
      'do we have any vacancies',
      'are there any vacancies',
      'any open positions',
      'open positions',
      'vacant positions',
      'what positions are open',
      'jobs available',
      'any jobs open',
      'Open jobs?',
      'Can you please show me the vacancies?',
      '  Any VACANCIES???  ',
    ]);
  });

  it('counts only open, non-closed positions and groups them by department', () => {
    const r = interpret('Any vacancies?', ctx);
    expect(r.answer).toContain('3 open vacancies');
    expect(r.answer).toContain('3 departments');

    const block = r.blocks?.find((b) => b.kind === 'vacancy-summary');
    expect(block).toBeDefined();
    expect(block).toMatchObject({ totalOpen: 3, departmentCount: 3 });
  });

  it('scopes vacancies to a named department', () => {
    const r = interpret('Any vacancies in Finance?', ctx);
    expect(r.intent).toBe('vacancies');
    expect(r.answer).toContain('Finance');
    expect(r.answer).toContain('1 open vacancy');
  });

  it('reports an empty department without sounding like a failure', () => {
    const noVacancies: AiDataContext = { ...ctx, positions: positions.filter((p) => p.deptId !== 200) };
    const r = interpret('Vacancies in Finance', noVacancies);
    expect(r.answer).toBe('Finance currently has no open vacancies.');
    expect(r.tone).toBe('empty');
  });
});

describe('Ask OMS — department phrasings', () => {
  it('resolves employee-in-department variations', () => {
    expectIntent('department-scoped', [
      'Show employees in Finance',
      'Finance employees',
      'Finance staff',
      'People in Finance',
      "Who's in Finance?",
      'Who works in Finance?',
      'Finance team',
      'Show me Finance people',
      'finance peoples',
    ]);
  });

  it('answers headcount phrasings from the department card', () => {
    for (const q of ['How many people are in Finance?', 'Finance headcount', 'Size of Finance', 'How big is Finance?']) {
      const r = interpret(q, ctx);
      expect(['department-scoped', 'department-stats'], q).toContain(r.intent);
      expect(r.answer, q).toContain('Finance');
    }
  });

  it('resolves department-head phrasings to the head, not the whole department', () => {
    expectIntent('department-head', ['Who manages Finance?', 'Who heads Finance?', 'Finance head', 'Finance manager']);
    expect(interpret('Who heads Finance?', ctx).answer).toContain('Mary Lee');
  });
});

describe('Ask OMS — employee and manager phrasings', () => {
  it('finds an employee by name, code, email and phone', () => {
    expectIntent('find-employee', ['Find Sarah', 'Sarah', 'Find EMP-001', 'Find john@acme.com', 'Who has 0771234567?']);
  });

  it('resolves manager phrasings including bare and possessive forms', () => {
    expectIntent('manager-of', [
      'Sarah manager',
      'Who manages Sarah?',
      "Who is Sarah's boss?",
      'Who does Sarah report to?',
      "Sarah's manager",
      'Who is the manager of Sarah?',
    ]);
    expect(interpret('Sarah manager', ctx).answer).toContain('John Smith');
  });

  it('keeps direct-report questions distinct from manager questions', () => {
    const r = interpret('Who reports to Sarah?', ctx);
    expect(r.intent).toBe('reporting-hierarchy');
    expect(r.answer).toContain('Ahmed Patel');
  });

  it('searches by job title', () => {
    const r = interpret('Operations Manager', ctx);
    expect(r.intent).toBe('positions-by-title');
    expect(r.answer).toContain('Sarah Khan');
  });

  it('recognises natural job-title questions with spelling mistakes', () => {
    const seniorDeveloper = {
      ...staff[2],
      id: 50,
      name: 'Eleanor Vance',
      employeeCode: 'EMP-050',
      title: 'Senior Developer',
    } as Staff;
    const titleContext: AiDataContext = { ...ctx, staff: [...ctx.staff, seniorDeveloper] };

    for (const question of ['Who is a Senir Developer?', 'Who is the Senior Developer?', 'Find senior developer']) {
      const result = interpret(question, titleContext);
      expect(result.intent).toBe('positions-by-title');
      expect(result.answer).toContain('Eleanor Vance');
      expect(result.answer).toContain('Senior Developer');
    }
  });

  it('asks for an identifier when no one is named', () => {
    const r = interpret('Find an employee', ctx);
    expect(r.intent).toBe('find-employee');
    expect(r.answer).toContain('employee code');
    expect(r.tone).toBe('empty');
  });
});

describe('Ask OMS — conversational context', () => {
  it('carries an employee across pronoun follow-ups', () => {
    const found = interpret('Find Sarah Khan', ctx);
    expect(found.updatedContext?.staffId).toBe(2);

    const session = withContext(found.updatedContext);
    expect(interpret('Who is her manager?', session).answer).toContain('John Smith');
    expect(interpret('Who reports to her?', session).answer).toContain('Ahmed Patel');
  });

  it('resolves "her department" through the employee to a vacancy filter', () => {
    const session = withContext({ staffId: 2, staffName: 'Sarah Khan', departmentId: 300, departmentName: 'Operations', lastEntityType: 'staff' });
    const r = interpret('Any vacancies in her department?', session);
    expect(r.intent).toBe('vacancies');
    expect(r.answer).toContain('Operations');
    expect(r.answer).toContain('Coordinator');
  });

  it('offers follow-ups that do not repeat the question just answered', () => {
    const r = interpret('Who is the manager of Sarah Khan?', ctx);
    const labels = (r.suggestions ?? []).map((s) => s.label);
    expect(labels.every((l) => !l.includes("'s manager"))).toBe(true);
  });
});

describe('Ask OMS — recovery and help', () => {
  it('offers a did-you-mean for a near miss instead of a wall of examples', () => {
    const r = interpret('Any vacany', ctx);
    expect(r.intent).toBe('did-you-mean');
    expect(r.answer).toContain('Did you mean');
    expect(r.actions.some((a) => a.kind === 'ask-prompt' && a.prompt === 'Show open vacancies')).toBe(true);
  });

  it('falls back compactly for genuine gibberish', () => {
    const r = interpret('asdfgh', ctx);
    expect(r.intent).toBe('unknown');
    expect(r.answer).toContain("I'm not sure what you mean");
    // The old fallback listed six examples and a "type help" hint.
    expect(r.answer.split('\n').filter(Boolean).length).toBeLessThanOrEqual(3);
    expect(r.actions.length).toBeLessThanOrEqual(2);
  });

  it('shows the grouped capability view only when explicitly asked', () => {
    for (const q of ['help', 'What can you do?', 'what can I ask', 'examples', 'How can you help?']) {
      const r = interpret(q, ctx);
      expect(r.intent, q).toBe('capabilities');
      expect(r.blocks?.some((b) => b.kind === 'capability'), q).toBe(true);
    }
  });

  it('groups capability examples into People / Organisation / Vacancies / Insights', () => {
    const r = interpret('What can you do?', ctx);
    const block = r.blocks?.find((b) => b.kind === 'capability');
    expect(block && block.kind === 'capability' && block.groups.map((g) => g.title)).toEqual([
      'People',
      'Organisation',
      'Vacancies',
      'Insights',
    ]);
  });
});

describe('Ask OMS — personal queries', () => {
  // currentStaffId is Ahmed Patel (3), who reports to Sarah Khan (2) in IT.
  it('answers "my manager", "my department", "my team" and "my reporting chain"', () => {
    expect(interpret('Who is my manager?', ctx).answer).toContain('Sarah Khan');
    expect(interpret('Show my reporting chain', ctx).intent).toBe('reporting-chain');
    expect(interpret('Show my whole team', ctx).intent).toBe('team-hierarchy');
    expect(interpret('Who reports to me?', ctx).intent).toBe('reporting-hierarchy');
  });

  it('does not invent an identity when the account has no linked staff record', () => {
    const anonymous: AiDataContext = { ...ctx, currentStaffId: null };
    const r = interpret('Who is my manager?', anonymous);
    // It must say it could not resolve the person rather than guessing one.
    expect(r.tone).toBe('empty');
    expect(r.answer).toContain("couldn't find an employee");
    expect(staff.every((s) => !r.answer.includes(s.name))).toBe(true);
  });
});

describe('Ask OMS — team depth', () => {
  it('separates direct reports from the extended team', () => {
    const direct = interpret('Who reports to John Smith?', ctx);
    expect(direct.intent).toBe('reporting-hierarchy');
    // John directly manages Sarah and Mary, but not Ahmed.
    expect(direct.answer).toContain('Sarah Khan');
    expect(direct.answer).not.toContain('Ahmed Patel');

    const whole = interpret("Show John Smith's whole team", ctx);
    expect(whole.intent).toBe('team-hierarchy');
    expect(whole.context).toMatchObject({ directReportsCount: 2, extendedTeamCount: 3 });
  });

  it('survives a circular reporting relationship', () => {
    const cyclic: AiDataContext = {
      ...ctx,
      staff: [
        { ...staff[0], managerId: 2 } as Staff,
        { ...staff[1], managerId: 1 } as Staff,
      ],
    };
    const r = interpret("Show John Smith's whole team", cyclic);
    expect(r.intent).toBe('team-hierarchy');
    expect(r.context).toMatchObject({ extendedTeamCount: 1 });
  });

  it('builds a reporting chain from the person up to the root', () => {
    const r = interpret("Show Ahmed's reporting chain", ctx);
    const block = r.blocks?.find((b) => b.kind === 'reporting-chain');
    expect(block && block.kind === 'reporting-chain' && block.nodes.map((n) => n.name)).toEqual([
      'John Smith',
      'Sarah Khan',
      'Ahmed Patel',
    ]);
  });
});

describe('Ask OMS — distinct error states', () => {
  it('reports an unknown employee differently from an unknown question', () => {
    const r = interpret('Who is the manager of Zxqwerty?', ctx);
    expect(r.answer).toContain("couldn't find an employee");
    expect(r.tone).toBe('empty');
  });

  it('reports an unknown department by name instead of answering globally', () => {
    const r = interpret('Any vacancies in Treasury?', ctx);
    expect(r.answer).toContain("couldn't find a department matching \"treasury\"");
    // The global vacancy roll-up must not leak through as a false answer.
    expect(r.blocks?.some((b) => b.kind === 'vacancy-summary')).toBeFalsy();
  });

  it('names the search term when several people match', () => {
    const twoJohns: AiDataContext = {
      ...ctx,
      staff: [...staff, { id: 9, companyId: 10, name: 'John Baker', title: 'Analyst', deptId: 200, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff],
    };
    const r = interpret('Find John', twoJohns);
    expect(r.intent).toBe('ambiguity');
    expect(r.answer).toContain('matching "John"');
    expect(r.answer).toContain('Which one do you mean?');
  });
});

describe('Ask OMS — security is not weakened by looser matching', () => {
  it('still refuses compensation questions in every phrasing', () => {
    expectIntent('denied', [
      'Sarah salary',
      'What does Sarah earn?',
      'Sarah compensation',
      'How much is Sarah paid?',
      "what's the payroll for Finance",
    ]);
  });

  it('restricts data-quality audits to users who may view activity', () => {
    const nonAdmin: AiDataContext = { ...ctx, canViewActivity: false };
    const r = interpret('Which employees have no manager?', nonAdmin);
    expect(r.intent).toBe('denied');
    expect(r.tone).toBe('denied');
  });
});
