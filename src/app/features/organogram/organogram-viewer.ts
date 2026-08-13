import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { OrgDataService } from '../../core/data/org-data.service';
import { Position, Staff } from '../../core/models/organization.model';

interface OrgNode {
  staff: Staff;
  children: OrgNode[];
  color: string;
}

@Component({
  selector: 'app-organogram-viewer',
  imports: [NgTemplateOutlet, DecimalPipe, FormsModule, SelectModule, ButtonModule, TagModule, TooltipModule],
  template: `
    <div class="org-shell">
      <!-- Toolbar -->
      <div class="org-toolbar">
        <div class="tb-left">
          <p-select [(ngModel)]="companyId" [options]="companyOptions()" optionLabel="label" optionValue="value"
            (ngModelChange)="onCompanyChange()" placeholder="Select company" styleClass="company-select" />
          <span class="org-search">
            <i class="pi pi-search"></i>
            <input type="text" placeholder="Search name, title, department…"
              [value]="term()" (input)="term.set($any($event.target).value)" />
          </span>
        </div>
        <div class="tb-right">
          <div class="view-switch" role="group" aria-label="Organogram view">
            <button [class.active]="viewMode()==='2d'" (click)="setView('2d')" aria-label="Use two-dimensional view">2D</button>
            <button [class.active]="viewMode()==='3d'" (click)="setView('3d')" aria-label="Use three-dimensional view"><i class="pi pi-box"></i> 3D</button>
          </div>
          <button class="tb-btn" pTooltip="Expand all" (click)="expandAll()"><i class="pi pi-plus-circle"></i></button>
          <button class="tb-btn" pTooltip="Collapse all" (click)="collapseAll()"><i class="pi pi-minus-circle"></i></button>
          <span class="tb-sep"></span>
          <button class="tb-btn" pTooltip="Zoom out" (click)="zoomBy(-0.15)"><i class="pi pi-minus"></i></button>
          <span class="zoom-label">{{ (zoom() * 100) | number: '1.0-0' }}%</span>
          <button class="tb-btn" pTooltip="Zoom in" (click)="zoomBy(0.15)"><i class="pi pi-plus"></i></button>
          <button class="tb-btn" pTooltip="Reset view" (click)="resetView()"><i class="pi pi-refresh"></i></button>
          @if(viewMode()==='3d'){
            <button class="tb-btn" pTooltip="Rotate left" aria-label="Rotate 3D view left" (click)="rotateBy(-6)"><i class="pi pi-undo"></i></button>
            <button class="tb-btn" pTooltip="Rotate right" aria-label="Rotate 3D view right" (click)="rotateBy(6)"><i class="pi pi-refresh"></i></button>
            <button class="tb-btn" pTooltip="Focus selected" aria-label="Focus selected person" [disabled]="!selected()" (click)="focusSelected()"><i class="pi pi-crosshairs"></i></button>
          }
          <span class="tb-sep"></span>
          <button class="tb-btn text-primary" pTooltip="Export organogram PNG" (click)="exportChart()"><i class="pi pi-download"></i></button>
        </div>
      </div>

      <!-- Canvas -->
      <div class="org-canvas" (mousedown)="startPan($event)" (wheel)="onWheel($event)" [class.panning]="panning()" [class.view-3d]="viewMode()==='3d'">
        @if (roots().length) {
          <div class="org-stage" [style.transform]="stageTransform()">
            <div class="chart">
              <ul class="roots">
                @for (root of roots(); track root.staff.id) {
                  <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: root }" />
                }
              </ul>
            </div>

            @if (vacancies().length) {
              <div class="vacancy-band">
                <div class="vb-title"><i class="pi pi-inbox"></i> Vacant positions ({{ vacancies().length }})</div>
                <div class="vb-list">
                  @for (v of vacancies(); track v.id) {
                    <div class="vac-card" [style.border-color]="deptColor(v.deptId)">
                      <span class="vac-dot" [style.background]="deptColor(v.deptId)"></span>
                      <div>
                        <div class="vac-title">{{ v.title }}</div>
                        <div class="vac-dept">{{ org.departmentName(v.deptId) }}</div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="org-empty">
            <i class="pi pi-sitemap"></i>
            <h3>{{ companyId() ? 'No hierarchy to display' : 'Select a company' }}</h3>
            <p>
              @if (companyId()) {
                Add staff to this company and set their “reports to” manager to build the organogram.
              } @else {
                Choose a company above, or add companies and staff first.
              }
            </p>
          </div>
        }
      </div>
    </div>

    <!-- Recursive node template -->
    <ng-template #nodeTpl let-node>
      <li>
        <div class="node" tabindex="0" [class.match]="isHit(node)" [class.dim]="term() && !isHit(node)" [class.related]="isRelated(node)" [class.branch-dim]="hoveredId() && !isRelated(node)"
          [style.border-top-color]="node.color" (click)="select(node.staff)"
          (keydown.enter)="select(node.staff)" (keydown.space)="select(node.staff); $event.preventDefault()"
          (mouseenter)="hoveredId.set(node.staff.id)" (mouseleave)="hoveredId.set(null)"
          draggable="true" (dragstart)="onDragStart($event, node)" (dragover)="onDragOver($event)" (drop)="onDrop($event, node)"
          pTooltip="Drag onto a new manager to reassign reporting line" tooltipPosition="top">
          <div class="node-top">
            <span class="avatar" [style.background]="node.color">{{ initials(node.staff.name) }}</span>
            <span class="status-dot" [class.inactive]="node.staff.status !== 'ACTIVE'"></span>
          </div>
          <div class="node-name">{{ node.staff.name }}</div>
          <div class="node-title">{{ node.staff.title || '—' }}</div>
          <div class="node-dept" [style.color]="node.color">{{ org.departmentName(node.staff.deptId) }}</div>
          @if (node.staff.landline || node.staff.cellNumber) {
            <div class="node-phone" pTooltip="Telephone Number">
              <i class="pi pi-phone"></i>
              <span>{{ node.staff.landline || node.staff.cellNumber }}</span>
            </div>
          }
          @if (node.children.length) {
            <button class="node-toggle" (click)="toggle(node, $event)"
              [pTooltip]="isCollapsed(node) ? 'Expand' : 'Collapse'">
              <i class="pi" [class.pi-chevron-down]="!isCollapsed(node)" [class.pi-chevron-up]="isCollapsed(node)"></i>
              <span class="count">{{ descendantCount(node) }}</span>
            </button>
          }
        </div>
        @if (node.children.length && !isCollapsed(node)) {
          <ul>
            @for (child of node.children; track child.staff.id) {
              <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: child }" />
            }
          </ul>
        }
      </li>
    </ng-template>

    <!-- Profile panel -->
    @if (selected(); as s) {
      <div class="drawer-scrim" (click)="selected.set(null)"></div>
      <aside class="drawer">
        <div class="drawer-head" [style.background]="deptColor(s.deptId)">
          <button class="drawer-close" (click)="selected.set(null)"><i class="pi pi-times"></i></button>
          <span class="drawer-avatar">{{ initials(s.name) }}</span>
          <h2>{{ s.name }}</h2>
          <p>{{ s.title || '—' }}</p>
        </div>
        <div class="drawer-body">
          <div class="d-row"><span>Status</span>
            <p-tag [value]="s.status === 'ACTIVE' ? 'Active' : 'Inactive'" [severity]="s.status === 'ACTIVE' ? 'success' : 'warn'" />
          </div>
          <div class="d-row"><span>Employee code</span><strong>{{ s.employeeCode || '—' }}</strong></div>
          <div class="d-row"><span>Company</span><strong>{{ org.companyName(s.companyId) }}</strong></div>
          <div class="d-row"><span>Department</span><strong>{{ org.departmentName(s.deptId) }}</strong></div>
          <div class="d-row"><span>Reports to</span><strong>{{ org.staffName(s.managerId) }}</strong></div>
          <div class="d-row"><span>Employment</span><strong>{{ s.empType }}</strong></div>
          <div class="d-row"><span>Email</span><strong>{{ s.email || '—' }}</strong></div>
          <div class="d-row">
            <span>Telephone No.</span>
            <strong>{{ s.landline || s.cellNumber || '—' }}</strong>
          </div>
          @if (s.landline && s.cellNumber) {
            <div class="d-row">
              <span>Mobile No.</span>
              <strong>{{ s.cellNumber }}</strong>
            </div>
          }
          <div class="d-row"><span>Joined</span><strong>{{ s.dateJoined || '—' }}</strong></div>
          @if (s.dateLeft) { <div class="d-row"><span>Left</span><strong>{{ s.dateLeft }}</strong></div> }
          <div class="d-chain">
            <div class="d-chain-title">Reporting line</div>
            @for (r of reportingChain(s); track r.id; let last = $last) {
              <div class="chain-item">
                <span class="chain-dot" [style.background]="deptColor(r.deptId)"></span>
                <span>{{ r.name }} <em>· {{ r.title }}</em></span>
              </div>
            }
          </div>
        </div>
      </aside>
    }
  `,
  styles: [
    `
      .org-shell { display: flex; flex-direction: column; height: calc(100vh - var(--oms-topbar-height) - 47px); }
      .org-toolbar {
        display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
        padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--p-content-border-color);
        background: var(--p-content-background);
      }
      .tb-left, .tb-right { display: flex; align-items: center; gap: 0.5rem; }
      :host ::ng-deep .company-select { min-width: 15rem; }
      .view-switch{display:inline-flex;padding:3px;border:1px solid var(--p-content-border-color);border-radius:10px;background:var(--oms-subtle-bg)}.view-switch button{border:0;border-radius:7px;background:transparent;color:var(--p-text-muted-color);padding:.35rem .58rem;font-size:.75rem;font-weight:700;cursor:pointer}.view-switch button.active{background:var(--p-content-background);color:var(--p-primary-color);box-shadow:0 3px 10px rgba(0,0,0,.14)}
      .org-search { position: relative; }
      .org-search i { position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: var(--p-text-muted-color); }
      .org-search input {
        padding: 0.55rem 0.8rem 0.55rem 2rem; border-radius: 8px; min-width: 18rem;
        background: var(--p-content-background); color: var(--p-text-color);
        border: 1px solid var(--p-content-border-color); outline: none;
      }
      .tb-btn {
        width: 36px; height: 36px; border: 1px solid var(--p-content-border-color); background: transparent;
        border-radius: 8px; cursor: pointer; color: var(--p-text-color); transition: all 0.15s;
      }
      .tb-btn:hover { border-color: var(--p-primary-color); color: var(--p-primary-color); }
      .tb-sep { width: 1px; height: 22px; background: var(--p-content-border-color); margin: 0 0.25rem; }
      .zoom-label { font-size: 0.82rem; color: var(--p-text-muted-color); min-width: 3rem; text-align: center; }

      .org-canvas { flex: 1; overflow: hidden; position: relative; cursor: grab;
        background:
          radial-gradient(circle at 1px 1px, var(--p-content-border-color) 1px, transparent 0);
        background-size: 26px 26px; }
      .org-canvas.panning { cursor: grabbing; }
      .org-stage { transform-origin: 0 0; padding: 3rem; width: max-content; }
      .org-canvas.view-3d{perspective:1500px;background:radial-gradient(circle at 50% 25%,color-mix(in srgb,var(--p-primary-color) 10%,transparent),transparent 38%),radial-gradient(circle at 1px 1px,var(--p-content-border-color) 1px,transparent 0);background-size:auto,26px 26px}.view-3d .org-stage{transform-style:preserve-3d;transform-origin:30% 20%}.view-3d .chart,.view-3d .chart ul,.view-3d .chart li{transform-style:preserve-3d}.view-3d .chart ul ul{transform:translateZ(10px)}.view-3d .node{background:color-mix(in srgb,var(--p-content-background) 91%,transparent);backdrop-filter:blur(12px);box-shadow:0 18px 36px -24px rgba(0,0,0,.72),inset 0 1px rgba(255,255,255,.16);transform:translateZ(18px)}.view-3d .node:hover,.view-3d .node.related{transform:translateY(-5px) translateZ(34px);box-shadow:0 25px 42px -22px color-mix(in srgb,var(--p-primary-color) 35%,rgba(0,0,0,.6))}.node.branch-dim{opacity:.3;filter:saturate(.45)}.node.related{border-color:color-mix(in srgb,var(--p-primary-color) 58%,var(--p-content-border-color))}.node:focus-visible{outline:2px solid var(--p-primary-color);outline-offset:3px}

      /* org chart connectors */
      .chart ul { display: flex; justify-content: center; padding-top: 22px; position: relative; margin: 0; }
      .chart li { list-style: none; position: relative; padding: 22px 12px 0; }
      .chart li::before, .chart li::after {
        content: ''; position: absolute; top: 0; right: 50%; border-top: 2px solid var(--p-content-border-color);
        width: 50%; height: 22px;
      }
      .chart li::after { right: auto; left: 50%; border-left: 2px solid var(--p-content-border-color); }
      .chart li:only-child::before, .chart li:only-child::after { display: none; }
      .chart li:only-child { padding-top: 0; }
      .chart li:first-child::before, .chart li:last-child::after { border: 0 none; }
      .chart li:last-child::before { border-right: 2px solid var(--p-content-border-color); border-radius: 0 8px 0 0; }
      .chart li:first-child::after { border-radius: 8px 0 0 0; }
      .chart ul ul::before {
        content: ''; position: absolute; top: 0; left: 50%; border-left: 2px solid var(--p-content-border-color);
        width: 0; height: 22px;
      }
      .chart > ul.roots { padding-top: 0; }
      .chart > ul.roots > li { padding-top: 0; }
      .chart > ul.roots > li::before, .chart > ul.roots > li::after { display: none; }

      .node {
        position: relative; width: 168px; padding: 0.85rem 0.75rem 0.75rem; text-align: center; cursor: pointer;
        background: var(--p-content-background); border: 1px solid var(--p-content-border-color);
        border-top: 3px solid var(--p-primary-color); border-radius: 12px; display: inline-block;
        transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
      }
      .node:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28); }
      .node.match { box-shadow: 0 0 0 2px var(--p-primary-color), 0 8px 22px rgba(0, 0, 0, 0.3); }
      .node.dim { opacity: 0.35; }
      .node-top { display: flex; justify-content: center; position: relative; margin-bottom: 0.5rem; }
      .avatar {
        width: 46px; height: 46px; border-radius: 50%; color: #fff; display: grid; place-items: center;
        font-weight: 600; font-size: 1rem;
      }
      .status-dot {
        position: absolute; right: calc(50% - 26px); bottom: 2px; width: 11px; height: 11px; border-radius: 50%;
        background: #22c55e; border: 2px solid var(--p-content-background);
      }
      .status-dot.inactive { background: #94a3b8; }
      .node-name { font-weight: 600; font-size: 0.88rem; color: var(--p-text-color); line-height: 1.2; }
      .node-title { font-size: 0.76rem; color: var(--p-text-muted-color); margin-top: 0.15rem; }
      .node-dept { font-size: 0.7rem; font-weight: 600; margin-top: 0.35rem; text-transform: uppercase; letter-spacing: 0.03em; }
      .node-phone { display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem; margin-top: 0.4rem; font-size: 0.7rem; font-weight: 600; color: #0f8bfd; background: rgba(15, 139, 253, 0.1); border-radius: 4px; padding: 2px 6px; }
      .drawer-tel-link { display: inline-flex; align-items: center; gap: 0.35rem; color: #0f8bfd; font-weight: 700; text-decoration: none; }
      .drawer-tel-link:hover { text-decoration: underline; color: #38bdf8; }
      .node-toggle {
        position: absolute; bottom: -13px; left: 50%; transform: translateX(-50%);
        display: inline-flex; align-items: center; gap: 0.25rem; height: 24px; padding: 0 0.5rem;
        border-radius: 20px; border: 1px solid var(--p-content-border-color); background: var(--p-content-background);
        color: var(--p-text-color); cursor: pointer; font-size: 0.72rem; z-index: 2;
      }
      .node-toggle:hover { border-color: var(--p-primary-color); color: var(--p-primary-color); }
      .node-toggle .count { font-weight: 600; }

      .vacancy-band { margin-top: 2.5rem; }
      .vb-title { font-size: 0.8rem; font-weight: 600; color: var(--p-text-muted-color); margin-bottom: 0.6rem; }
      .vb-list { display: flex; flex-wrap: wrap; gap: 0.6rem; }
      .vac-card {
        display: flex; align-items: center; gap: 0.5rem; padding: 0.55rem 0.8rem; border-radius: 10px;
        border: 1px dashed var(--p-content-border-color); background: var(--p-content-background); min-width: 160px;
      }
      .vac-dot { width: 8px; height: 8px; border-radius: 50%; }
      .vac-title { font-size: 0.82rem; font-weight: 600; color: var(--p-text-color); }
      .vac-dept { font-size: 0.72rem; color: var(--p-text-muted-color); }

      .org-empty {
        position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; color: var(--p-text-muted-color);
      }
      .org-empty i { font-size: 3rem; opacity: 0.35; margin-bottom: 1rem; }
      .org-empty h3 { margin: 0 0 0.4rem; color: var(--p-text-color); }
      .org-empty p { margin: 0; max-width: 26rem; }

      /* Drawer */
      .drawer-scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: 60; }
      .drawer {
        position: fixed; top: 0; right: 0; bottom: 0; width: 360px; max-width: 92vw; z-index: 61;
        background: var(--p-content-background); border-left: 1px solid var(--p-content-border-color);
        box-shadow: -8px 0 30px rgba(0, 0, 0, 0.3); display: flex; flex-direction: column;
        animation: drawer-in 0.2s ease;
      }
      @keyframes drawer-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
      .drawer-head { padding: 1.75rem 1.5rem 1.5rem; color: #fff; position: relative; text-align: center; }
      .drawer-close {
        position: absolute; top: 0.85rem; right: 0.85rem; width: 32px; height: 32px; border: none; cursor: pointer;
        border-radius: 8px; background: rgba(255, 255, 255, 0.2); color: #fff;
      }
      .drawer-avatar {
        width: 66px; height: 66px; border-radius: 50%; background: rgba(255, 255, 255, 0.25);
        display: grid; place-items: center; margin: 0 auto 0.75rem; font-size: 1.5rem; font-weight: 700;
      }
      .drawer-head h2 { margin: 0; font-size: 1.2rem; }
      .drawer-head p { margin: 0.2rem 0 0; opacity: 0.9; font-size: 0.85rem; }
      .drawer-body { padding: 1.25rem 1.5rem; overflow-y: auto; }
      .d-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.6rem 0; border-top: 1px solid var(--p-content-border-color); }
      .d-row:first-child { border-top: none; }
      .d-row span { color: var(--p-text-muted-color); font-size: 0.85rem; }
      .d-row strong { font-weight: 600; text-align: right; }
      .d-chain { margin-top: 1.25rem; }
      .d-chain-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--p-text-muted-color); margin-bottom: 0.6rem; }
      .chain-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; font-size: 0.85rem; }
      .chain-item em { color: var(--p-text-muted-color); font-style: normal; }
      .chain-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      @media(max-width:760px){.org-shell{height:calc(100vh - var(--oms-topbar-height))}.tb-left,.tb-right{width:100%;overflow-x:auto}.org-search{flex:1}.org-search input{min-width:12rem;width:100%}.view-3d .org-stage{transform-style:flat}.view-3d .node{transform:none}.tb-sep{display:none}}
      @media(prefers-reduced-motion:reduce){.node,.org-stage,.drawer{transition:none;animation:none}.view-3d .node:hover,.view-3d .node.related{transform:translateZ(18px)}}
    `,
  ],
})
export class OrganogramViewer implements OnInit {
  readonly org = inject(OrgDataService);
  private readonly messages = inject(MessageService);

