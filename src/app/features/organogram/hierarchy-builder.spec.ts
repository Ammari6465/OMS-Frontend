import { describe, expect, it } from 'vitest';
import { buildHierarchy, matchesNode } from './hierarchy-builder';
import { OrganogramNode } from './organogram.models';
const node = (id: number, parentId: number | null, name = `Node ${id}`): OrganogramNode => ({
  id,
  parentId,
  companyId: 1,
  departmentId: 10,
  employeeCode: `EMP-${id}`,
  name,
  title: 'Engineer',
  version: 1,
  vacant: false,
  staffId: id,
});
describe('organogram hierarchy builder', () => {
  it('precomputes direct total ancestor and descendant data once', () => {
    const index = buildHierarchy([node(1, null), node(2, 1), node(3, 2), node(4, 1)], [1]);
    expect(index.roots.map((x) => x.data.id)).toEqual([1]);
    expect(index.byId.get(1)?.directReports).toBe(2);
    expect(index.byId.get(1)?.totalReports).toBe(3);
    expect(index.ancestors.get(3)).toEqual([1, 2]);
    expect([...index.descendants.get(1)!]).toEqual([2, 3, 4]);
  });
  it('keeps orphan and cycle-breaker roots renderable', () => {
    const index = buildHierarchy([node(1, 2), node(2, 1), node(3, 99)], [1, 2, 3]);
    expect(index.roots.map((x) => x.data.id).sort()).toEqual([1, 2, 3]);
  });
  it('searches name code title and department', () => {
    const n = node(7, null, 'Priya Silva');
    expect(matchesNode(n, 'EMP-7', 'Technology')).toBe(true);
    expect(matchesNode(n, 'engineer', 'Technology')).toBe(true);
    expect(matchesNode(n, 'technology', 'Technology')).toBe(true);
    expect(matchesNode(n, 'finance', 'Technology')).toBe(false);
  });
  it('handles a generated 1000-node hierarchy in linear form', () => {
    const nodes = Array.from({ length: 1000 }, (_, i) =>
      node(i + 1, i === 0 ? null : Math.floor((i - 1) / 4) + 1),
    );
    const started = performance.now();
    const index = buildHierarchy(nodes, [1]);
    expect(index.byId.size).toBe(1000);
    expect(index.byId.get(1)!.totalReports).toBe(999);
    expect(performance.now() - started).toBeLessThan(150);
  });
});
