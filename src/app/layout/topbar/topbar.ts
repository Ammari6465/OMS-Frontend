import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { BadgeModule } from 'primeng/badge';
import { TooltipModule } from 'primeng/tooltip';
import { RippleModule } from 'primeng/ripple';
import { DialogModule } from 'primeng/dialog';

import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/data/notification.service';
import { LayoutService } from '../layout.service';
import { OmsStyleService, OmsStyleId } from '../../core/services/oms-style.service';

@Component({
  selector: 'app-topbar',
  imports: [
    RouterLink,
    ButtonModule,
    BadgeModule,
    TooltipModule,
    RippleModule,
    DialogModule,
  ],
  template: `
    <header class="topbar">
      <div class="topbar-left">
        <button
          type="button"
          class="icon-btn"
          (click)="onToggle()"
          pRipple
          pTooltip="Toggle menu"
          tooltipPosition="bottom"
          aria-label="Toggle navigation"
        >
          <i class="pi pi-bars"></i>
        </button>
        <div class="brand-group">
          <a routerLink="/dashboard" class="topbar-brand">
            <img src="logo.png" alt="Sunrich Companies Logo" class="topbar-logo-img" />
          </a>
          <span
            class="oms-writing-badge {{ omsStyle.activeOption.badgeClass }}"
            (click)="showStyleModal.set(true)"
            pRipple
            pTooltip="Click to customize OMS Writing Style"
            tooltipPosition="bottom"
          >
            <span class="oms-text">OMS</span>
          </span>
        </div>
      </div>

      <div class="topbar-search">
        <i class="pi pi-search search-icon"></i>
        <input
          type="text"
          placeholder="Search staff, departments, companies…"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          (keyup.enter)="search()"
          aria-label="Global search"
        />
        <span class="search-kbd">Ctrl K</span>
      </div>

      <div class="topbar-right">
        <button
          type="button"
          class="icon-btn style-picker-btn"
          (click)="showStyleModal.set(true)"
          pRipple
          pTooltip="Customize OMS Writing Style"
          tooltipPosition="bottom"
          aria-label="Customize OMS writing style"
        >
          <i class="pi pi-palette"></i>
        </button>

        <button
          type="button"
          class="icon-btn notif-btn"
          pRipple
          pTooltip="Notifications"
          tooltipPosition="bottom"
          aria-label="Notifications"
          [attr.aria-expanded]="notificationOpen()"
          (click)="notificationOpen.update(v => !v)"
        >
          <i class="pi pi-bell"></i>
          @if (notify.unread()) {
            <span style="position:absolute;top:3px;right:3px;min-width:16px;height:16px;padding:0 4px;border-radius:9px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center;line-height:1;box-shadow:0 0 0 2px var(--p-content-background);">{{ notify.unread() > 9 ? '9+' : notify.unread() }}</span>
          }
        </button>
        @if (notificationOpen()) {
          <div class="notification-popover" role="dialog" aria-label="Recent notifications">
            <div class="popover-head"><strong>Notifications</strong><button (click)="notify.markAllRead()" [disabled]="!notify.unread()">Mark all read</button></div>
            <div class="popover-list">
              @for (n of notify.items(); track n.id) {
                <button class="popover-item" [class.unread]="!n.isRead" (click)="openNotification(n)">
                  <span class="popover-icon" [style.color]="n.color"><i [class]="n.icon"></i></span>
                  <span><strong>{{ n.title }}</strong><small>{{ n.message }}</small></span>@if (!n.isRead) { <i class="unread-dot"></i> }
                </button>
              } @empty { <div class="popover-empty"><i class="pi pi-check-circle"></i><span>You're all caught up</span></div> }
            </div>
            <a routerLink="/notifications" (click)="notificationOpen.set(false)" class="view-all">View all notifications</a>
          </div>
        }
      </div>
    </header>

    <!-- OMS Writing Style Customizer Modal -->
    <p-dialog
      header="Select OMS Writing Style"
      [(visible)]="showStyleModal"
      [modal]="true"
      [style]="{ width: '92%', 'max-width': '520px' }"
      [dismissableMask]="true"
      [draggable]="false"
    >
      <div class="style-modal-content">
        <p class="modal-desc">
          Choose your preferred typography and visual writing style for <strong>OMS</strong> across the application:
        </p>

        <div class="style-options-grid">
          @for (option of omsStyle.styles; track option.id) {
            <div
              class="style-card"
              [class.selected]="omsStyle.currentStyle() === option.id"
              (click)="selectStyle(option.id)"
              pRipple
            >
              <div class="style-card-header">
                <span class="oms-writing-badge {{ option.badgeClass }}">
                  <span class="oms-text">OMS</span>
                </span>
                <span class="font-tag">{{ option.font }}</span>
              </div>
              <div class="style-card-body">
                <div class="style-name">{{ option.name }}</div>
                <div class="style-desc">{{ option.description }}</div>
              </div>
              @if (omsStyle.currentStyle() === option.id) {
                <div class="active-check">
                  <i class="pi pi-check-circle"></i>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </p-dialog>
  `,
  styles: [
    `
      .topbar {
        height: var(--oms-topbar-height);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 1.25rem;
        background: var(--oms-topbar-bg);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border-bottom: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.09));
        position: relative;
        z-index: 300;
      }
      .topbar-left,
      .topbar-right {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .brand-group {
        display: none;
        align-items: center;
        gap: 0.75rem;
        margin-left: 0.5rem;
      }
      .topbar-brand {
        display: flex;
        align-items: center;
        cursor: pointer;
      }
      .topbar-logo-img {
        height: 44px;
        width: auto;
        filter: drop-shadow(0 2px 6px rgba(15, 139, 253, 0.35));
        transition: transform 300ms var(--ease-bounce);
      }
      .topbar-brand:hover .topbar-logo-img {
        transform: scale(1.05);
      }

      .topbar-search {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        flex: 1;
        max-width: 520px;
        margin: 0 1.5rem;
        padding: 0 0.9rem;
        height: 40px;
        border-radius: 12px;
        background: var(--oms-input-bg);
        border: 1px solid var(--p-content-border-color);
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
        transition: all 200ms var(--ease-snap);
      }
      .topbar-search:focus-within {
        border-color: #0f8bfd;
        background: var(--oms-input-bg);
        box-shadow: var(--oms-focus-ring);
      }
      .topbar-search .search-icon {
        color: var(--p-text-muted-color);
        font-size: 0.9rem;
        transition: color 200ms;
      }
      .topbar-search:focus-within .search-icon {
        color: #0f8bfd;
      }
      .topbar-search input {
        flex: 1;
        border: none !important;
        outline: none;
        background: transparent !important;
        color: var(--p-text-color);
        font-size: 0.88rem;
        min-width: 0;
        padding: 0 !important;
        box-shadow: none !important;
      }
      .search-kbd {
        font-size: 0.67rem;
        font-weight: 700;
        font-family: monospace;
        background: var(--oms-subtle-bg);
        border: 1px solid var(--p-content-border-color);
        padding: 2px 6px;
        border-radius: 4px;
        color: var(--p-text-muted-color);
      }
      @media (max-width: 991px) {
        .brand-group {
          display: flex;
        }

        .topbar-search {
          display: none;
        }
      }

      .icon-btn {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border: 1px solid var(--p-content-border-color);
        border-radius: 10px;
        background: var(--oms-subtle-bg);
        color: var(--p-text-color);
        cursor: pointer;
        font-size: 1.05rem;
        transition: all 200ms var(--ease-snap);
        position: relative;
      }
      .icon-btn:hover {
        background: rgba(15, 139, 253, 0.14);
        color: #0f8bfd;
        border-color: rgba(15, 139, 253, 0.35);
        transform: translateY(-2px);
      }

      .notif-btn:hover i {
        animation: bell-wiggle 600ms ease;
      }
      .notification-popover{position:absolute;right:1.25rem;top:calc(100% - 2px);width:min(390px,calc(100vw - 1rem));background:var(--p-content-background);border:1px solid var(--p-content-border-color);border-radius:14px;box-shadow:0 18px 45px rgba(0,0,0,.25);overflow:hidden;z-index:500}.popover-head{display:flex;justify-content:space-between;align-items:center;padding:.85rem 1rem;border-bottom:1px solid var(--p-content-border-color)}.popover-head button{border:0;background:transparent;color:var(--p-primary-color);cursor:pointer}.popover-head button:disabled{opacity:.45}.popover-list{max-height:410px;overflow:auto}.popover-item{width:100%;display:flex;text-align:left;align-items:flex-start;gap:.7rem;border:0;background:transparent;color:var(--p-text-color);padding:.8rem 1rem;cursor:pointer}.popover-item:hover{background:var(--oms-hover-bg)}.popover-item.unread{background:color-mix(in srgb,var(--p-primary-color) 7%,transparent)}.popover-item>span:nth-child(2){flex:1;min-width:0}.popover-item strong,.popover-item small{display:block}.popover-item small{margin-top:.18rem;color:var(--p-text-muted-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.popover-icon{margin-top:.15rem}.unread-dot{width:8px;height:8px;background:var(--p-primary-color);border-radius:50%;flex:none;margin-top:.35rem}.view-all{display:block;padding:.75rem;text-align:center;border-top:1px solid var(--p-content-border-color);color:var(--p-primary-color);text-decoration:none}.popover-empty{padding:2rem;display:flex;flex-direction:column;align-items:center;gap:.5rem;color:var(--p-text-muted-color)}

      /* Style modal styles */
      .style-modal-content {
        padding: 0.5rem 0;
      }
      .modal-desc {
        color: var(--p-text-muted-color);
        font-size: 0.88rem;
        margin: 0 0 1.25rem;
        line-height: 1.5;
      }
      .style-options-grid {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .style-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.85rem 1.1rem;
        border-radius: 12px;
        background: var(--oms-subtle-bg);
        border: 1px solid var(--p-content-border-color);
        cursor: pointer;
        transition: all 200ms var(--ease-snap);
        position: relative;
      }
      .style-card:hover {
        background: var(--oms-hover-bg);
        border-color: rgba(15, 139, 253, 0.4);
        transform: translateX(4px);
      }
      .style-card.selected {
        background: rgba(15, 139, 253, 0.12);
        border-color: #0f8bfd;
        box-shadow: 0 4px 16px rgba(15, 139, 253, 0.25);
      }
      .style-card-header {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.3rem;
        min-width: 120px;
      }
      .font-tag {
        font-size: 0.68rem;
        font-family: monospace;
        color: var(--p-text-muted-color);
        background: var(--oms-elevated-bg);
        padding: 1px 6px;
        border-radius: 4px;
      }
      .style-card-body {
        flex: 1;
        padding: 0 1rem;
      }
      .style-name {
        font-weight: 700;
        font-size: 0.92rem;
        color: var(--p-text-color);
        margin-bottom: 2px;
      }
      .style-desc {
        font-size: 0.78rem;
        color: var(--p-text-muted-color);
        line-height: 1.35;
      }
      .active-check {
        color: #0f8bfd;
        font-size: 1.3rem;
      }

      @media (max-width: 640px) {
        .brand-group span {
          display: none;
        }
      }
    `,
  ],
})
export class Topbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly layout = inject(LayoutService);
  readonly notify = inject(NotificationService);
  readonly omsStyle = inject(OmsStyleService);

  readonly query = signal('');
  readonly showStyleModal = signal(false);
  readonly notificationOpen = signal(false);

  openNotification(notification: import('../../core/models/system.model').AppNotification): void {
    const link = this.notify.open(notification);
    this.notificationOpen.set(false);
    void this.router.navigateByUrl(link ?? '/notifications');
  }

  onToggle(): void {
    if (window.innerWidth <= 991) {
      this.layout.toggleMobile();
    } else {
      this.layout.toggleCollapsed();
    }
  }

  search(): void {
    const q = this.query().trim();
    if (!q) return;
    this.router.navigate(['/staff'], { queryParams: { q } });
  }

  selectStyle(styleId: OmsStyleId): void {
    this.omsStyle.setStyle(styleId);
    this.showStyleModal.set(false);
  }
}