  readonly companyId = signal<number | null>(null);
  readonly term = signal('');
  readonly zoom = signal(1);
  readonly viewMode = signal<'2d'|'3d'>('2d');
  readonly rotation = signal(-5);
  readonly hoveredId = signal<number|null>(null);
  readonly selected = signal<Staff | null>(null);
  readonly draggedNode = signal<OrgNode | null>(null);
  private readonly collapsed = signal<Set<number>>(new Set());
  private readonly refresh = signal(0);

  readonly panning = signal(false);
  private pan = signal({ x: 0, y: 0 });
  private panStart = { x: 0, y: 0, px: 0, py: 0 };

  private readonly palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e', '#84cc16', '#f97316'];

  readonly companyOptions = computed(() => {
    this.refresh();
    return this.org.companies.snapshot().map((c) => ({ label: c.name, value: c.id }));
  });

  private readonly companyStaff = computed<Staff[]>(() => {
    this.refresh();
    const cid = this.companyId();
    if (cid == null) return [];
    return this.org.staff.snapshot().filter((s) => s.companyId === cid);
  });

  readonly roots = computed<OrgNode[]>(() => {
    const staff = this.companyStaff();
    const ids = new Set(staff.map((s) => s.id));
    const childrenOf = new Map<number, Staff[]>();
    for (const s of staff) {
      const key = s.managerId != null && ids.has(s.managerId) ? s.managerId : -1;
      (childrenOf.get(key) ?? childrenOf.set(key, []).get(key)!).push(s);
    }
    const build = (s: Staff): OrgNode => ({
      staff: s,
      color: this.deptColor(s.deptId),
      children: (childrenOf.get(s.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)).map(build),
    });
    return (childrenOf.get(-1) ?? []).sort((a, b) => a.name.localeCompare(b.name)).map(build);
  });

