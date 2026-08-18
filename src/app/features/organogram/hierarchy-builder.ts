import { HierarchyNode, OrganogramNode } from './organogram.models';

export interface HierarchyIndex {
  roots: HierarchyNode[];
  byId: Map<number, HierarchyNode>;
  ancestors: Map<number, number[]>;
  descendants: Map<number, Set<number>>;
}

/** O(n) precomputation used by rendering, search, focus, counts and cycle-safe editing. */
export function buildHierarchy(
  nodes: readonly OrganogramNode[],
  rootIds: readonly number[],
): HierarchyIndex {
  const byId = new Map<number, HierarchyNode>(
    nodes.map((data) => [data.id, { data, children: [], directReports: 0, totalReports: 0 }]),
  );
  const rootSet = new Set(rootIds);
  const roots: HierarchyNode[] = [];
  for (const node of byId.values()) {
    const parent = node.data.parentId == null ? null : byId.get(node.data.parentId);
    if (parent && !rootSet.has(node.data.id)) parent.children.push(node);
    else roots.push(node);
  }
  const ancestors = new Map<number, number[]>();
  const descendants = new Map<number, Set<number>>();
  const visit = (node: HierarchyNode, path: number[], guard: Set<number>): number => {
    if (guard.has(node.data.id)) return 0;
    const next = new Set(guard).add(node.data.id);
    ancestors.set(node.data.id, [...path]);
    node.children.sort((a, b) => a.data.name.localeCompare(b.data.name));
    node.directReports = node.children.length;
    let total = 0;
    const desc = new Set<number>();
    for (const child of node.children) {
      desc.add(child.data.id);
      total += 1 + visit(child, [...path, node.data.id], next);
      for (const id of descendants.get(child.data.id) ?? []) desc.add(id);
    }
    node.totalReports = total;
    descendants.set(node.data.id, desc);
    return total;
  };
  roots
    .sort((a, b) => a.data.name.localeCompare(b.data.name))
    .forEach((r) => visit(r, [], new Set()));
  for (const node of byId.values()) if (!ancestors.has(node.data.id)) visit(node, [], new Set());
  return { roots, byId, ancestors, descendants };
}

export function matchesNode(node: OrganogramNode, term: string, departmentName: string): boolean {
  const q = term.trim().toLocaleLowerCase();
  if (!q) return false;
  return [node.name, node.employeeCode, node.title, departmentName].some((v) =>
    (v ?? '').toLocaleLowerCase().includes(q),
  );
}
