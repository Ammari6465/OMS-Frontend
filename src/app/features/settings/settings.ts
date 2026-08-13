import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';

import { ThemeService } from '../../core/services/theme.service';
import { OmsStyleService } from '../../core/services/oms-style.service';
import { ROLE_LABELS, Role } from '../../core/models/enums';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api.model';

interface Pref {
  key: string;
  label: string;
  desc: string;
  value: boolean;
}

interface SettingRecord {
  id: number;
  kind: 'notification-preferences' | 'password-reset-roles';
  values: Record<string, boolean>;
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule, CardModule, ButtonModule, ToggleSwitchModule],
  template: `
    <div class="oms-page">
      <div class="oms-page-header">
        <div>
          <h1 class="oms-page-title">Settings</h1>
          <p class="oms-page-subtitle">Configure appearance, notifications and access policy.</p>
        </div>
      </div>

      <div class="grid">
        <!-- Appearance -->
        <div class="col-12 lg:col-6">
          <p-card>
            <div class="set-head"><i class="pi pi-palette"></i><h3>Appearance & Branding</h3></div>
            <div class="set-row">
              <div>
                <div class="set-label">Dark mode</div>
                <div class="set-desc">Use the dark theme across the application.</div>
              </div>
              <p-toggleswitch [ngModel]="theme.mode() === 'dark'" (ngModelChange)="onTheme($event)" />
            </div>

            <div class="mt-4 pt-3 border-top-1 surface-border">
              <div class="set-label mb-2">OMS Writing & Typography Style</div>
              <div class="set-desc mb-3">Select how the "OMS" brand badge is styled across topbar, sidebar, and headers:</div>

              <div class="grid gap-2">
                @for (s of omsStyle.styles; track s.id) {
                  <div
                    class="col-12 sm:col-6 cursor-pointer p-2 border-round-lg flex align-items-center justify-content-between"
                    [style.background]="omsStyle.currentStyle() === s.id ? 'rgba(15, 139, 253, 0.12)' : 'rgba(255, 255, 255, 0.03)'"
                    [style.border]="omsStyle.currentStyle() === s.id ? '1.5px solid #0f8bfd' : '1px solid rgba(255, 255, 255, 0.08)'"
                    (click)="omsStyle.setStyle(s.id)"
                  >
                    <div class="flex align-items-center gap-2">
                      <span class="oms-writing-badge {{ s.badgeClass }}">
                        <span class="oms-text">OMS</span>
                      </span>
                      <div>
                        <div class="font-semibold text-sm">{{ s.name }}</div>
                        <div class="text-xs text-400">{{ s.font }}</div>
                      </div>
                    </div>
                    @if (omsStyle.currentStyle() === s.id) {
                      <i class="pi pi-check-circle text-primary text-lg"></i>
                    }
                  </div>
                }
              </div>
            </div>
          </p-card>
        </div>

        <!-- Notifications -->
        <div class="col-12 lg:col-6">
          <p-card>
            <div class="set-head"><i class="pi pi-bell"></i><h3>Notification preferences</h3></div>
            @for (p of prefs(); track p.key) {
              <div class="set-row">
                <div>
                  <div class="set-label">{{ p.label }}</div>
                  <div class="set-desc">{{ p.desc }}</div>
                </div>
                <p-toggleswitch [ngModel]="p.value" (ngModelChange)="togglePref(p.key, $event)" />
              </div>
            }
          </p-card>
        </div>

        <!-- Security / access policy -->
        <div class="col-12">
          <p-card>
            <div class="set-head"><i class="pi pi-shield"></i><h3>Password reset permission</h3></div>
            <p class="policy-note">
              Choose which roles may force a password reset on behalf of another user (SRS 4.3). Self-service reset via
              email remains available to everyone.
            </p>
            <div class="policy-grid">
              @for (r of resetRoles(); track r.role) {
                <div class="policy-item">
                  <div>
                    <div class="set-label">{{ label(r.role) }}</div>
                    <div class="set-desc">{{ r.role }}</div>
                  </div>
                  <p-toggleswitch [ngModel]="r.allowed" (ngModelChange)="toggleReset(r.role, $event)"
                    [disabled]="r.role === 'SUPER_ADMIN'" />
                </div>
              }
            </div>
          </p-card>
        </div>

        <!-- About -->
        <div class="col-12">
          <p-card>
            <div class="set-head"><i class="pi pi-info-circle"></i><h3>About</h3></div>
            <div class="about-grid">
              <div><span>Application</span><strong>Organogram Management System</strong></div>
              <div><span>Version</span><strong>1.0.0</strong></div>
              <div><span>Client</span><strong>Sunrich Group</strong></div>
              <div><span>Frontend</span><strong>Angular 21 LTS · PrimeNG 21</strong></div>
            </div>
          </p-card>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .set-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.1rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--p-content-border-color); }
      .set-head i { color: var(--p-primary-color); font-size: 1.1rem; }
      .set-head h3 { margin: 0; font-size: 1.05rem; }
      .set-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 0; }
      .set-row + .set-row { border-top: 1px solid var(--p-content-border-color); }
      .set-label { font-weight: 600; color: var(--p-text-color); }
      .set-desc { font-size: 0.82rem; color: var(--p-text-muted-color); margin-top: 0.15rem; }
      .policy-note { color: var(--p-text-muted-color); font-size: 0.87rem; margin: 0 0 1rem; max-width: 60ch; }
      .policy-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.75rem; }
      .policy-item { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.85rem 1rem; border: 1px solid var(--p-content-border-color); border-radius: 10px; }
      .about-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
      .about-grid > div { display: flex; flex-direction: column; gap: 0.2rem; }
      .about-grid span { font-size: 0.8rem; color: var(--p-text-muted-color); }
      .about-grid strong { color: var(--p-text-color); }
    `,
  ],
})
export class Settings {
  readonly theme = inject(ThemeService);
  readonly omsStyle = inject(OmsStyleService);
  private readonly messages = inject(MessageService);
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/records/settings`;
  private preferenceRecordId: number | null = null;
  private resetRoleRecordId: number | null = null;

  readonly prefs = signal<Pref[]>(this.defaultPrefs());
  readonly resetRoles = signal(this.defaultResetRoles());

  constructor() {
    this.http.get<ApiResponse<SettingRecord[]>>(this.endpoint).subscribe((response) => {
      const preferences = response.data.find((record) => record.kind === 'notification-preferences');
      const roles = response.data.find((record) => record.kind === 'password-reset-roles');
      if (preferences) {
        this.preferenceRecordId = preferences.id;
        this.prefs.update((items) => items.map((item) => ({ ...item, value: preferences.values[item.key] ?? item.value })));
        localStorage.removeItem('oms.settings.prefs');
      } else {
        const legacy = this.readLegacy('oms.settings.prefs');
        if (legacy) {
          this.prefs.update((items) => items.map((item) => ({ ...item, value: legacy[item.key] ?? item.value })));
          this.saveSetting('notification-preferences', legacy, null, (id) => {
            this.preferenceRecordId = id;
            localStorage.removeItem('oms.settings.prefs');
          });
        }
      }
      if (roles) {
        this.resetRoleRecordId = roles.id;
        this.resetRoles.update((items) => items.map((item) => ({ ...item, allowed: roles.values[item.role] ?? item.allowed })));
        localStorage.removeItem('oms.settings.pwdResetRoles');
      } else {
        const legacy = this.readLegacy('oms.settings.pwdResetRoles');
        if (legacy) {
          this.resetRoles.update((items) => items.map((item) => ({ ...item, allowed: legacy[item.role] ?? item.allowed })));
          this.saveSetting('password-reset-roles', legacy, null, (id) => {
            this.resetRoleRecordId = id;
            localStorage.removeItem('oms.settings.pwdResetRoles');
          });
        }
      }
    });
  }

  private defaultPrefs(): Pref[] {
    return [
      { key: 'onboarding', label: 'New joiner alerts', desc: 'Notify HR and the new manager when staff are onboarded.', value: true },
      { key: 'exits', label: 'Staff exit alerts', desc: 'Notify when a staff member leaves the organisation.', value: true },
      { key: 'transfers', label: 'Transfer & promotion alerts', desc: 'Notify on department/company transfers and title changes.', value: true },
      { key: 'vacancies', label: 'Vacancy alerts', desc: 'Notify when positions are opened or closed.', value: false },
    ];
  }

  private defaultResetRoles() {
    const defaults: Record<string, boolean> = { SUPER_ADMIN: true, COMPANY_ADMIN: true, MANAGER: false, STAFF: false, READ_ONLY: false };
    return Object.values(Role).map((role) => ({ role, allowed: defaults[role] ?? false }));
  }

  label(r: Role): string { return ROLE_LABELS[r]; }

  onTheme(dark: boolean): void {
    if ((this.theme.mode() === 'dark') !== dark) this.theme.toggle();
  }

  togglePref(key: string, value: boolean): void {
    this.prefs.update((list) => list.map((p) => (p.key === key ? { ...p, value } : p)));
    const map = Object.fromEntries(this.prefs().map((p) => [p.key, p.value]));
    this.saveSetting('notification-preferences', map, this.preferenceRecordId, (id) => this.preferenceRecordId = id);
  }

  toggleReset(role: Role, allowed: boolean): void {
    this.resetRoles.update((list) => list.map((r) => (r.role === role ? { ...r, allowed } : r)));
    const map = Object.fromEntries(this.resetRoles().map((r) => [r.role, r.allowed]));
    this.saveSetting('password-reset-roles', map, this.resetRoleRecordId, (id) => this.resetRoleRecordId = id,
      `Access policy updated · ${ROLE_LABELS[role]}: ${allowed ? 'allowed' : 'denied'}`);
  }

  private saveSetting(
    kind: SettingRecord['kind'],
    values: Record<string, boolean>,
    id: number | null,
    rememberId: (id: number) => void,
    message = 'Preferences saved',
  ): void {
    const request = id == null
      ? this.http.post<ApiResponse<SettingRecord>>(this.endpoint, { kind, values })
      : this.http.put<ApiResponse<SettingRecord>>(`${this.endpoint}/${id}`, { kind, values });
    request.subscribe((response) => {
      rememberId(response.data.id);
      this.messages.add({ severity: 'success', summary: message });
    });
  }

  private readLegacy(key: string): Record<string, boolean> | null {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Record<string, boolean> | null;
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }
}
