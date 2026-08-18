import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { OrganogramStore } from './organogram.store';
import { OrganogramView } from './organogram.models';
@Component({
  selector: 'app-organogram-toolbar',
  imports: [FormsModule, ButtonModule, CheckboxModule, SelectModule],
  template: ` <header class="toolbar" aria-label="Organogram controls">
    <div class="filters">
      <p-select
        [ngModel]="s.companyId()"
        (ngModelChange)="s.selectCompany($event)"
        [options]="s.companyOptions()"
        optionLabel="label"
        optionValue="value"
        placeholder="Company"
        ariaLabel="Company"
      /><p-select
        [ngModel]="s.departmentId()"
        (ngModelChange)="s.departmentId.set($event)"
        [options]="departmentOptions()"
        optionLabel="label"
        optionValue="value"
        placeholder="All departments"
        [showClear]="true"
        ariaLabel="Department"
      /><p-select
        [ngModel]="s.view()"
        (ngModelChange)="s.setView($event)"
        [options]="views"
        optionLabel="label"
        optionValue="value"
        ariaLabel="Hierarchy view"
      /><span class="search"
        ><i class="pi pi-search"></i
        ><input
          [value]="s.search()"
          (input)="onSearch($any($event.target).value)"
          placeholder="Search name, code, title, department"
          aria-label="Search organogram"
      /></span>
      @if (s.search().trim()) {
        <span class="result"
          >{{ s.matches().length ? s.searchIndex() + 1 : 0 }} / {{ s.matches().length }}</span
        ><button aria-label="Previous search result" (click)="s.nextMatch(-1)">
          <i class="pi pi-chevron-up"></i></button
        ><button aria-label="Next search result" (click)="s.nextMatch(1)">
          <i class="pi pi-chevron-down"></i>
        </button>
      }
    </div>
    <div class="actions">
      <label
        ><p-checkbox
          [ngModel]="s.includeVacancies()"
          (ngModelChange)="s.includeVacancies.set($event); s.load(true)"
          [binary]="true"
        />
        Vacancies</label
      ><button aria-label="Expand all" title="Expand all" (click)="s.expandAll()">
        <i class="pi pi-plus-circle"></i></button
      ><button aria-label="Collapse all" title="Collapse all" (click)="s.collapseAll()">
        <i class="pi pi-minus-circle"></i></button
      ><button aria-label="Fit hierarchy to screen" title="Fit to screen" (click)="s.fit()">
        <i class="pi pi-arrows-alt"></i></button
      ><button aria-label="Zoom out" title="Zoom out" (click)="s.zoomBy(-0.1)">
        <i class="pi pi-minus"></i></button
      ><span>{{ (s.zoom() * 100).toFixed(0) }}%</span
      ><button aria-label="Zoom in" title="Zoom in" (click)="s.zoomBy(0.1)">
        <i class="pi pi-plus"></i></button
      ><button aria-label="Toggle fullscreen" title="Fullscreen" (click)="fullscreen.emit()">
        <i class="pi pi-window-maximize"></i>
      </button>
      @if (s.data()?.capabilities?.canEditHierarchy) {
        <p-button
          [label]="s.editMode() ? 'Done editing' : 'Edit hierarchy'"
          [icon]="s.editMode() ? 'pi pi-check' : 'pi pi-pencil'"
          [outlined]="!s.editMode()"
          (onClick)="s.editMode.update((v) => !v)"
        />
        @if (s.undoChange()) {
          <p-button label="Undo" icon="pi pi-undo" [text]="true" (onClick)="s.undo()" />
        }
      }
      <p-button
        label="Export"
        icon="pi pi-download"
        [outlined]="true"
        (onClick)="exportMenu.emit()"
      />
    </div>
  </header>`,
  styles: [
    `
      .toolbar {
        display: flex;
        justify-content: space-between;
        gap: 0.7rem;
        flex-wrap: wrap;
        padding: 0.7rem 1rem;
        border-bottom: 1px solid var(--p-content-border-color);
        background: var(--oms-glass-strong);
      }
      .filters,
      .actions {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        flex-wrap: wrap;
      }
      .filters {
        flex: 1;
      }
      .search {
        position: relative;
        flex: 1;
        min-width: 16rem;
      }
      .search i {
        position: absolute;
        left: 0.7rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--p-text-muted-color);
      }
      .search input {
        width: 100%;
        padding: 0.6rem 0.7rem 0.6rem 2rem;
        border: 1px solid var(--p-content-border-color);
        border-radius: 9px;
        background: var(--oms-input-bg);
        color: var(--p-text-color);
      }
      button {
        min-width: 36px;
        height: 36px;
        border: 1px solid var(--p-content-border-color);
        border-radius: 8px;
        background: transparent;
        color: var(--p-text-color);
        cursor: pointer;
      }
      .actions label {
        display: flex;
        align-items: center;
        gap: 0.3rem;
      }
      .result {
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
      }
      @media (max-width: 800px) {
        .toolbar {
          align-items: stretch;
        }
        .filters,
        .actions {
          width: 100%;
        }
        .search {
          flex-basis: 100%;
        }
        .actions {
          overflow-x: auto;
          flex-wrap: nowrap;
        }
      }
    `,
  ],
})
export class OrganogramToolbar {
  readonly s = inject(OrganogramStore);
  readonly fullscreen = output<void>();
  readonly exportMenu = output<void>();
  readonly views = [
    { label: 'Employee view', value: 'EMPLOYEE' as OrganogramView },
    { label: 'Position view', value: 'POSITION' as OrganogramView },
  ];
  departmentOptions() {
    return this.s.departments().map((d) => ({ label: d.name, value: d.id }));
  }
  onSearch(v: string) {
    this.s.search.set(v);
    this.s.searchIndex.set(0);
    if (v.trim()) this.s.nextMatch(0);
  }
}
