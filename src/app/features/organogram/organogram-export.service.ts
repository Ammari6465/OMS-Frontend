import { Injectable } from '@angular/core';
import { OrganogramNode, OrganogramResponse } from './organogram.models';

export interface OrganogramPrintRow {
  node: OrganogramNode;
  depth: number;
}

export function organogramPrintRows(data: OrganogramResponse): OrganogramPrintRow[] {
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const children = new Map<number, OrganogramNode[]>();
  for (const node of data.nodes) {
    if (node.parentId == null || !byId.has(node.parentId)) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.name.localeCompare(b.name));

  const rows: OrganogramPrintRow[] = [];
  const visited = new Set<number>();
  const roots = data.rootIds
    .map((id) => byId.get(id))
    .filter((node): node is OrganogramNode => !!node);
  const append = (start: OrganogramNode, initialDepth: number) => {
    const stack = [{ node: start, depth: initialDepth }];
    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current.node.id)) continue;
      visited.add(current.node.id);
      rows.push(current);
      const reports = children.get(current.node.id) ?? [];
      for (let index = reports.length - 1; index >= 0; index--)
        stack.push({ node: reports[index], depth: current.depth + 1 });
    }
  };
  for (const root of roots) append(root, 0);
  for (const node of [...data.nodes].sort((a, b) => a.name.localeCompare(b.name)))
    if (!visited.has(node.id)) append(node, 0);
  return rows;
}

