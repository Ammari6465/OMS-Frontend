import { describe, it, expect } from 'vitest';

import { AiDataContext, interpret } from './intent-engine';
import { Company, Department, Position, Staff } from '../../core/models/organization.model';
import { EmploymentType, EntityStatus } from '../../core/models/enums';

// ---- fixtures ----
const staff: Staff[] = [
  { id: 1, companyId: 10, name: 'John Smith', title: 'IT Director', deptId: 100, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff,
  { id: 2, companyId: 10, name: 'Sarah Khan', title: 'Engineer', deptId: 100, managerId: 1, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1, dateJoined: new Date().toISOString().slice(0, 10) } as Staff,
  { id: 3, companyId: 10, name: 'Ahmed Patel', title: 'Engineer', deptId: 100, managerId: 1, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff,
  { id: 4, companyId: 10, name: 'Mary Lee', title: 'Accountant', deptId: 200, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff,
];
const departments: Department[] = [
  { id: 100, companyId: 10, name: 'IT', headStaffId: 1, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Department,
  { id: 200, companyId: 10, name: 'Finance', status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Department,
];
const positions: Position[] = [
  { id: 1, companyId: 10, title: 'Senior Engineer', deptId: 100, isVacant: true, status: 'OPEN', isDeleted: false, version: 1 } as Position,
  { id: 2, companyId: 10, title: 'Analyst', deptId: 200, isVacant: false, status: 'FILLED', isDeleted: false, version: 1 } as Position,
];
const companies: Company[] = [{ id: 10, name: 'Sunrich Global', status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Company];

const ctx: AiDataContext = {
  staff,
  departments,
  positions,
  companies,
  currentStaffId: 2,
  canViewActivity: true,
  deptName: (id) => departments.find((d) => d.id === id)?.name ?? '—',
  companyName: (id) => companies.find((c) => c.id === id)?.name ?? '—',
};

describe('Ask OMS intent engine', () => {
  it('answers reporting hierarchy and offers an organogram focus action', () => {
    const r = interpret('Who reports to John?', ctx);
    expect(r.intent).toBe('reporting-hierarchy');
    expect(r.answer).toContain('Sarah Khan');
    expect(r.answer).toContain('Ahmed Patel');
    expect(r.actions.some((a) => a.kind === 'focus-organogram' && a.staffId === 1)).toBe(true);
    // Minimal context only — the manager and their direct reports, nothing else.
    expect((r.context as any).manager).toBe('John Smith');
    expect((r.context as any).directReports).toHaveLength(2);
  });

  it('identifies the largest department', () => {
    const r = interpret('Which department has the most employees?', ctx);
    expect(r.intent).toBe('department-stats');
    expect(r.answer).toContain('IT is the largest department');
  });

  it('lists open vacancies only', () => {
    const r = interpret('Show open vacancies', ctx);
    expect(r.intent).toBe('vacancies');
    expect((r.context as any).openVacancies).toBe(1);
    expect(r.answer).toContain('IT');
  });

  it('finds recent joiners this month', () => {
    const r = interpret('Who joined this month?', ctx);
    expect(r.intent).toBe('recent-hires');
    expect(r.answer).toContain('Sarah Khan');
  });

  it('lists the full joining roster for open-ended "who joined when"', () => {
    const r = interpret('Can you tell me who joined when', ctx);
    expect(r.intent).toBe('join-roster');
    expect(r.answer).toContain('Sarah Khan');
    expect(r.answer.toLowerCase()).toContain('joined');
    // Records without a join date are acknowledged, not silently dropped.
    expect(r.answer.toLowerCase()).toContain('no joining date');
  });

  it('answers a joining date for a specific person', () => {
    const r = interpret('When did Sarah join?', ctx);
    expect(r.intent).toBe('join-roster');
    expect(r.answer).toContain('Sarah Khan');
    expect(r.answer.toLowerCase()).toContain('joined on');
  });

  it('still honours time-bounded joiner queries', () => {
    const r = interpret('Who joined this month?', ctx);
    expect(r.intent).toBe('recent-hires');
    expect(r.answer).toContain('Sarah Khan');
  });

  it('reports the department head', () => {
    const r = interpret('Who heads IT?', ctx);
    expect(r.intent).toBe('department-head');
    expect(r.answer).toContain('John Smith');
  });

  it('finds a person and highlights their reporting chain', () => {
    const r = interpret('Find Sarah', ctx);
    expect(r.intent).toBe('find-employee');
    expect(r.answer).toContain('John Smith → Sarah Khan');
    expect(r.actions.some((a) => a.kind === 'focus-organogram' && a.staffId === 2)).toBe(true);
  });

  it('returns contact details for a person', () => {
    const withContact = { ...ctx, staff: staff.map((s) => (s.id === 1 ? ({ ...s, email: 'john@acme.com', cellNumber: '+1 555 0100' } as Staff) : s)) };
    const r = interpret('How can I contact John Smith?', withContact);
    expect(r.intent).toBe('contact-info');
    expect(r.answer).toContain('john@acme.com');
    expect(r.answer).toContain('+1 555 0100');
  });

  it('answers a person\'s position and department', () => {
    const pos = interpret('What is the position of John?', ctx);
    expect(pos.intent).toBe('person-attribute');
    expect(pos.answer).toContain('IT Director');

    const dept = interpret('What department is Sarah in?', ctx);
    expect(dept.intent).toBe('person-attribute');
    expect(dept.answer).toContain('IT');
  });

  it('finds a person by honorific or partial name', () => {
    const withDoctor = { ...ctx, staff: [...staff, { id: 9, companyId: 10, name: 'Dr. Henry Jones', title: 'Lead Architect', deptId: 100, managerId: 1, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff] };
    for (const q of ['Find Dr.', 'Find Henry', 'Locate Jones', 'Find Hen']) {
      const r = interpret(q, withDoctor);
      expect(r.intent, `query "${q}"`).toBe('find-employee');
      expect(r.answer, `query "${q}"`).toContain('Dr. Henry Jones');
    }
  });

  it('refuses restricted salary questions without leaking data', () => {
    const r = interpret("What is John's salary?", ctx);
    expect(r.intent).toBe('denied');
    expect(r.tone).toBe('denied');
    expect(r.answer.toLowerCase()).toContain('permission');
  });

  it('disambiguates when a first name matches multiple people', () => {
    const two = { ...ctx, staff: [...staff, { id: 5, companyId: 10, name: 'John Baker', deptId: 200, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff] };
    const r = interpret('Find John', two);
    expect(r.answer.toLowerCase()).toContain('which one');
    expect(r.actions.length).toBeGreaterThan(1);
  });
});