  readonly vacancies = computed<Position[]>(() => {
    this.refresh();
    const cid = this.companyId();
    if (cid == null) return [];
    return this.org.positions.snapshot().filter((p) => p.companyId === cid && p.isVacant && p.status !== 'CLOSED');
  });

  ngOnInit(): void {
    const first = this.org.companies.snapshot()[0];
    if (first) this.companyId.set(first.id);
  }

  setView(mode:'2d'|'3d'):void{this.viewMode.set(mode);this.resetView()}
  rotateBy(delta:number):void{this.rotation.update(value=>Math.max(-24,Math.min(24,value+delta)))}
  focusSelected():void{const person=this.selected();if(!person)return;this.term.set(person.name);this.zoom.set(1.15);this.pan.set({x:0,y:0})}

  onCompanyChange(): void {
    this.collapsed.set(new Set());
    this.resetView();
  }

  deptColor(deptId?: number | null): string {
    if (deptId == null) return '#64748b';
    return this.palette[deptId % this.palette.length];
  }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  isCollapsed(node: OrgNode): boolean {
    return !this.term() && this.collapsed().has(node.staff.id);
  }

  toggle(node: OrgNode, ev: Event): void {
    ev.stopPropagation();
    const set = new Set(this.collapsed());
    set.has(node.staff.id) ? set.delete(node.staff.id) : set.add(node.staff.id);
    this.collapsed.set(set);
  }

