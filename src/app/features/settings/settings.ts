import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, VERSION, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { OmsStyleService } from '../../core/services/oms-style.service';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api.model';

interface NotificationRule {
  key: 'onboarding' | 'exits' | 'transfers' | 'vacancies';
  label: string;
  desc: string;
  icon: string;
  value: boolean;
}

interface SettingRecord {
  id: number;
  kind: 'notification-preferences';
  values: Record<string, boolean>;
  updatedAt?: string;
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule, CardModule, ButtonModule, ToggleSwitchModule],
  template: `
    <div class="oms-page settings-page">
      <div class="oms-page-header settings-header">
        <div>
          <span class="eyebrow"><i class="pi pi-cog"></i> Administration</span>
          <h1 class="oms-page-title">Settings</h1>
          <p class="oms-page-subtitle">Manage your workspace appearance, system events, security policy and deployment information.</p>
        </div>
        <span class="admin-badge"><i class="pi pi-shield"></i> Super Admin</span>
      </div>

      <!-- My preferences -->
      <section class="settings-section" aria-labelledby="preferences-heading">
        <div class="section-title">
          <div><span>Personal</span><h2 id="preferences-heading">My Preferences</h2></div>
          <p>Saved in this browser and applied immediately.</p>
        </div>
        <div class="grid">
          <div class="col-12">
            <p-card styleClass="settings-card h-full">
              <div class="card-heading"><span class="heading-icon"><i class="pi pi-palette"></i></span><div><h3>Application theme</h3><p>Changes colors, typography and visual effects across the workspace.</p></div></div>
              <div class="theme-grid">
                @for (style of omsStyle.styles; track style.id) {
                  <button type="button" class="theme-option" [class.selected]="omsStyle.currentStyle() === style.id"
                    (click)="omsStyle.setStyle(style.id)" (mouseenter)="omsStyle.preview(style.id)" (mouseleave)="omsStyle.endPreview()"
                    (focus)="omsStyle.preview(style.id)" (blur)="omsStyle.endPreview()" [attr.aria-pressed]="omsStyle.currentStyle() === style.id">
                    <span class="oms-writing-badge {{ style.badgeClass }}"><span class="oms-text">OMS</span></span>
                    <span class="theme-copy"><strong>{{ style.name }}</strong><small>{{ style.font }}</small></span>
                    @if (omsStyle.currentStyle() === style.id) { <i class="pi pi-check-circle"></i> }
                  </button>
                }
              </div>
            </p-card>
          </div>
        </div>
      </section>

      <!-- System notification rules -->
      <section class="settings-section" aria-labelledby="notifications-heading">
        <div class="section-title">
          <div><span>Workspace</span><h2 id="notifications-heading">System Notification Rules</h2></div>
          <div class="save-state" [class.error]="loadError()">
            @if (loading()) { <i class="pi pi-spin pi-spinner"></i> Loading rules }
            @else if (saving()) { <i class="pi pi-spin pi-spinner"></i> Saving changes }
            @else if (loadError()) { <i class="pi pi-exclamation-circle"></i> Rules unavailable }
            @else { <i class="pi pi-check-circle"></i> Saved }
          </div>
        </div>
        <p-card styleClass="settings-card">
          @if (loadError()) {
            <div class="load-error" role="alert">
              <span><i class="pi pi-wifi"></i><span><strong>Unable to load system rules</strong><small>{{ loadError() }}</small></span></span>
              <p-button label="Try again" icon="pi pi-refresh" [outlined]="true" size="small" (onClick)="loadSettings()" />
            </div>
          }
          <div class="rules-grid" [class.disabled]="loading() || saving() || !!loadError()">
            @for (rule of rules(); track rule.key) {
              <div class="rule-item">
                <span class="rule-icon"><i [class]="rule.icon"></i></span>
                <div class="rule-copy"><strong>{{ rule.label }}</strong><small>{{ rule.desc }}</small><span>In-app events</span></div>
                <p-toggleswitch [ngModel]="rule.value" (ngModelChange)="toggleRule(rule.key, $event)"
                  [disabled]="loading() || saving() || !!loadError()" [attr.aria-label]="'Toggle ' + rule.label" />
              </div>
            }
          </div>
          <p class="rules-note"><i class="pi pi-info-circle"></i> Security and account notifications are always delivered and cannot be disabled.</p>
        </p-card>
      </section>

      <!-- Fixed secure policy -->
      <section class="settings-section" aria-labelledby="security-heading">
        <div class="section-title">
          <div><span>Access control</span><h2 id="security-heading">Security Policy</h2></div>
          <span class="policy-badge"><i class="pi pi-lock"></i> Enforced by API</span>
        </div>
        <p-card styleClass="settings-card">
          <div class="security-intro">
            <span class="security-mark"><i class="pi pi-key"></i></span>
            <div><h3>Administrative password-reset links</h3><p>Administrators may send a one-time, expiring reset link. Passwords are never exposed or directly changed by an administrator.</p></div>
          </div>
          <div class="policy-grid">
            @for (policy of securityPolicy; track policy.role) {
              <div class="policy-item" [class.allowed]="policy.allowed">
                <i [class]="policy.allowed ? 'pi pi-check-circle' : 'pi pi-lock'"></i>
                <div><strong>{{ policy.role }}</strong><small>{{ policy.scope }}</small></div>
                <span>{{ policy.allowed ? 'Allowed' : 'Denied' }}</span>
              </div>
            }
          </div>
          <p class="rules-note"><i class="pi pi-envelope"></i> Self-service password reset by email remains available to every active user.</p>
        </p-card>
      </section>

      <!-- System information -->
      <section class="settings-section" aria-labelledby="system-heading">
        <div class="section-title"><div><span>Deployment</span><h2 id="system-heading">System Information</h2></div></div>
        <p-card styleClass="settings-card">
          <div class="system-grid">
            <div><span>Application</span><strong>{{ environment.appName }}</strong></div>
            <div><span>Version</span><strong>{{ environment.appVersion }}</strong></div>
            <div><span>Angular</span><strong>{{ angularVersion }}</strong></div>
            <div><span>Environment</span><strong>{{ environment.production ? 'Production' : 'Development' }}</strong></div>
            <div><span>API host</span><strong>{{ apiHost }}</strong></div>
            <div><span>API status</span><strong class="status-value" [class.online]="!loading() && !loadError()"><i class="pi pi-circle-fill"></i>{{ connectionStatus() }}</strong></div>
          </div>
        </p-card>
      </section>
    </div>
  `,
  styles: [`
    :host{display:block}.settings-page{max-width:1500px;margin:0 auto}.settings-header{align-items:flex-end}.eyebrow{display:inline-flex;align-items:center;gap:.4rem;color:var(--p-primary-color);font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:.4rem}.admin-badge,.policy-badge{display:inline-flex;align-items:center;gap:.4rem;padding:.42rem .7rem;border:1px solid color-mix(in srgb,var(--p-primary-color) 35%,var(--p-content-border-color));border-radius:999px;background:color-mix(in srgb,var(--p-primary-color) 8%,transparent);color:var(--p-primary-color);font-size:.75rem;font-weight:700}.settings-section{margin-top:1.8rem}.section-title{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:.75rem}.section-title>div:first-child>span{color:var(--p-primary-color);font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.section-title h2{font-size:1.15rem;margin:.1rem 0 0}.section-title>p{margin:0;color:var(--p-text-muted-color);font-size:.78rem}.settings-card{height:100%;border:1px solid var(--p-content-border-color);box-shadow:var(--oms-card-shadow)}:host ::ng-deep .settings-card .p-card-body{height:100%}:host ::ng-deep .settings-card .p-card-content{padding:0}.card-heading{display:flex;gap:.75rem;align-items:center;padding-bottom:1rem;border-bottom:1px solid var(--p-content-border-color)}.heading-icon,.rule-icon,.security-mark{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:11px;background:color-mix(in srgb,var(--p-primary-color) 12%,transparent);color:var(--p-primary-color)}.card-heading h3,.security-intro h3{margin:0;font-size:1rem}.card-heading p,.security-intro p{margin:.15rem 0 0;color:var(--p-text-muted-color);font-size:.78rem}.setting-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.2rem .1rem .2rem}.setting-row strong,.setting-row small{display:block}.setting-row small{color:var(--p-text-muted-color);font-size:.78rem;margin-top:.15rem}.theme-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:.55rem;margin-top:1rem}.theme-option{display:flex;align-items:center;gap:.65rem;min-width:0;padding:.7rem;border:1px solid var(--p-content-border-color);border-radius:11px;background:var(--oms-subtle-bg);color:var(--p-text-color);text-align:left;cursor:pointer;transition:border-color .15s,background .15s,transform .15s}.theme-option:hover,.theme-option:focus-visible{border-color:var(--p-primary-color);transform:translateY(-1px);outline:0}.theme-option.selected{border-color:var(--p-primary-color);background:color-mix(in srgb,var(--p-primary-color) 9%,transparent)}.theme-option>i{margin-left:auto;color:var(--p-primary-color)}.theme-copy{min-width:0}.theme-copy strong,.theme-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.theme-copy small{color:var(--p-text-muted-color);font-size:.68rem}.save-state{display:inline-flex;align-items:center;gap:.4rem;color:#34d399;font-size:.75rem;font-weight:700}.save-state.error{color:#f87171}.load-error{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.85rem 1rem;margin-bottom:1rem;border:1px solid rgba(248,113,113,.35);border-radius:10px;background:rgba(248,113,113,.08)}.load-error>span{display:flex;align-items:center;gap:.65rem}.load-error>span>i{color:#f87171}.load-error strong,.load-error small{display:block}.load-error small{color:var(--p-text-muted-color)}.rules-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}.rules-grid.disabled{opacity:.62}.rule-item{display:flex;align-items:center;gap:.75rem;padding:.9rem;border:1px solid var(--p-content-border-color);border-radius:12px;background:var(--oms-subtle-bg)}.rule-copy{flex:1;min-width:0}.rule-copy strong,.rule-copy small{display:block}.rule-copy small{color:var(--p-text-muted-color);font-size:.76rem;margin:.12rem 0 .4rem}.rule-copy>span{display:inline-block;padding:.15rem .4rem;border-radius:999px;background:color-mix(in srgb,var(--p-primary-color) 10%,transparent);color:var(--p-primary-color);font-size:.62rem;font-weight:700;text-transform:uppercase}.rules-note{display:flex;align-items:center;gap:.5rem;margin:1rem 0 0;padding-top:.85rem;border-top:1px solid var(--p-content-border-color);color:var(--p-text-muted-color);font-size:.76rem}.security-intro{display:flex;align-items:center;gap:.8rem;margin-bottom:1rem}.policy-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem}.policy-item{display:flex;align-items:center;gap:.6rem;padding:.8rem;border:1px solid var(--p-content-border-color);border-radius:11px;color:var(--p-text-muted-color)}.policy-item.allowed{border-color:rgba(52,211,153,.3);background:rgba(52,211,153,.06)}.policy-item>i{color:#94a3b8}.policy-item.allowed>i{color:#34d399}.policy-item>div{flex:1;min-width:0}.policy-item strong,.policy-item small{display:block}.policy-item small{font-size:.68rem;color:var(--p-text-muted-color)}.policy-item>span{font-size:.65rem;font-weight:800;text-transform:uppercase}.policy-item.allowed>span{color:#34d399}.system-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0}.system-grid>div{padding:.9rem 1rem;border-left:1px solid var(--p-content-border-color);border-bottom:1px solid var(--p-content-border-color)}.system-grid>div:nth-child(3n+1){border-left:0}.system-grid>div:nth-last-child(-n+3){border-bottom:0}.system-grid span,.system-grid strong{display:block}.system-grid span{color:var(--p-text-muted-color);font-size:.68rem;text-transform:uppercase;letter-spacing:.05em}.system-grid strong{margin-top:.25rem;font-size:.84rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status-value{display:flex!important;align-items:center;gap:.4rem}.status-value i{font-size:.5rem;color:#f87171}.status-value.online i{color:#34d399}@media(max-width:900px){.rules-grid,.policy-grid{grid-template-columns:1fr 1fr}.system-grid{grid-template-columns:1fr 1fr}.system-grid>div:nth-child(3n+1){border-left:1px solid var(--p-content-border-color)}.system-grid>div:nth-child(odd){border-left:0}.system-grid>div:nth-last-child(-n+3){border-bottom:1px solid var(--p-content-border-color)}.system-grid>div:nth-last-child(-n+2){border-bottom:0}}@media(max-width:620px){.section-title{align-items:flex-start;flex-direction:column}.rules-grid,.policy-grid,.system-grid{grid-template-columns:1fr}.system-grid>div{border-left:0!important;border-bottom:1px solid var(--p-content-border-color)!important}.system-grid>div:last-child{border-bottom:0!important}.admin-badge{display:none}}
  `],
})
export class Settings {
  readonly omsStyle = inject(OmsStyleService);
  readonly environment = environment;
  readonly angularVersion = VERSION.full;
  readonly apiHost = this.resolveApiHost();

