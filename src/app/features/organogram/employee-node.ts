import { Component, input, output } from '@angular/core';
import { HierarchyNode } from './organogram.models';
@Component({
  selector: 'app-employee-node',
  template: `<article
    class="node"
    [class.match]="match()"
    [class.chain]="chain()"
    [class.warning]="warning()"
    [attr.data-org-node]="node().data.id"
    tabindex="0"
    role="treeitem"
    [attr.aria-label]="label()"
    (click)="selected.emit()"
    (keydown.enter)="selected.emit()"
    (keydown.space)="$event.preventDefault(); selected.emit()"
  >
    <div class="top">
      @if (node().data.photoUrl) {
        <img class="avatar" [src]="node().data.photoUrl" alt="" />
      } @else {
        <span class="avatar" [style.background]="colour()">{{ initials() }}</span>
      }
      @if (editable()) {
        <span class="handle" title="Drag to change manager" aria-hidden="true">⋮⋮</span>
      }
    </div>
    <strong>{{ node().data.name }}</strong
    ><span>{{ node().data.title || 'No title' }}</span
    ><small><i class="legend" [style.background]="colour()"></i>{{ department() }}</small>
    <footer>
      <span>{{ node().directReports }} direct</span><span>{{ node().totalReports }} total</span>
      @if (editable()) {
        <button
          aria-label="Change manager for {{ node().data.name }}"
          (click)="$event.stopPropagation(); changeManager.emit()"
        >
          <i class="pi pi-users"></i>
        </button>
      }
    </footer>
  </article>`,
  styles: [
    `
      .node {
        width: 184px;
        padding: 0.8rem;
        border: 1px solid var(--p-content-border-color);
        border-top: 3px solid var(--dept);
        border-radius: 12px;
        background: var(--oms-glass-strong);
        box-shadow: var(--oms-card-shadow);
        text-align: center;
        cursor: pointer;
      }
      .node:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 3px;
      }
      .node.match {
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--p-primary-color) 55%, transparent);
      }
      .node.chain {
        border-color: var(--p-primary-color);
      }
      .node.warning {
        border-color: #ef4444;
      }
      .top {
        display: flex;
        justify-content: center;
        position: relative;
      }
      .avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: white;
        font-weight: 800;
        object-fit: cover;
      }
      .handle {
        position: absolute;
        right: 0;
        cursor: grab;
      }
      .node > strong,
      .node > span,
      .node > small {
        display: block;
      }
      .node > strong {
        margin-top: 0.35rem;
      }
      .node > span {
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
      }
      .node > small {
        font-size: 0.7rem;
        margin-top: 0.35rem;
      }
      .legend {
        display: inline-block;
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 2px;
        margin-right: 0.3rem;
      }
      footer {
        display: flex;
        gap: 0.35rem;
        align-items: center;
        justify-content: center;
        margin-top: 0.5rem;
        font-size: 0.65rem;
        color: var(--p-text-muted-color);
      }
      footer span {
        padding: 0.15rem 0.35rem;
        border-radius: 999px;
        background: var(--oms-hover-bg);
      }
      button {
        border: 0;
        background: transparent;
        color: var(--p-primary-color);
        cursor: pointer;
      }
    `,
  ],
})
export class EmployeeNode {
  readonly node = input.required<HierarchyNode>();
  readonly department = input('Unassigned');
  readonly colour = input('#64748b');
  readonly editable = input(false);
  readonly match = input(false);
  readonly chain = input(false);
  readonly warning = input(false);
  readonly selected = output<void>();
  readonly changeManager = output<void>();
  initials() {
    const p = this.node().data.name.trim().split(/\s+/);
    return `${p[0]?.[0] ?? ''}${p.at(-1)?.[0] ?? ''}`.toUpperCase();
  }
  label() {
    const n = this.node();
    return `${n.data.name}, ${n.data.title || 'no title'}, ${this.department()}, ${n.directReports} direct reports, ${n.totalReports} total reports`;
  }
}