  expandAll(): void {
    this.collapsed.set(new Set());
  }

  collapseAll(): void {
    const set = new Set<number>();
    const walk = (n: OrgNode) => {
      if (n.children.length) {
        set.add(n.staff.id);
        n.children.forEach(walk);
      }
    };
    this.roots().forEach(walk);
    this.collapsed.set(set);
  }

  descendantCount(node: OrgNode): number {
    let count = 0;
    const walk = (n: OrgNode) => n.children.forEach((c) => { count++; walk(c); });
    walk(node);
    return count;
  }

  isHit(node: OrgNode): boolean {
    const t = this.term().trim().toLowerCase();
    if (!t) return false;
    const s = node.staff;
    return [s.name, s.title, this.org.departmentName(s.deptId)].some((v) => (v ?? '').toLowerCase().includes(t));
  }

  isRelated(node:OrgNode):boolean{const id=this.hoveredId();if(id==null)return false;return node.staff.id===id||node.staff.managerId===id||this.companyStaff().find(s=>s.id===id)?.managerId===node.staff.id}

  select(staff: Staff): void {
    this.selected.set(staff);
  }

  reportingChain(s: Staff): Staff[] {
    const all = this.org.staff.snapshot();
    const byId = new Map(all.map((x) => [x.id, x]));
    const chain: Staff[] = [];
    let cur: Staff | undefined = s;
    const guard = new Set<number>();
    while (cur && !guard.has(cur.id)) {
      chain.unshift(cur);
      guard.add(cur.id);
      cur = cur.managerId != null ? byId.get(cur.managerId) : undefined;
    }
    return chain;
  }