export function renderOrganogramPrintDocument(target: Document, data: OrganogramResponse): void {
  const departmentNames = new Map(
    data.departments.map((department) => [department.id, department.name]),
  );
  const colours = ['#7c3aed', '#059669', '#2563eb', '#0891b2', '#d97706', '#dc2626', '#4f46e5'];
  const colourByDepartment = new Map(
    data.departments.map((department, index) => [department.id, colours[index % colours.length]]),
  );
  const element = (name: string, className?: string, text?: string) => {
    const value = target.createElement(name);
    if (className) value.className = className;
    if (text != null) value.textContent = text;
    return value;
  };

  const style = element('style');
  style.textContent = `
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #fff; font: 10pt/1.4 Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #ef3340; }
    h1 { margin: 0 0 3px; font-size: 21pt; color: #0f172a; }
    .subtitle { margin: 0; color: #526076; font-size: 10pt; }
    .meta { text-align: right; color: #526076; font-size: 8.5pt; white-space: nowrap; }
    .summary { display: flex; gap: 10px; margin: 12px 0; }
    .summary span { padding: 5px 9px; border-radius: 999px; background: #f1f5f9; color: #334155; font-size: 8.5pt; font-weight: 700; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0 0 12px; padding: 9px 10px; border: 1px solid #dbe2ea; border-radius: 7px; }
    .legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 8pt; }
    .dot { width: 8px; height: 8px; border-radius: 2px; flex: none; }
    .warnings { margin: 0 0 12px; padding: 8px 10px; border-left: 3px solid #d97706; background: #fffbeb; color: #78350f; font-size: 8.5pt; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th { padding: 7px 8px; color: #fff; background: #172033; font-size: 8pt; text-align: left; text-transform: uppercase; letter-spacing: .04em; }
    td { padding: 7px 8px; border-bottom: 1px solid #dbe2ea; vertical-align: top; overflow-wrap: anywhere; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .person { display: flex; gap: 7px; align-items: flex-start; font-weight: 700; }
    .branch { color: #94a3b8; font-family: Consolas, monospace; flex: none; }
    .vacant { color: #b42318; }
    .muted { color: #64748b; font-size: 8pt; }
    footer { margin-top: 12px; padding-top: 7px; border-top: 1px solid #dbe2ea; color: #64748b; font-size: 7.5pt; text-align: right; }
  `;
  target.head.replaceChildren(style);
  target.title = `${data.company.name} - Organogram`;

  const header = element('header');
  const identity = element('div');
  identity.append(element('h1', undefined, data.company.name));
  identity.append(
    element(
      'p',
      'subtitle',
      `${data.view === 'EMPLOYEE' ? 'Employee reporting hierarchy' : 'Position establishment hierarchy'} · Organogram`,
    ),
  );
  const generated = new Date(data.generatedAt);
  const meta = element('div', 'meta');
  meta.append(
    element(
      'div',
      undefined,
      `Generated ${Number.isNaN(generated.getTime()) ? data.generatedAt : generated.toLocaleString()}`,
    ),
    element('div', undefined, `Data version ${data.dataVersion}`),
  );
  header.append(identity, meta);

  const summary = element('div', 'summary');
  summary.append(
    element(
      'span',
      undefined,
      `${data.nodes.length} ${data.view === 'EMPLOYEE' ? 'people' : 'positions'}`,
    ),
    element('span', undefined, `${data.departments.length} departments`),
    element('span', undefined, `${data.nodes.filter((node) => node.vacant).length} vacancies`),
  );

  const legend = element('section', 'legend');
  legend.setAttribute('aria-label', 'Department legend');
  for (const department of data.departments) {
    const item = element('span', 'legend-item');
    const dot = element('i', 'dot');
    dot.style.backgroundColor = colourByDepartment.get(department.id)!;
    item.append(dot, target.createTextNode(department.name));
    legend.append(item);
  }

  const table = element('table');
  const head = element('thead');
  const headRow = element('tr');
  for (const [label, width] of [
    ['Hierarchy', '36%'],
    ['Title', '24%'],
    ['Department', '21%'],
    ['Code', '10%'],
    ['Type', '9%'],
  ]) {
    const cell = element('th', undefined, label);
    cell.style.width = width;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = element('tbody');
  for (const row of organogramPrintRows(data)) {
    const tr = element('tr');
    const hierarchy = element('td');
    const person = element('div', `person${row.node.vacant ? ' vacant' : ''}`);
    person.style.paddingLeft = `${Math.min(row.depth, 12) * 16}px`;
    person.append(
      element('span', 'branch', row.depth ? '↳' : '●'),
      target.createTextNode(row.node.name),
    );
    hierarchy.append(person);
    tr.append(
      hierarchy,
      element('td', undefined, row.node.title || '—'),
      element('td', undefined, departmentNames.get(row.node.departmentId ?? -1) ?? '—'),
      element('td', 'muted', row.node.employeeCode || '—'),
      element(
        'td',
        row.node.vacant ? 'vacant' : undefined,
        row.node.vacant ? 'Vacant' : data.view === 'EMPLOYEE' ? 'Employee' : 'Position',
      ),
    );
    body.append(tr);
  }
  table.append(head, body);

  const content: Node[] = [header, summary];
  if (data.departments.length) content.push(legend);
  if (data.warnings.length) {
    const warning = element(
      'section',
      'warnings',
      `Data-quality notice: ${data.warnings.map((item) => item.message).join(' · ')}`,
    );
    content.push(warning);
  }
  content.push(
    table,
    element('footer', undefined, 'Generated securely by OMS · Contact details are excluded'),
  );
  target.body.replaceChildren(...content);
}

@Injectable({ providedIn: 'root' })
export class OrganogramExportService {
  csv(data: OrganogramResponse): void {
    const dept = new Map(data.departments.map((d) => [d.id, d.name]));
    const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const rows = [
      ['Employee/position', 'Code', 'Title', 'Department', 'Parent ID', 'Vacant'],
      ...data.nodes.map((n) => [
        n.name,
        n.employeeCode ?? '',
        n.title ?? '',
        dept.get(n.departmentId ?? -1) ?? '',
        n.parentId ?? '',
        n.vacant,
      ]),
    ];
    this.download(
      new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], {
        type: 'text/csv;charset=utf-8',
      }),
      `${this.safe(data.company.name)}-organogram.csv`,
    );
  }
  async png(element: HTMLElement, data: OrganogramResponse): Promise<void> {
    const rect = element.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(element.scrollWidth || rect.width));
    const height = Math.max(1, Math.ceil(element.scrollHeight || rect.height));
    const clone = element.cloneNode(true) as HTMLElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    const xml = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (b) => b && this.download(b, `${this.safe(data.company.name)}-organogram.png`),
        'image/png',
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  print(data: OrganogramResponse): void {
    const frame = document.createElement('iframe');
    frame.title = 'Organogram print document';
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      right: '0',
      bottom: '0',
      border: '0',
      opacity: '0',
    });
    document.body.append(frame);
    const printWindow = frame.contentWindow;
    const printDocument = frame.contentDocument;
    if (!printWindow || !printDocument) {
      frame.remove();
      return;
    }
    renderOrganogramPrintDocument(printDocument, data);
    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      frame.remove();
    };
    printWindow.onafterprint = cleanup;
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    });
    window.setTimeout(cleanup, 60_000);
  }
  private download(blob: Blob, name: string) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  private safe(value: string) {
    return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'company';
  }
}
