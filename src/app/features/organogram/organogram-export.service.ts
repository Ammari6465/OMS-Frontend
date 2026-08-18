import { Injectable } from '@angular/core';
import { OrganogramResponse } from './organogram.models';

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
  print(): void {
    window.print();
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
