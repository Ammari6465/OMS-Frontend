import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { RippleModule } from 'primeng/ripple';

import { AuthService } from '../../core/services/auth.service';
import { LayoutService } from '../layout.service';
import { NAV_SECTIONS, NavSection } from '../nav-items';
import { ROLE_LABELS } from '../../core/models/enums';
import { OmsStyleService } from '../../core/services/oms-style.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TooltipModule, TagModule, RippleModule],
  template: `
    <aside class="sidebar" [class.collapsed]="collapsed()">
      <!-- Brand Header Bar -->
      <div class="brand" routerLink="/dashboard">
        @if (!collapsed()) {
          <div class="logo-full-wrap">
            <img src="logo.png" alt="Sunrich Companies Logo" class="brand-logo-img" />
            <span class="oms-writing-badge {{ omsStyle.activeOption.badgeClass }}">
              <span class="oms-text">OMS</span>
            </span>
          </div>
        } @else {
          <div class="logo-mark-wrap">
            <img src="logo.png" alt="Sunrich" class="brand-mark-img" />
          </div>
        }
      </div>

      <!-- Navigation Links Feed -->
      <nav class="nav">
        @for (section of visibleSections(); track section.title) {
          <div class="nav-section">
            @if (!collapsed()) {
              <div class="nav-banner-pill">
                <span>{{ section.title }}</span>
              </div>
            }
            @for (item of section.items; track item.route) {
              <a
                class="nav-item"
                [routerLink]="item.route"
                routerLinkActive="active"
                (click)="layout.closeMobile()"
                [pTooltip]="collapsed() ? item.label : ''"
                tooltipPosition="right"
                pRipple
              >
                <i class="nav-icon" [class]="item.icon"></i>
                @if (!collapsed()) {
                  <span class="nav-label">{{ item.label }}</span>
                  <i class="pi pi-chevron-right item-chev"></i>
                }
              </a>
            }
          </div>
        }
      </nav>

      <!-- Bottom User Profile Footer -->
      <div class="sidebar-user-footer">
        <a class="suf-profile" routerLink="/profile" (click)="layout.closeMobile()">
          <div class="suf-avatar-ring">
            <div class="suf-avatar">{{ initials() }}</div>
          </div>
          @if (!collapsed()) {
            <div class="suf-meta">
              <span class="suf-name">{{ user()?.fullName || user()?.username }}</span>
              <span class="suf-role">{{ roleLabel() }}</span>
            </div>
          }
        </a>

        @if (!collapsed()) {
          <div class="suf-quick-actions">
            <a
              class="suf-action-btn"
              routerLink="/profile"
              routerLinkActive="active"
              (click)="layout.closeMobile()"
              pTooltip="My Profile"
              pRipple
            >
              <i class="pi pi-user"></i>
              <span>My Profile</span>
            </a>
            <button
              type="button"
              class="suf-action-btn logout"
              (click)="logout($event)"
              pTooltip="Sign Out"
              pRipple
            >
              <i class="pi pi-power-off"></i>
              <span>Logout</span>
            </button>
          </div>
        }
      </div>
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .sidebar {
        height: 100%;
        display: flex;
        flex-direction: column;
        width: var(--oms-sidebar-width);
        background: var(--oms-sidebar-bg);
        border-right: 1px solid var(--p-content-border-color);
        transition: width var(--oms-transition);
        overflow: hidden;
      }
      .sidebar.collapsed {
        width: var(--oms-sidebar-width-collapsed);
      }

      /* Brand Header */
      .brand {
        display: flex;
        align-items: center;
        height: var(--oms-topbar-height);
        padding: 0 1.1rem;
        border-bottom: 1px solid var(--p-content-border-color);
        cursor: pointer;
        background: transparent;
        transition: background 200ms;
      }
      .brand:hover {
        background: var(--oms-hover-bg);
      }
      .logo-full-wrap {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        gap: 8px;
      }
      .brand-logo-img {
        height: 44px;
        max-width: 165px;
        width: auto;
        filter: drop-shadow(0 2px 8px var(--oms-glow));
        transition: transform 300ms var(--ease-bounce);
      }
      .brand:hover .brand-logo-img {
        transform: scale(1.04);
      }
      .platform-badge {
        font-size: 0.65rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        color: var(--oms-primary);
        background: var(--oms-hover-bg);
        border: 1px solid color-mix(in srgb,var(--oms-primary) 35%,transparent);
        padding: 2px 7px;
        border-radius: 999px;
      }
      .logo-mark-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
      }
      .brand-mark-img {
        width: 36px;
        height: 36px;
        transition: transform 300ms var(--ease-bounce);
      }

      /* Navigation Feed */
      .nav {
        flex: 1;
        overflow-y: auto;
        padding: 0.85rem 0.7rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      .nav-section {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }

      /* Section Banner Pill */
      .nav-banner-pill {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding: 0.35rem 0.7rem;
        margin: 0.45rem 0 0.15rem;
        border-radius: 0;
        background: transparent;
        color: var(--p-text-muted-color);
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        box-shadow: none;
        text-align: left;
      }

      /* Navigation Item (Pill style) */
      .nav-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem 0.85rem;
        border-radius: 12px;
        color: var(--p-text-muted-color);
        cursor: pointer;
        position: relative;
        transition: all 200ms var(--ease-snap);
        border: 1px solid transparent;
      }
      .collapsed .nav-item {
        justify-content: center;
      }
      .nav-item:hover {
        background: var(--oms-hover-bg);
        color: var(--p-text-color);
        border-color: color-mix(in srgb,var(--oms-primary) 25%,transparent);
        transform: translateX(2px);
      }
      .nav-item:hover .nav-icon {
        color: var(--oms-primary);
        transform: scale(1.12);
      }
      .nav-item:hover .item-chev {
        color: var(--oms-primary);
        transform: translateX(2px);
      }

      /* Active Navigation Item */
      .nav-item.active {
        background: var(--oms-hover-bg);
        color: var(--p-text-color);
        font-weight: 700;
        border: 1px var(--oms-border-style) color-mix(in srgb,var(--oms-primary) 32%,transparent);
        box-shadow: inset 3px 0 0 var(--p-primary-color);
      }
      .nav-item.active .nav-icon {
        color: var(--p-primary-color);
      }
      .nav-item.active .item-chev {
        color: var(--p-primary-color);
      }

      .nav-icon {
        font-size: 1.05rem;
        min-width: 1.05rem;
        text-align: center;
        transition: transform 200ms var(--ease-bounce), color 200ms;
      }
      .nav-label {
        flex: 1;
        white-space: nowrap;
        font-size: 0.88rem;
      }
      .item-chev {
        font-size: 0.72rem;
        color: var(--p-text-muted-color);
        transition: transform 200ms var(--ease-bounce), color 200ms;
      }

      /* User Profile Footer (Bottom Pinned) */
      .sidebar-user-footer {
        position: relative;
        z-index: 100;
        padding: 0.85rem 0.75rem 1rem;
        border-top: 1px solid var(--p-content-border-color);
        background: var(--oms-subtle-bg);
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        pointer-events: auto;
      }
      .suf-profile {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        padding: 0.45rem;
        border-radius: 10px;
        transition: background 200ms;
        text-decoration: none;
      }
      .suf-profile:hover {
        background: var(--oms-hover-bg);
      }
      .suf-avatar-ring {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        padding: 2px;
        background: var(--oms-gradient);
        box-shadow: 0 0 12px var(--oms-glow);
        flex-shrink: 0;
      }
      .suf-avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: var(--oms-sidebar-bg);
        color: var(--oms-primary);
        font-weight: 800;
        font-size: 0.9rem;
        display: grid;
        place-items: center;
      }
      .suf-meta {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .suf-name {
        font-size: 0.88rem;
        font-weight: 700;
        color: var(--p-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .suf-role {
        font-size: 0.72rem;
        color: var(--p-text-muted-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .suf-quick-actions {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .suf-action-btn {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.55rem 0.75rem;
        border: none;
        background: transparent;
        color: var(--p-text-muted-color);
        font-weight: 600;
        font-size: 0.84rem;
        border-radius: 8px;
        cursor: pointer;
        transition: all 150ms var(--ease-snap);
        text-decoration: none;
        outline: none;
      }
      .suf-action-btn:hover {
        background: var(--oms-hover-bg);
        color: var(--oms-primary);
        transform: translateX(2px);
      }
      .suf-action-btn.active {
        background: var(--oms-hover-bg);
        color: var(--oms-primary);
      }
      .suf-action-btn.logout:hover {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
        transform: translateX(2px);
      }
    `,
  ],
})
export class Sidebar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly layout = inject(LayoutService);
  readonly omsStyle = inject(OmsStyleService);
  readonly collapsed = this.layout.collapsed;

  readonly user = this.auth.currentUser;
  readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : 'Sunrich Super Admin';
  });
  readonly initials = computed(() => {
    const u = this.user();
    const source = u?.fullName || u?.username || 'SR';
    const parts = source.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  });

  readonly visibleSections = computed<NavSection[]>(() => {
    this.auth.currentUser();
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || this.auth.hasAnyRole(item.roles)),
    })).filter((section) => section.items.length > 0);
  });

  logout(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.auth.logout();
  }
}
