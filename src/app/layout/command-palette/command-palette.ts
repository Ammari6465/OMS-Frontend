import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { OrgDataService } from '../../core/data/org-data.service';
import { Staff } from '../../core/models/organization.model';

interface QuickNavigationItem {
  label: string;
  desc: string;
  path: string;
  icon: string;
  keywords: string;
}

@Component({
  selector: 'app-command-palette',
  imports: [DialogModule, InputTextModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: 'calc(100vw - 2rem)', 'max-width': '680px' }"
      [contentStyle]="{ padding: '0', overflow: 'hidden' }"
      styleClass="command-dialog"
      [showHeader]="false"
      [dismissableMask]="true"
      [draggable]="false"
      (onShow)="focusSearch()"
      (onHide)="resetPalette()"
    >
      <div class="cmd-palette">
        <div class="cmd-header">
          <span class="search-icon-wrap"><i class="pi pi-search"></i></span>
          <input
            #cmdInput
            type="text"
            placeholder="Search people, pages, departments or phone numbers…"
            [value]="query()"
            (input)="onQueryChange($any($event.target).value)"
            (keydown)="onInputKeydown($event)"
            class="cmd-input"
            aria-label="Search the application"
          />
          @if (query()) {
            <button type="button" class="cmd-clear" (click)="clearQuery()" aria-label="Clear search">
              <i class="pi pi-times"></i>
            </button>
          }
          <button type="button" class="cmd-close" (click)="visible.set(false)" aria-label="Close search">
            <span>ESC</span>
            <i class="pi pi-times"></i>
          </button>
        </div>

        <div class="cmd-body">
          @if (filteredStaff().length) {
            <div class="cmd-group-title">
              <span>People</span>
              <span class="result-count">{{ filteredStaff().length }}</span>
            </div>
            @for (staffMember of filteredStaff(); track staffMember.id; let index = $index) {
              <button
                type="button"
                class="cmd-item"
                [class.active]="activeIndex() === index"
                (mouseenter)="activeIndex.set(index)"
                (click)="navigate('/staff')"
              >
                <span class="cmd-item-avatar">{{ initials(staffMember.name) }}</span>
                <span class="cmd-item-info">
                  <span class="cmd-item-title">
                    {{ staffMember.name }}
                    @if (staffMember.title) {
                      <span class="cmd-badge">{{ staffMember.title }}</span>
                    }
                  </span>
                  <span class="cmd-item-sub">
                    {{ org.departmentName(staffMember.deptId) }} ·
                    {{ staffMember.landline || staffMember.cellNumber || staffMember.email || 'No phone' }}
                  </span>
                </span>
                <i class="pi pi-arrow-up-right cmd-chev"></i>
              </button>
            }
          }

          @if (filteredQuickNavs().length) {
            <div class="cmd-group-title" [class.with-spacing]="filteredStaff().length">
              <span>{{ query() ? 'Pages & actions' : 'Quick navigation' }}</span>
              @if (query()) {
                <span class="result-count">{{ filteredQuickNavs().length }}</span>
              }
            </div>
            @for (nav of filteredQuickNavs(); track nav.path; let index = $index) {
              <button
                type="button"
                class="cmd-item"
                [class.active]="activeIndex() === filteredStaff().length + index"
                (mouseenter)="activeIndex.set(filteredStaff().length + index)"
                (click)="navigate(nav.path)"
              >
                <span class="cmd-item-icon"><i [class]="nav.icon"></i></span>
                <span class="cmd-item-info">
                  <span class="cmd-item-title">{{ nav.label }}</span>
                  <span class="cmd-item-sub">{{ nav.desc }}</span>
                </span>
                <i class="pi pi-arrow-right cmd-chev"></i>
              </button>
            }
          }

          @if (query() && !filteredStaff().length && !filteredQuickNavs().length) {
            <div class="cmd-empty" role="status">
              <span class="empty-icon"><i class="pi pi-search"></i></span>
              <span class="empty-title">No results for “{{ query() }}”</span>
              <span class="empty-subtitle">Try a person’s name, department, phone number, or page.</span>
              <button type="button" class="empty-action" (click)="clearQuery()">Clear search</button>
            </div>
          }
        </div>

        <div class="cmd-footer" aria-hidden="true">
          <span class="footer-hint"><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span class="footer-hint"><kbd>Enter</kbd> Open</span>
          <span class="footer-hint"><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </p-dialog>
  `,
  styles: [
    `
      .cmd-palette {
        display: flex;
        flex-direction: column;
        max-height: min(640px, calc(100vh - 3rem));
        background: var(--p-content-background);
        color: var(--p-text-color);
        overflow: hidden;
      }

      .cmd-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: 64px;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--p-content-border-color);
        background: var(--oms-subtle-bg);
      }

      .search-icon-wrap {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        color: var(--p-primary-color);
        background: rgba(15, 139, 253, 0.1);
        flex: 0 0 auto;
      }

      .cmd-input {
        flex: 1;
        min-width: 0;
        border: none !important;
        outline: none !important;
        background: transparent !important;
        color: var(--p-text-color) !important;
        font-size: 0.98rem !important;
        padding: 0 !important;
        box-shadow: none !important;
      }

      .cmd-input::placeholder {
        color: var(--p-text-muted-color);
      }

      .cmd-clear {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--p-text-muted-color);
        cursor: pointer;
      }

      .cmd-clear:hover {
        color: var(--p-text-color);
        background: var(--oms-hover-bg);
      }

      .cmd-close,
      kbd {
        font-family: inherit;
        font-size: 0.65rem;
        font-weight: 700;
        line-height: 1;
        color: var(--p-text-muted-color);
        background: var(--oms-elevated-bg);
        border: 1px solid var(--p-content-border-color);
        box-shadow: 0 1px 1px rgba(15, 23, 42, 0.08);
      }

      .cmd-close {
        padding: 0.35rem 0.45rem;
        border-radius: 6px;
        cursor: pointer;
      }

      .cmd-close i {
        display: none;
      }

      .cmd-close:hover {
        color: var(--p-text-color);
        border-color: color-mix(in srgb, var(--p-primary-color) 35%, var(--p-content-border-color));
      }

      .cmd-body {
        flex: 1;
        min-height: 210px;
        max-height: 480px;
        overflow-y: auto;
        padding: 0.9rem;
      }

      .cmd-group-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.25rem 0.65rem 0.45rem;
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.09em;
        color: var(--p-text-muted-color);
      }

      .cmd-group-title.with-spacing {
        margin-top: 0.8rem;
        padding-top: 0.7rem;
        border-top: 1px solid var(--p-content-border-color);
      }

      .result-count {
        min-width: 22px;
        height: 20px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        color: var(--p-primary-color);
        background: rgba(15, 139, 253, 0.1);
      }

      .cmd-item {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 0.72rem 0.75rem;
        border: 1px solid transparent;
        border-radius: 12px;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
        transition: background 150ms, border-color 150ms, transform 150ms;
      }

      .cmd-item:hover,
      .cmd-item.active {
        background: var(--oms-hover-bg);
        border-color: color-mix(in srgb, var(--p-primary-color) 28%, transparent);
      }

      .cmd-item.active {
        box-shadow: inset 3px 0 0 var(--p-primary-color);
      }

      .cmd-item-avatar,
      .cmd-item-icon {
        width: 38px;
        height: 38px;
        flex: 0 0 auto;
        border-radius: 10px;
        display: grid;
        place-items: center;
      }

      .cmd-item-avatar {
        border-radius: 50%;
        background: linear-gradient(135deg, var(--p-primary-color), #38bdf8);
        color: #ffffff;
        font-size: 0.78rem;
        font-weight: 800;
        box-shadow: 0 4px 12px rgba(15, 139, 253, 0.2);
      }

      .cmd-item-icon {
        color: var(--p-primary-color);
        background: rgba(15, 139, 253, 0.1);
      }

      .cmd-item-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }

      .cmd-item-title {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--p-text-color);
      }

      .cmd-badge {
        margin-left: 0.35rem;
        font-size: 0.7rem;
        color: var(--p-text-muted-color);
        font-weight: 500;
      }

      .cmd-item-sub {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.78rem;
        color: var(--p-text-muted-color);
      }

      .cmd-chev {
        color: var(--p-text-muted-color);
        font-size: 0.75rem;
        transition: color 150ms, transform 150ms;
      }

      .cmd-item:hover .cmd-chev,
      .cmd-item.active .cmd-chev {
        color: var(--p-primary-color);
        transform: translateX(2px);
      }

      .cmd-empty {
        min-height: 260px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem 1rem;
        text-align: center;
      }

      .empty-icon {
        width: 54px;
        height: 54px;
        display: grid;
        place-items: center;
        margin-bottom: 1rem;
        border-radius: 16px;
        color: var(--p-primary-color);
        background: rgba(15, 139, 253, 0.1);
        font-size: 1.15rem;
      }

      .empty-title {
        margin-bottom: 0.25rem;
        color: var(--p-text-color);
        font-size: 1rem;
        font-weight: 750;
      }

      .empty-subtitle {
        color: var(--p-text-muted-color);
        font-size: 0.82rem;
      }

      .empty-action {
        margin-top: 1rem;
        padding: 0.5rem 0.85rem;
        border: 1px solid var(--p-content-border-color);
        border-radius: 9px;
        background: var(--oms-subtle-bg);
        color: var(--p-text-color);
        font-weight: 700;
        cursor: pointer;
      }

      .empty-action:hover {
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
      }

      .cmd-footer {
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 1rem;
        padding: 0.55rem 1rem;
        border-top: 1px solid var(--p-content-border-color);
        background: var(--oms-subtle-bg);
      }

      .footer-hint {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        color: var(--p-text-muted-color);
        font-size: 0.68rem;
      }

      kbd {
        min-width: 22px;
        padding: 0.25rem 0.35rem;
        border-radius: 5px;
        text-align: center;
      }

      @media (max-width: 640px) {
        .cmd-palette {
          max-height: calc(100vh - 1.5rem);
        }

        .cmd-header {
          min-height: 58px;
          padding: 0.65rem 0.75rem;
        }

        .search-icon-wrap {
          width: 32px;
          height: 32px;
        }

        .cmd-item-sub,
        .cmd-footer {
          display: none;
        }

        .cmd-close {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          padding: 0;
          border-radius: 8px;
        }

        .cmd-close span {
          display: none;
        }

        .cmd-close i {
          display: block;
          font-size: 0.8rem;
        }

        .cmd-body {
          padding: 0.65rem;
        }

        .cmd-item {
          padding: 0.65rem;
        }
      }
    `,
  ],
})
export class CommandPalette {
  private readonly router = inject(Router);
  readonly org = inject(OrgDataService);

  @ViewChild('cmdInput') private cmdInput?: ElementRef<HTMLInputElement>;

  readonly visible = signal(false);
  readonly query = signal('');
  readonly activeIndex = signal(0);

  readonly quickNavs = signal<QuickNavigationItem[]>([
    {
      label: 'Organogram Tree Viewer',
      desc: 'Explore company hierarchy and reporting lines',
      path: '/organogram',
      icon: 'pi pi-sitemap',
      keywords: 'chart structure hierarchy reporting tree',
    },
    {
      label: 'Staff Directory',
      desc: 'Find staff, contact details and employee records',
      path: '/staff',
      icon: 'pi pi-users',
      keywords: 'people employees phone contacts directory',
    },
    {
      label: 'Departments',
      desc: 'Manage departments and organisational teams',
      path: '/departments',
      icon: 'pi pi-building',
      keywords: 'teams divisions organisation management',
    },
    {
      label: 'Open Vacancies',
      desc: 'Review and manage open corporate positions',
      path: '/vacancies',
      icon: 'pi pi-briefcase',
      keywords: 'jobs recruitment roles hiring positions',
    },
    {
      label: 'System Settings',
      desc: 'Configure appearance, notifications and access',
      path: '/settings',
      icon: 'pi pi-cog',
      keywords: 'theme preferences security permissions configure',
    },
  ]);

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.visible()) {
        this.visible.set(false);
      } else {
        this.resetPalette();
        this.visible.set(true);
      }
    }
  }

  filteredStaff(): Staff[] {
    const searchTerm = this.normalizedQuery();
    if (!searchTerm) return [];

    return this.org.staff.snapshot()
      .filter((staffMember) =>
        [
          staffMember.name,
          staffMember.title,
          staffMember.landline,
          staffMember.cellNumber,
          staffMember.email,
          this.org.departmentName(staffMember.deptId),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchTerm)),
      )
      .slice(0, 6);
  }

  filteredQuickNavs(): QuickNavigationItem[] {
    const searchTerm = this.normalizedQuery();
    if (!searchTerm) return this.quickNavs();

    return this.quickNavs().filter((nav) =>
      `${nav.label} ${nav.desc} ${nav.keywords}`.toLowerCase().includes(searchTerm),
    );
  }

  onQueryChange(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.visible.set(false);
      return;
    }

    const resultCount = this.filteredStaff().length + this.filteredQuickNavs().length;
    if (!resultCount) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((index) => (index + 1) % resultCount);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((index) => (index - 1 + resultCount) % resultCount);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const staffCount = this.filteredStaff().length;
      const selectedIndex = this.activeIndex();
      if (selectedIndex < staffCount) {
        this.navigate('/staff');
      } else {
        const navigationItem = this.filteredQuickNavs()[selectedIndex - staffCount];
        if (navigationItem) this.navigate(navigationItem.path);
      }
    }
  }

  clearQuery(): void {
    this.query.set('');
    this.activeIndex.set(0);
    this.focusSearch();
  }

  focusSearch(): void {
    window.setTimeout(() => this.cmdInput?.nativeElement.focus(), 0);
  }

  resetPalette(): void {
    this.query.set('');
    this.activeIndex.set(0);
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  navigate(path: string): void {
    this.visible.set(false);
    this.router.navigateByUrl(path);
  }

  private normalizedQuery(): string {
    return this.query().trim().toLowerCase();
  }
}
