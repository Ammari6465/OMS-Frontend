import { Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from './dashboard.service';
import { KpiCard } from './components/kpi-card';
import { CountUp } from '../../shared/count-up.directive';

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, SelectModule, ButtonModule, TooltipModule, KpiCard, CountUp],
  template: `
    <div class="oms-page dashboard">
      <!-- Header -->
      <header class="dash-header">
        <div>
          <h1 class="oms-page-title">Dashboard</h1>
          <p class="oms-page-subtitle">Overview of your organisation · {{ today }}</p>
        </div>
        <div class="dash-actions">
          @if (svc.canSelectCompany()) {
            <p-select
              [ngModel]="svc.selectedCompanyId()" (ngModelChange)="onCompany($event)"
              [options]="companyOptions()" optionLabel="label" optionValue="value"
              placeholder="All companies" styleClass="company-select" appendTo="body"
            />
          }
          <button type="button" class="refresh-btn" (click)="svc.refresh()" [disabled]="svc.loading()"
            pTooltip="Refresh" tooltipPosition="bottom" aria-label="Refresh dashboard">
            <i class="pi pi-refresh" [class.oms-spin]="svc.loading()"></i>
          </button>
        </div>
      </header>

      @if (svc.error()) {
        <div class="dash-state">
          <div class="state-icon err"><i class="pi pi-exclamation-triangle"></i></div>
          <h3>Unable to load dashboard data</h3>
          <p>Something went wrong while loading the dashboard information.</p>
          <p-button label="Try Again" icon="pi pi-refresh" (onClick)="svc.refresh()" />
        </div>
      } @else if (svc.isEmpty() && !svc.loading()) {
        <div class="dash-state">
          <div class="state-icon"><i class="pi pi-building"></i></div>
          <h3>No organisation data yet</h3>
          <p>Create your first company to start building your organisational structure.</p>
          @if (auth.isSuperAdmin()) {
            <p-button label="Add Company" icon="pi pi-plus" (onClick)="go('/companies')" />
          }
        </div>
      } @else {
        <section class="command-hero" aria-labelledby="welcome-title">
          <div class="hero-copy">
            <span class="hero-kicker"><i class="pi pi-sparkles"></i> Organisation command center</span>
            <h2 id="welcome-title">Welcome back, {{ firstName() }}</h2>
            <p>Here’s what’s happening across your organisation today.</p>
            <div class="hero-meta"><span><i class="pi pi-building"></i>{{ svc.availableCompanies().length }} companies</span><span><i class="pi pi-users"></i>{{ svc.activeVsInactive().active }} active staff</span></div>
          </div>
          <div class="org-orbit" aria-label="Live organisation overview">
            <div class="orbit-glow"></div>
            <div class="orbit-node company"><i class="pi pi-building"></i><span>{{ selectedCompanyName() }}</span></div>
            @for (department of heroDepartments(); track department.name; let i = $index) {
              <div class="orbit-link link-{{i}}"></div>
              <div class="orbit-node department node-{{i}}" [style.--node-color]="department.color"><strong>{{ department.value }}</strong><span>{{ department.name }}</span></div>
            }
          </div>
        </section>

        <!-- KPI cards -->
        <div class="grid kpi-grid">
          @if (svc.loading()) {
            @for (i of skeletons; track i) {
              <div class="col-12 sm:col-6 xl:col-3"><div class="kpi-skel oms-skeleton"></div></div>
            }
          } @else {
            @for (k of svc.kpis(); track k.key) {
              <div class="col-12 sm:col-6 xl:col-3"><app-kpi-card [kpi]="k" /></div>
            }
          }
        </div>

        <div class="grid mt-2">
          <!-- Workforce distribution -->
          <div class="col-12 lg:col-8">
            <section class="dash-card">
              <div class="card-head">
                <div><h3>Workforce Distribution</h3><p>Employees by department</p></div>
                @if (!svc.loading() && svc.activeVsInactive().total) {
                  <span class="pill">
                    <span class="dot" style="background:#34d399"></span>{{ svc.activeVsInactive().active }} active
                    <span class="dot ml" style="background:#94a3b8"></span>{{ svc.activeVsInactive().inactive }} inactive
                  </span>
                }
              </div>
              @if (svc.loading()) {
                <div class="chart-skel oms-skeleton"></div>
              } @else if (svc.workforceByDepartment().length) {
                <div class="dist">
                  <svg viewBox="0 0 140 140" class="donut" role="img" aria-label="Employees by department">
                    <circle cx="70" cy="70" r="54" fill="none" stroke="var(--p-content-border-color)" stroke-width="16" />
                    @for (s of donut(); track s.color) {
                      <circle cx="70" cy="70" r="54" fill="none" [attr.stroke]="s.color" stroke-width="16"
                        [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.offset" transform="rotate(-90 70 70)" />
                    }
                    <text x="70" y="65" text-anchor="middle" class="donut-total" [appCountUp]="svc.totalDistributed().toString()"></text>
                    <text x="70" y="83" text-anchor="middle" class="donut-cap">STAFF</text>
                  </svg>
                  <ul class="legend">
                    @for (d of svc.workforceByDepartment(); track d.name) {
                      <li><span class="dot" [style.background]="d.color"></span><span class="l-name">{{ d.name }}</span><span class="l-val">{{ d.value }}</span></li>
                    }
                  </ul>
                </div>
              } @else {
                <div class="section-empty">
                  <i class="pi pi-users"></i>
                  <p>No employees yet</p>
                  <span>Add staff and assign departments to see the distribution.</span>
                </div>
              }
            </section>
          </div>

          <!-- Organisation health -->
          <div class="col-12 lg:col-4">
            <section class="dash-card">
              <div class="card-head"><div><h3>Organisation Health</h3><p>Structural completeness</p></div></div>
              @if (svc.loading()) {
                @for (i of [1,2,3]; track i) { <div class="health-skel oms-skeleton"></div> }
              } @else {
                @for (h of svc.health(); track h.label) {
                  <div class="health-row">
                    <div class="health-top"><span>{{ h.label }}</span><strong>{{ h.percent === null ? 'N/A' : h.percent + '%' }}</strong></div>
                    <div class="health-track"><div class="health-fill" [style.width.%]="h.percent ?? 0" [style.background]="h.color"></div></div>
                  </div>
                }
              }
            </section>
          </div>
        </div>

        <div class="grid mt-2">
          <!-- Recent activity -->
          <div class="col-12 lg:col-8">
            <section class="dash-card">
              <div class="card-head">
                <div><h3>Recent Activity</h3><p>Latest organisational changes</p></div>
                <button type="button" class="link" (click)="go('/audit')">View all <i class="pi pi-arrow-right"></i></button>
              </div>
              @if (svc.loading()) {
                @for (i of [1,2,3,4]; track i) { <div class="row-skel oms-skeleton"></div> }
              } @else if (svc.recentActivity().length) {
                <ul class="feed">
                  @for (a of svc.recentActivity(); track a.id) {
                    <li class="feed-item">
                      <span class="feed-avatar" [style.color]="a.color" [style.background]="tint(a.color)">{{ a.initials }}</span>
                      <div class="feed-body">
                        <p class="feed-text"><strong>{{ a.who }}</strong> · {{ a.action }}</p>
                        <span class="feed-time"><i class="pi pi-clock"></i> {{ a.time }}</span>
                      </div>
                      <span class="feed-tag" [style.color]="a.color" [style.background]="tint(a.color)"><i [class]="a.icon"></i></span>
                    </li>
                  }
                </ul>
              } @else {
                <div class="section-empty"><i class="pi pi-history"></i><p>No recent activity</p><span>Organisational activity will appear here.</span></div>
              }
            </section>
          </div>

          <!-- Pending actions -->
          <div class="col-12 lg:col-4">
            <section class="dash-card">
              <div class="card-head"><div><h3>Pending Actions</h3><p>Needs attention</p></div></div>
              @if (svc.loading()) {
                @for (i of [1,2,3]; track i) { <div class="row-skel oms-skeleton"></div> }
              } @else if (svc.pendingActions().length) {
                <div class="pending-list">
                  @for (a of svc.pendingActions(); track a.key) {
                    <button type="button" class="pending" (click)="go(a.route)">
                      <span class="pending-count" [style.color]="a.color" [style.background]="tint(a.color)">{{ a.count }}</span>
                      <span class="pending-label">{{ a.label }}</span>
                      <i class="pi pi-angle-right chev"></i>
                    </button>
                  }
                </div>
              } @else {
                <div class="section-empty small"><i class="pi pi-check-circle"></i><p>All caught up</p><span>Nothing needs your attention.</span></div>
              }
            </section>
          </div>
        </div>

        <!-- Quick actions -->
        <section class="dash-card mt-2">
          <div class="card-head"><div><h3>Quick Actions</h3></div></div>
          <div class="qa-grid">
            @for (a of svc.quickActions(); track a.route) {
              <button type="button" class="qa" (click)="go(a.route)">
                <span class="qa-icon"><i [class]="a.icon"></i></span>
                <span>{{ a.label }}</span>
              </button>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .dash-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1.5rem;
      }
      .dash-actions {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      :host ::ng-deep .company-select {
        min-width: 12rem;
      }
      .refresh-btn {
        width: 40px;
        height: 40px;
        border: 1px solid var(--p-content-border-color);
        border-radius: 10px;
        background: var(--p-content-background);
        color: var(--p-text-color);
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }
      .refresh-btn:hover:not(:disabled) {
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
      }
      .refresh-btn:disabled {
        opacity: 0.6;
        cursor: default;
      }

      /* Cards */
      .command-hero{position:relative;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,.8fr);align-items:center;min-height:230px;margin-bottom:1.35rem;padding:2rem 2.25rem;overflow:hidden;border:1px solid color-mix(in srgb,var(--p-primary-color) 26%,var(--p-content-border-color));border-radius:20px;background:linear-gradient(135deg,color-mix(in srgb,var(--p-primary-color) 11%,var(--p-content-background)),var(--p-content-background) 62%);box-shadow:0 24px 55px -34px color-mix(in srgb,var(--p-primary-color) 55%,transparent);isolation:isolate}.command-hero::before{content:'';position:absolute;width:330px;height:330px;right:-90px;top:-170px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--p-primary-color) 20%,transparent),transparent 70%);z-index:-1}.hero-copy{max-width:620px}.hero-kicker{display:inline-flex;align-items:center;gap:.45rem;padding:.3rem .65rem;border:1px solid color-mix(in srgb,var(--p-primary-color) 28%,transparent);border-radius:999px;color:var(--p-primary-color);background:color-mix(in srgb,var(--p-primary-color) 8%,transparent);font-size:.72rem;font-weight:750;text-transform:uppercase;letter-spacing:.06em}.hero-copy h2{font-size:clamp(1.65rem,3vw,2.45rem);margin:.75rem 0 .35rem;letter-spacing:-.035em}.hero-copy p{margin:0;color:var(--p-text-muted-color);font-size:1rem}.hero-meta{display:flex;gap:1rem;flex-wrap:wrap;margin-top:1.15rem;color:var(--p-text-muted-color);font-size:.8rem}.hero-meta span{display:inline-flex;align-items:center;gap:.4rem}.org-orbit{position:relative;height:190px;perspective:800px;transform-style:preserve-3d}.orbit-glow{position:absolute;inset:18% 16%;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--p-primary-color) 20%,transparent),transparent 68%);filter:blur(10px)}.orbit-node{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--p-primary-color) 30%,var(--p-content-border-color));background:color-mix(in srgb,var(--p-content-background) 84%,transparent);backdrop-filter:blur(12px);box-shadow:0 16px 32px -18px rgba(0,0,0,.55),inset 0 1px rgba(255,255,255,.16);transform-style:preserve-3d}.orbit-node.company{left:50%;top:50%;width:112px;height:76px;border-radius:18px;transform:translate(-50%,-50%) translateZ(45px);z-index:3;color:var(--p-primary-color)}.orbit-node.company i{font-size:1.3rem}.orbit-node span{max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.7rem;margin-top:.25rem;color:var(--p-text-color)}.orbit-node.department{--node-color:var(--p-primary-color);width:76px;height:58px;border-radius:14px;border-color:color-mix(in srgb,var(--node-color) 45%,transparent);color:var(--node-color)}.orbit-node.department strong{font-size:1rem}.node-0{left:4%;top:10%;transform:translateZ(5px)}.node-1{right:4%;top:9%;transform:translateZ(16px)}.node-2{left:8%;bottom:6%;transform:translateZ(22px)}.node-3{right:7%;bottom:5%;transform:translateZ(8px)}.orbit-link{position:absolute;left:50%;top:50%;height:1px;width:38%;transform-origin:left;background:linear-gradient(90deg,color-mix(in srgb,var(--p-primary-color) 50%,transparent),transparent)}.link-0{transform:rotate(208deg)}.link-1{transform:rotate(-29deg)}.link-2{transform:rotate(151deg)}.link-3{transform:rotate(31deg)}
      .dash-card {
        background: var(--p-content-background);
        border: 1px solid var(--p-content-border-color);
        border-radius: var(--oms-radius, 14px);
        box-shadow: var(--oms-card-shadow);
        padding: 1.35rem 1.5rem;
        height: 100%;
      }
      .card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1.15rem;
      }
      .card-head h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: var(--p-text-color);
      }
      .card-head p {
        margin: 0.15rem 0 0;
        font-size: 0.8rem;
        color: var(--p-text-muted-color);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.78rem;
        color: var(--p-text-muted-color);
        white-space: nowrap;
      }
      .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
      .dot.ml { margin-left: 0.5rem; }
      .link {
        border: none;
        background: none;
        cursor: pointer;
        color: var(--p-primary-color);
        font-size: 0.82rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
      }
      .link i { font-size: 0.72rem; }

      /* Distribution donut + legend */
      .dist {
        display: flex;
        align-items: center;
        gap: 1.75rem;
        flex-wrap: wrap;
      }
      .donut { width: 168px; height: 168px; flex-shrink: 0; }
      .donut-total { font-size: 26px; font-weight: 800; fill: var(--p-text-color); }
      .donut-cap { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; fill: var(--p-text-muted-color); }
      .legend { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 0.55rem; }
      .legend li { display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem; }
      .l-name { color: var(--p-text-color); }
      .l-val { margin-left: auto; font-weight: 700; color: var(--p-text-muted-color); font-variant-numeric: tabular-nums; }

      /* Health bars */
      .health-row { padding: 0.55rem 0; }
      .health-top { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.4rem; }
      .health-top span { color: var(--p-text-muted-color); }
      .health-top strong { color: var(--p-text-color); }
      .health-track { height: 8px; border-radius: 5px; background: var(--p-content-border-color); overflow: hidden; }
      .health-fill { height: 100%; border-radius: 5px; transition: width 0.4s ease; }

      /* Activity feed */
      .feed { list-style: none; margin: 0; padding: 0; }
      .feed-item { display: flex; align-items: center; gap: 0.85rem; padding: 0.7rem 0; border-top: 1px solid var(--p-content-border-color); }
      .feed-item:first-child { border-top: none; }
      .feed-avatar { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; font-size: 0.76rem; font-weight: 700; flex-shrink: 0; }
      .feed-body { flex: 1; min-width: 0; }
      .feed-text { margin: 0; font-size: 0.86rem; color: var(--p-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .feed-time { font-size: 0.74rem; color: var(--p-text-muted-color); }
      .feed-time i { font-size: 0.66rem; margin-right: 2px; }
      .feed-tag { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; font-size: 0.8rem; flex-shrink: 0; }

      /* Pending actions */
      .pending-list { display: flex; flex-direction: column; gap: 0.5rem; }
      .pending {
        display: flex; align-items: center; gap: 0.75rem; width: 100%; text-align: left;
        padding: 0.6rem 0.7rem; border: 1px solid var(--p-content-border-color); border-radius: 10px;
        background: transparent; color: var(--p-text-color); cursor: pointer; transition: border-color 0.15s, background 0.15s;
      }
      .pending:hover { border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 6%, transparent); }
      .pending-count { display: grid; place-items: center; min-width: 30px; height: 30px; padding: 0 0.4rem; border-radius: 8px; font-weight: 800; font-size: 0.85rem; }
      .pending-label { flex: 1; font-size: 0.85rem; }
      .pending .chev { color: var(--p-text-muted-color); }

      /* Quick actions */
      .qa-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.6rem; }
      .qa {
        display: flex; align-items: center; gap: 0.7rem; padding: 0.75rem 0.85rem; border: 1px solid var(--p-content-border-color);
        border-radius: 10px; background: transparent; color: var(--p-text-color); cursor: pointer; font-size: 0.88rem; font-weight: 600;
        transition: border-color 0.15s, background 0.15s, transform 0.15s;
      }
      .qa:hover { border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 8%, transparent); transform: translateY(-2px); }
      .qa-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 14%, transparent); }

      /* States */
      .dash-state {
        display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.4rem;
        padding: 4rem 1.5rem; background: var(--p-content-background); border: 1px solid var(--p-content-border-color);
        border-radius: var(--oms-radius, 14px);
      }
      .state-icon { width: 64px; height: 64px; border-radius: 16px; display: grid; place-items: center; font-size: 1.8rem;
        color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 12%, transparent); margin-bottom: 0.75rem; }
      .state-icon.err { color: #f87171; background: rgba(248, 113, 113, 0.14); }
      .dash-state h3 { margin: 0; color: var(--p-text-color); }
      .dash-state p { margin: 0 0 1rem; color: var(--p-text-muted-color); max-width: 26rem; }
      .section-empty { text-align: center; padding: 2.5rem 1rem; color: var(--p-text-muted-color); }
      .section-empty.small { padding: 1.5rem 1rem; }
      .section-empty i { font-size: 1.8rem; opacity: 0.5; }
      .section-empty p { margin: 0.6rem 0 0.2rem; font-weight: 600; color: var(--p-text-color); }
      .section-empty span { font-size: 0.82rem; }

      /* Skeletons */
      .kpi-skel { height: 132px; border-radius: var(--oms-radius, 14px); }
      .chart-skel { height: 168px; border-radius: 12px; }
      .health-skel { height: 34px; border-radius: 8px; margin: 0.5rem 0; }
      .row-skel { height: 44px; border-radius: 8px; margin-bottom: 0.5rem; }

      @media (max-width: 640px) {
        .dash-header { align-items: stretch; }
        .dash-actions { justify-content: space-between; }
        .dist { justify-content: center; }
      }
      @media(max-width:850px){.command-hero{grid-template-columns:1fr;padding:1.5rem}.org-orbit{height:145px;margin-top:.5rem}.orbit-node.company{width:100px;height:66px}.orbit-node.department{width:68px;height:52px}}
      @media(prefers-reduced-motion:no-preference){.orbit-node.company{animation:hero-float 5s ease-in-out infinite}.orbit-node.department{animation:node-float 6s ease-in-out infinite alternate}.node-1,.node-3{animation-delay:-2s}.kpi-grid>div{animation:card-enter .45s both}.kpi-grid>div:nth-child(2){animation-delay:.06s}.kpi-grid>div:nth-child(3){animation-delay:.12s}.kpi-grid>div:nth-child(4){animation-delay:.18s}@keyframes hero-float{50%{transform:translate(-50%,-56%) translateZ(52px)}}@keyframes node-float{to{margin-top:-7px}}@keyframes card-enter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}}
    `,
  ],
})
export class Dashboard implements OnInit {
  readonly svc = inject(DashboardService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly skeletons = [1, 2, 3, 4];
  readonly today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  readonly companyOptions = computed(() => [
    { label: 'All companies', value: null as number | null },
    ...this.svc.availableCompanies().map((c) => ({ label: c.name, value: c.id as number | null })),
  ]);
  readonly firstName = computed(() => (this.auth.currentUser()?.fullName || this.auth.currentUser()?.username || 'there').trim().split(/\s+/)[0]);
  readonly selectedCompanyName = computed(() => this.svc.selectedCompanyId() == null ? 'Group' : this.svc.availableCompanies().find(c => c.id === this.svc.selectedCompanyId())?.name ?? 'Organisation');
  readonly heroDepartments = computed(() => this.svc.workforceByDepartment().slice(0, 4));

  readonly donut = computed(() => {
    const data = this.svc.workforceByDepartment();
    const total = this.svc.totalDistributed();
    const c = 2 * Math.PI * 54;
    let cumulative = 0;
    return data.map((d) => {
      const len = total ? (d.value / total) * c : 0;
      const seg = { color: d.color, dash: `${len.toFixed(2)} ${(c - len).toFixed(2)}`, offset: (-cumulative).toFixed(2) };
      cumulative += len;
      return seg;
    });
  });

  ngOnInit(): void {
    this.svc.refresh();
  }

  onCompany(value: number | null): void {
    this.svc.selectedCompanyId.set(value);
  }

  tint(color: string): string {
    return `color-mix(in srgb, ${color} 16%, transparent)`;
  }

  go(route: string): void {
    this.router.navigate([route]);
  }
}