  private readonly messages = inject(MessageService);
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/records/settings`;
  private recordId: number | null = null;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly rules = signal<NotificationRule[]>(this.defaultRules());
  readonly connectionStatus = computed(() => this.loading() ? 'Checking' : this.loadError() ? 'Unavailable' : 'Connected');

  readonly securityPolicy = [
    { role: 'Super Admin', scope: 'All active users', allowed: true },
    { role: 'Company Admin', scope: 'Non-admin users in their company', allowed: true },
    { role: 'Manager', scope: 'No administrative reset access', allowed: false },
    { role: 'Staff & Viewers', scope: 'Self-service reset only', allowed: false },
  ];

  constructor() { this.loadSettings(); }

  loadSettings(): void {
    if (this.loading() && this.loadError() === null && this.recordId !== null) return;
    this.loading.set(true);
    this.loadError.set(null);
    this.http.get<ApiResponse<SettingRecord[]>>(this.endpoint).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (response) => {
        const record = response.data.find((item) => item.kind === 'notification-preferences');
        this.recordId = record?.id ?? null;
        if (record) this.rules.update((items) => items.map((item) => ({ ...item, value: record.values[item.key] ?? item.value })));
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(error.status === 0 ? 'The OMS API could not be reached.' : 'The server could not load these settings.');
      },
    });
  }

  toggleRule(key: NotificationRule['key'], value: boolean): void {
    if (this.loading() || this.saving() || this.loadError()) return;
    const previous = this.rules();
    this.rules.update((items) => items.map((item) => item.key === key ? { ...item, value } : item));
    const values = Object.fromEntries(this.rules().map((item) => [item.key, item.value]));
    const request = this.recordId === null
      ? this.http.post<ApiResponse<SettingRecord>>(this.endpoint, { kind: 'notification-preferences', values })
      : this.http.put<ApiResponse<SettingRecord>>(`${this.endpoint}/${this.recordId}`, { kind: 'notification-preferences', values });

    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (response) => {
        this.recordId = response.data.id;
        this.messages.add({ severity: 'success', summary: 'Notification rules saved' });
      },
      error: () => {
        this.rules.set(previous);
        this.messages.add({ severity: 'error', summary: 'Changes were not saved', detail: 'The previous notification rules have been restored.' });
      },
    });
  }

  private defaultRules(): NotificationRule[] {
    return [
      { key: 'onboarding', label: 'Staff onboarding', desc: 'Deliver events when a staff member joins the organisation.', icon: 'pi pi-user-plus', value: true },
      { key: 'exits', label: 'Staff exits', desc: 'Deliver events when a staff member leaves the organisation.', icon: 'pi pi-sign-out', value: true },
      { key: 'transfers', label: 'Organisation changes', desc: 'Deliver transfer, promotion, title and reporting-line events.', icon: 'pi pi-sitemap', value: true },
      { key: 'vacancies', label: 'Vacancy activity', desc: 'Deliver events when vacancies are opened or closed.', icon: 'pi pi-inbox', value: false },
    ];
  }

  private resolveApiHost(): string {
    try { return new URL(environment.apiUrl, window.location.origin).host; }
    catch { return environment.apiUrl; }
  }
}
