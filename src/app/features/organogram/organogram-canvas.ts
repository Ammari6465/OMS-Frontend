import { Component, ElementRef, HostListener, ViewChild, inject, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { EmployeeNode } from './employee-node';
import { HierarchyNode, OrganogramNode } from './organogram.models';
import { OrganogramStore } from './organogram.store';
@Component({
  selector: 'app-organogram-canvas',
  imports: [NgTemplateOutlet, EmployeeNode],
  template: `<main
    #canvas
    class="canvas"
    role="tree"
    aria-label="Company hierarchy"
    tabindex="0"
    (wheel)="wheel($event)"
    (mousedown)="startPan($event)"
    (keydown)="keys($event)"
  >
    <div #stage class="stage" [style.transform]="transform()">
      <section class="legend" aria-label="Department colour legend">
        @for (d of s.departments(); track d.id) {
          <span><i [style.background]="colour(d.id)"></i>{{ d.name }}</span>
        }
      </section>
      @if (s.data()?.warnings?.length) {
        <section class="warnings" aria-label="Data quality warnings">
          @for (w of s.data()!.warnings; track w.code) {
            <span><i class="pi pi-exclamation-triangle"></i>{{ w.message }}</span>
          }
        </section>
      }
      <ul class="roots">
        @for (root of s.hierarchy().roots; track root.data.id) {
          <ng-container *ngTemplateOutlet="branch; context: { $implicit: root }" />
        }
      </ul>
      <ng-template #branch let-node
        ><li [class.collapsed]="s.collapsed().has(node.data.id)">
          <div
            [draggable]="s.editMode()"
            (dragstart)="dragged = node.data"
            (dragover)="$event.preventDefault()"
            (drop)="drop($event, node.data)"
          >
            <app-employee-node
              [node]="node"
              [department]="department(node.data.departmentId)"
              [colour]="colour(node.data.departmentId)"
              [editable]="s.editMode()"
              [match]="s.activeMatch()?.id === node.data.id"
              [chain]="chain(node.data.id)"
              [warning]="warning(node.data.id)"
              (selected)="s.select(node.data)"
              (changeManager)="managerChange.emit(node.data)"
            />
          </div>
          @if (node.children.length) {
            <button
              class="toggle"
              [attr.aria-label]="
                (s.collapsed().has(node.data.id) ? 'Expand ' : 'Collapse ') + node.data.name
              "
              (click)="s.toggle(node.data.id)"
            >
              <i
                class="pi"
                [class.pi-chevron-down]="s.collapsed().has(node.data.id)"
                [class.pi-chevron-up]="!s.collapsed().has(node.data.id)"
              ></i>
            </button>
          }
          @if (node.children.length && !s.collapsed().has(node.data.id)) {
            <ul>
              @for (child of node.children; track child.data.id) {
                <ng-container *ngTemplateOutlet="branch; context: { $implicit: child }" />
              }
            </ul>
          }</li
      ></ng-template>
    </div>
  </main>`,
  styles: [
    `
      .canvas {
        position: relative;
        flex: 1;
        overflow: auto;
        min-height: 30rem;
        background: radial-gradient(
          circle at 1px 1px,
          var(--p-content-border-color) 1px,
          transparent 0
        );
        background-size: 26px 26px;
        cursor: grab;
      }
      .stage {
        padding: 3rem;
        width: max-content;
        min-width: 100%;
        transform-origin: 0 0;
      }
      .roots,
      .roots ul {
        display: flex;
        justify-content: center;
        position: relative;
        padding-top: 24px;
        margin: 0;
      }
      .roots {
        padding-top: 0;
      }
      .roots li {
        list-style: none;
        position: relative;
        padding: 24px 12px 0;
        text-align: center;
      }
      .roots > li {
        padding-top: 0;
      }
      .roots ul:before {
        content: '';
        position: absolute;
        top: 0;
        left: 50%;
        height: 24px;
        border-left: 2px solid var(--p-content-border-color);
      }
      .roots li:before,
      .roots li:after {
        content: '';
        position: absolute;
        top: 0;
        width: 50%;
        height: 24px;
        border-top: 2px solid var(--p-content-border-color);
      }
      .roots li:before {
        right: 50%;
      }
      .roots li:after {
        left: 50%;
        border-left: 2px solid var(--p-content-border-color);
      }
      .roots > li:before,
      .roots > li:after,
      .roots li:only-child:before,
      .roots li:only-child:after {
        display: none;
      }
      .toggle {
        position: absolute;
        z-index: 2;
        margin-top: -11px;
        transform: translateX(-50%);
        border: 1px solid var(--p-content-border-color);
        border-radius: 50%;
        background: var(--p-content-background);
        color: var(--p-text-color);
        width: 24px;
        height: 24px;
      }
      .warnings {
        position: sticky;
        left: 1rem;
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      .legend {
        position: sticky;
        left: 1rem;
        display: flex;
        gap: 0.55rem;
        flex-wrap: wrap;
        margin-bottom: 0.75rem;
        font-size: 0.7rem;
        color: var(--p-text-muted-color);
      }
      .legend span {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .legend i {
        width: 0.65rem;
        height: 0.65rem;
        border-radius: 2px;
      }
      .warnings span {
        padding: 0.35rem 0.55rem;
        border-radius: 8px;
        background: color-mix(in srgb, #ef4444 12%, var(--p-content-background));
        font-size: 0.72rem;
      }
      .warnings i {
        margin-right: 0.3rem;
        color: #ef4444;
      }
      @media (max-width: 760px) {
        .canvas {
          overflow: auto;
        }
        .stage {
          padding: 1rem;
        }
        .roots,
        .roots ul {
          display: block;
          padding: 0;
        }
        .roots li {
          padding: 0.4rem;
        }
        .roots ul:before,
        .roots li:before,
        .roots li:after {
          display: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        * {
          scroll-behavior: auto !important;
        }
      }
    `,
  ],
})
export class OrganogramCanvas {
  readonly s = inject(OrganogramStore);
  readonly managerChange = output<{ person: OrganogramNode; manager: OrganogramNode }>();
  @ViewChild('canvas') canvas?: ElementRef<HTMLElement>;
  @ViewChild('stage') stage?: ElementRef<HTMLElement>;
  dragged?: OrganogramNode;
  private panning = false;
  private start = { x: 0, y: 0, px: 0, py: 0 };
  private palette = [
    '#2563eb',
    '#059669',
    '#7c3aed',
    '#d97706',
    '#0891b2',
    '#4f46e5',
    '#0f766e',
    '#9333ea',
  ];
  transform() {
    const p = this.s.pan();
    return `translate(${p.x}px,${p.y}px) scale(${this.s.zoom()})`;
  }
  department(id: number | null) {
    return this.s.departments().find((d) => d.id === id)?.name ?? 'Unassigned';
  }
  colour(id: number | null) {
    return id == null ? '#64748b' : this.palette[id % this.palette.length];
  }
  warning(id: number) {
    return this.s.data()?.warnings.some((w) => w.nodeIds.includes(id)) ?? false;
  }
  chain(id: number) {
    const selected = this.s.selectedId();
    return (
      selected != null &&
      (id === selected || (this.s.hierarchy().ancestors.get(selected) ?? []).includes(id))
    );
  }
  drop(ev: DragEvent, target: OrganogramNode) {
    ev.preventDefault();
    if (this.dragged && this.dragged.id !== target.id)
      this.managerChange.emit({ person: this.dragged, manager: target });
    this.dragged = undefined;
  }
  wheel(e: WheelEvent) {
    e.preventDefault();
    this.s.zoomBy(e.deltaY < 0 ? 0.1 : -0.1);
  }
  startPan(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('article,button')) return;
    this.panning = true;
    const p = this.s.pan();
    this.start = { x: e.clientX, y: e.clientY, px: p.x, py: p.y };
  }
  @HostListener('window:mousemove', ['$event']) move(e: MouseEvent) {
    if (this.panning)
      this.s.pan.set({
        x: this.start.px + e.clientX - this.start.x,
        y: this.start.py + e.clientY - this.start.y,
      });
  }
  @HostListener('window:mouseup') up() {
    this.panning = false;
  }
  keys(e: KeyboardEvent) {
    if (e.key === '+' || e.key === '=') {
      this.s.zoomBy(0.1);
      e.preventDefault();
    } else if (e.key === '-') {
      this.s.zoomBy(-0.1);
      e.preventDefault();
    } else if (e.key === '0') {
      this.s.fit();
      e.preventDefault();
    } else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
      const nodes = [
        ...(this.canvas?.nativeElement.querySelectorAll<HTMLElement>('[data-org-node]') ?? []),
      ];
      if (!nodes.length) return;
      const current = nodes.indexOf(document.activeElement as HTMLElement);
      const direction = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      nodes[(current + direction + nodes.length) % nodes.length].focus();
      e.preventDefault();
    }
  }
}
