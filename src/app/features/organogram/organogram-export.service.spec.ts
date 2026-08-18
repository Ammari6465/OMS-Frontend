import { OrganogramResponse } from './organogram.models';
import { organogramPrintRows, renderOrganogramPrintDocument } from './organogram-export.service';

const data: OrganogramResponse = {
  company: { id: 1, name: 'Sunrich <Global>' },
  view: 'EMPLOYEE',
  nodes: [
    {
      id: 1,
      parentId: null,
      companyId: 1,
      departmentId: 10,
      name: 'Chief & Lead',
      title: 'CEO',
      employeeCode: 'EMP-1',
      version: 1,
      vacant: false,
    },
    {
      id: 2,
      parentId: 1,
      companyId: 1,
      departmentId: 10,
      name: 'Engineer',
      title: 'Developer',
      employeeCode: 'EMP-2',
      version: 1,
      vacant: false,
    },
    {
      id: 3,
      parentId: 999,
      companyId: 1,
      departmentId: 10,
      name: 'Orphan',
      title: null,
      version: 1,
      vacant: false,
    },
  ],
  rootIds: [1],
  orphanIds: [3],
  departments: [{ id: 10, name: 'Engineering', parentId: null, headStaffId: 1 }],
  vacancies: [],
  dataVersion: 7,
  generatedAt: '2026-08-18T08:00:00Z',
  capabilities: { canEditHierarchy: true, canViewContactDetails: true },
  warnings: [{ code: 'ORPHAN', message: 'One employee has a missing manager', nodeIds: [3] }],
};

describe('Organogram export', () => {
  it('builds a stable flattened hierarchy and retains orphans', () => {
    expect(organogramPrintRows(data).map((row) => [row.node.id, row.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 0],
    ]);
  });

  it('renders a standalone branded print document without application overlays', () => {
    const target = document.implementation.createHTMLDocument();
    renderOrganogramPrintDocument(target, data);
    expect(target.title).toBe('Sunrich <Global> - Organogram');
    expect(target.body.textContent).toContain('Chief & Lead');
    expect(target.body.textContent).toContain('Engineer');
    expect(target.body.textContent).toContain('Data-quality notice');
    expect(target.body.textContent).not.toContain('Ask OMS');
    expect(target.body.textContent).not.toContain('Export organogram');
    expect(target.body.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(target.body.innerHTML).toContain('Sunrich &lt;Global&gt;');
  });
});
