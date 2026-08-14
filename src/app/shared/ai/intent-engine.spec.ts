import { describe, it, expect } from 'vitest';

import { AiDataContext, cleanTitle, interpret } from './intent-engine';
import { Company, Department, Position, Staff } from '../../core/models/organization.model';
import { EmploymentType, EntityStatus } from '../../core/models/enums';

// ---- fixtures ----
const staff: Staff[] = [
  { id: 1, companyId: 10, name: 'John Smith', employeeCode: 'EMP-001', title: 'IT Director', deptId: 100, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1, email: 'john@acme.com', cellNumber: '0771234567' } as Staff,
  { id: 2, companyId: 10, name: 'Sarah Khan', employeeCode: 'EMP-002', title: 'Senior Engineer', deptId: 100, managerId: 1, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1, dateJoined: new Date().toISOString().slice(0, 10), email: 'sarah@acme.com' } as Staff,
  { id: 3, companyId: 10, name: 'Ahmed Patel', employeeCode: 'EMP-003', title: 'Junior Engineer', deptId: 100, managerId: 2, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff,
  { id: 4, companyId: 10, name: 'Mary Lee', employeeCode: 'EMP-004', title: 'Accountant', deptId: 200, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff,
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

describe('Ask OMS intent engine — Context-Aware Organizational Copilot', () => {
  it('answers reporting hierarchy and establishes conversational context', () => {
    const r = interpret('Who reports to John?', ctx);
    expect(r.intent).toBe('reporting-hierarchy');
    expect(r.answer).toContain('Sarah Khan');
    expect(r.updatedContext?.staffId).toBe(1);
    expect(r.blocks?.some((b) => b.kind === 'employee')).toBe(true);
  });

  it('resolves pronoun follow-ups using session context ("Who is her manager?")', () => {
    const contextWithSarah: AiDataContext = {
      ...ctx,
      currentContext: {
        staffId: 2,
        staffName: 'Sarah Khan',
        departmentId: 100,
        departmentName: 'IT',
        companyId: 10,
        companyName: 'Sunrich Global',
        lastEntityType: 'staff',
      },
    };

    const r = interpret('Who is her manager?', contextWithSarah);
    expect(r.intent).toBe('manager-of');
    expect(r.answer).toContain('John Smith');
  });

  it('resolves direct reports follow-up ("Who reports to her?")', () => {
    const contextWithSarah: AiDataContext = {
      ...ctx,
      currentContext: {
        staffId: 2,
        staffName: 'Sarah Khan',
        departmentId: 100,
        departmentName: 'IT',
        lastEntityType: 'staff',
      },
    };

    const r = interpret('Who reports to her?', contextWithSarah);
    expect(r.intent).toBe('reporting-hierarchy');
    expect(r.answer).toContain('Ahmed Patel');
  });

  it('resolves team hierarchy follow-up ("Show his whole team")', () => {
    const contextWithJohn: AiDataContext = {
      ...ctx,
      currentContext: {
        staffId: 1,
        staffName: 'John Smith',
        departmentId: 100,
        lastEntityType: 'staff',
      },
    };

    const r = interpret('Show his whole team', contextWithJohn);
    expect(r.intent).toBe('team-hierarchy');
    expect(r.answer).toContain('direct report');
  });

  it('resolves reporting chain follow-up ("Show his reporting chain")', () => {
    const contextWithAhmed: AiDataContext = {
      ...ctx,
      currentContext: {
        staffId: 3,
        staffName: 'Ahmed Patel',
        lastEntityType: 'staff',
      },
    };

    const r = interpret('Show his reporting chain', contextWithAhmed);
    expect(r.intent).toBe('reporting-chain');
    expect(r.blocks?.some((b) => b.kind === 'reporting-chain')).toBe(true);
  });

  it('resolves departmental follow-up ("Any vacancies in her department?")', () => {
    const contextWithSarah: AiDataContext = {
      ...ctx,
      currentContext: {
        staffId: 2,
        staffName: 'Sarah Khan',
        departmentId: 100,
        departmentName: 'IT',
        lastEntityType: 'staff',
      },
    };

    const r = interpret('Any vacancies in her department?', contextWithSarah);
    expect(r.intent).toBe('vacancies');
    expect(r.answer).toContain('IT');
    expect(r.answer).toContain('Senior Engineer');
  });

  it('disambiguates when a name query matches multiple people', () => {
    const withTwoJohns = {
      ...ctx,
      staff: [
        ...staff,
        { id: 5, companyId: 10, name: 'John Baker', employeeCode: 'EMP-005', title: 'Finance Executive', deptId: 200, empType: EmploymentType.PERMANENT, status: EntityStatus.ACTIVE, isDeleted: false, version: 1 } as Staff,
      ],
    };
    const r = interpret('Find John', withTwoJohns);
    expect(r.intent).toBe('ambiguity');
    expect(r.blocks?.some((b) => b.kind === 'ambiguity')).toBe(true);
    expect(r.actions.length).toBeGreaterThanOrEqual(2);
  });

  it('compares department headcounts and generates ComparisonBlock', () => {
    const r = interpret('Compare IT and Finance headcount', ctx);
    expect(r.intent).toBe('comparison');
    expect(r.answer).toContain('IT');
    expect(r.answer).toContain('Finance');
    expect(r.blocks?.some((b) => b.kind === 'comparison')).toBe(true);
  });

  it('handles multi-filter queries for department employees and managers', () => {
    const r = interpret('Show employees in IT', ctx);
    expect(r.intent).toBe('department-scoped');
    expect(r.answer).toContain('John Smith');
    expect(r.answer).toContain('Sarah Khan');
  });

  it('searches employees by employee code (EMP-001)', () => {
    const r = interpret('Find EMP-001', ctx);
    expect(r.intent).toBe('find-employee');
    expect(r.answer).toContain('John Smith');
  });

  it('searches employees by email address', () => {
    const r = interpret('Find john@acme.com', ctx);
    expect(r.intent).toBe('find-employee');
    expect(r.answer).toContain('John Smith');
  });

  it('searches employees by phone number', () => {
    const r = interpret('Who has 0771234567?', ctx);
    expect(r.intent).toBe('find-employee');
    expect(r.answer).toContain('John Smith');
  });

  it('answers self queries for logged in user ("Who is my manager?")', () => {
    const r = interpret('Who is my manager?', ctx);
    expect(r.intent).toBe('manager-of');
    expect(r.answer).toContain('John Smith');
  });

  it('audits data quality for staff without manager', () => {
    const r = interpret('Which employees have no manager?', ctx);
    expect(r.intent).toBe('data-quality');
    expect(r.answer).toContain('John Smith');
    expect(r.blocks?.some((b) => b.kind === 'data-quality')).toBe(true);
  });

  it('audits data quality for departments without head', () => {
    const r = interpret('Which departments have no head?', ctx);
    expect(r.intent).toBe('data-quality');
    expect(r.answer).toContain('Finance');
  });

  it('audits data quality for incomplete staff records', () => {
    const r = interpret('Show incomplete employee records', ctx);
    expect(r.intent).toBe('data-quality');
    expect(r.answer.toLowerCase()).toContain('incomplete');
    expect(r.blocks?.some((b) => b.kind === 'data-quality')).toBe(true);
  });

  it('refuses restricted salary questions securely without leaking data', () => {
    const r = interpret("What is John's salary?", ctx);
    expect(r.intent).toBe('denied');
    expect(r.tone).toBe('denied');
  });

  it('provides step-by-step guidance for adding staff', () => {
    const r = interpret('Guide me How to add staff', ctx);
    expect(r.intent).toBe('how-to');
    expect(r.answer).toContain('step-by-step guide to add a new staff');
  });

  it('provides step-by-step guidance for adding company, department, vacancy, changing manager, export', () => {
    expect(interpret('How to add a company?', ctx).answer.toLowerCase()).toContain('company');
    expect(interpret('Guide me how to add a department', ctx).answer.toLowerCase()).toContain('department');
    expect(interpret('How to add vacancy?', ctx).answer.toLowerCase()).toContain('vacancy');
    expect(interpret('How do I change manager?', ctx).answer.toLowerCase()).toContain('organogram');
    expect(interpret('How to export organogram?', ctx).answer.toLowerCase()).toContain('export organogram');
  });

  it('strips honorific titles properly with cleanTitle helper', () => {
    expect(cleanTitle('Dr. Henry Jones')).toBe('Henry Jones');
    expect(cleanTitle('Prof. Albert Einstein')).toBe('Albert Einstein');
    expect(cleanTitle('Mr. John Doe')).toBe('John Doe');
  });
});