  // ---- zoom & pan ----
  stageTransform(): string {
    const p = this.pan();
    const depth=this.viewMode()==='3d'?` rotateX(5deg) rotateY(${this.rotation()}deg)`:'';
    return `translate(${p.x}px, ${p.y}px) scale(${this.zoom()})${depth}`;
  }

  zoomBy(delta: number): void {
    this.zoom.set(Math.min(2, Math.max(0.3, +(this.zoom() + delta).toFixed(2))));
  }

  resetView(): void {
    this.zoom.set(1);
    this.pan.set({ x: 0, y: 0 });
    this.rotation.set(-5);
  }

  onWheel(ev: WheelEvent): void {
    if (!this.roots().length) return;
    ev.preventDefault();
    this.zoomBy(ev.deltaY < 0 ? 0.1 : -0.1);
  }

  startPan(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).closest('.node, .node-toggle, .vac-card')) return;
    this.panning.set(true);
    const p = this.pan();
    this.panStart = { x: ev.clientX, y: ev.clientY, px: p.x, py: p.y };
  }

  @HostListener('window:mousemove', ['$event'])
  onMove(ev: MouseEvent): void {
    if (!this.panning()) return;
    this.pan.set({ x: this.panStart.px + (ev.clientX - this.panStart.x), y: this.panStart.py + (ev.clientY - this.panStart.y) });
  }

  @HostListener('window:mouseup')
  onUp(): void {
    this.panning.set(false);
  }

  // ---- Drag and Drop Hierarchy Updates ----
  onDragStart(ev: DragEvent, node: OrgNode): void {
    ev.stopPropagation();
    this.draggedNode.set(node);
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(node.staff.id));
    }
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  }

  onDrop(ev: DragEvent, targetNode: OrgNode): void {
    ev.preventDefault();
    ev.stopPropagation();
    const dragged = this.draggedNode();
    if (!dragged || dragged.staff.id === targetNode.staff.id) return;

    // Check if target node is descendant of dragged node (prevent cycle)
    const isDescendant = (n: OrgNode): boolean =>
      n.staff.id === targetNode.staff.id || n.children.some(isDescendant);

    if (isDescendant(dragged)) {
      this.messages.add({ severity: 'error', summary: 'Invalid reassignment', detail: 'Cannot assign a manager to their own report.' });
      return;
    }

    this.org.staff.update(dragged.staff.id, { managerId: targetNode.staff.id }).subscribe({
      next: () => {
        this.messages.add({
          severity: 'success',
          summary: 'Hierarchy updated',
          detail: `${dragged.staff.name} now reports to ${targetNode.staff.name}.`,
        });
        this.draggedNode.set(null);
      },
    });
  }

  exportChart(): void {
    const chartEl = document.querySelector('.chart') as HTMLElement;
    if (!chartEl) return;
    const companyName = this.org.companyName(this.companyId());
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Organogram — ${companyName}</title>
          <style>
            body { font-family: sans-serif; background: #2c2f3d; color: #fff; padding: 2rem; }
            h1 { font-size: 1.5rem; text-align: center; margin-bottom: 1.5rem; color: #0f8bfd; }
            .chart { display: flex; justify-content: center; }
            ul { display: flex; padding-top: 20px; position: relative; list-style: none; padding-left: 0; }
            li { text-align: center; list-style-type: none; position: relative; padding: 20px 8px 0 8px; }
            .node { border: 1.5px solid #0f8bfd; background: #212431; padding: 14px; border-radius: 12px; min-width: 150px; text-align: center; }
            .node-name { font-weight: 700; font-size: 0.9rem; color: #fff; }
            .node-title { font-size: 0.8rem; color: #a0a7b5; margin-top: 2px; }
            .node-dept { font-size: 0.72rem; color: #0f8bfd; text-transform: uppercase; margin-top: 4px; }
          </style>
        </head>
        <body>
          <h1>Sunrich Companies — ${companyName} Organogram</h1>
          ${chartEl.outerHTML}
          <script>setTimeout(() => window.print(), 400);</script>
        </body>
      </html>
    `);
    win.document.close();
  }
}
