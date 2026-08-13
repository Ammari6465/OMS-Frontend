import { Injectable, computed, inject, signal } from '@angular/core';

import { OrgDataService } from '../../core/data/org-data.service';
import { AuditEvent, AuditService } from '../../core/data/audit.service';
import { AuthService } from '../../core/services/auth.service';
import { Company, Department, Position, Staff } from '../../core/models/organization.model';
import { EntityStatus, Role } from '../../core/models/enums';
import { relativeTime } from '../../core/util/time';
import {
  ActivityItem,
  DashboardKpi,
  Distribution,
  HealthMetric,
  PendingAction,
  QuickAction,
} from './dashboard.model';

const PALETTE = ['#0f8bfd', '#8b5cf6', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#f97316', '#84cc16', '#e879f9', '#2dd4bf'];

const ACTIVITY_STYLE: Record<string, { icon: string; color: string }> = {
  CREATE: { icon: 'pi pi-plus', color: '#34d399' },
  UPDATE: { icon: 'pi pi-pencil', color: '#0f8bfd' },
  DELETE: { icon: 'pi pi-trash', color: '#f87171' },
  RESTORE: { icon: 'pi pi-refresh', color: '#fbbf24' },
  IMPORT: { icon: 'pi pi-upload', color: '#8b5cf6' },
  LOGIN: { icon: 'pi pi-sign-in', color: '#22d3ee' },
};

/**
 * Computes every Dashboard metric from the existing local/mock data stores.
 * Component templates read these signals only — no calculation lives in the view.
 *
 * Backend-ready: swap the store reads inside each computed for `HttpClient`
 * responses without changing the public signal surface the Dashboard consumes.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly org = inject(OrgDataService);
  private readonly audit = inject(AuditService);
  private readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly error = signal(false);

  /** Company chosen in the selector (null = all). Ignored for company-scoped roles. */
  readonly selectedCompanyId = signal<number | null>(null);

  /** Bumped by refresh() to force a full recompute from the (mock) source. */
  private readonly tick = signal(0);
  private readonly recentEvents = signal<AuditEvent[]>([]);

  /** A non-super-admin is locked to their own company. */
  private readonly userCompanyId = computed<number | null>(() => {
    const u = this.auth.currentUser();
    if (!u || u.role === Role.SUPER_ADMIN || u.role === Role.READ_ONLY) return null;
    return u.companyId ?? null;
  });

  /** Effective filter: the user's fixed scope wins over the selector. */
  readonly effectiveCompanyId = computed<number | null>(() =>
    this.userCompanyId() ?? this.selectedCompanyId(),
  );

  /** Whether the user may switch companies (multiple companies + not locked). */
  readonly canSelectCompany = computed(
    () => this.userCompanyId() === null && this.allCompanies().length > 1,
  );

  private readonly allCompanies = computed<Company[]>(() => {
    this.tick();
    return this.org.companies.snapshot();
  });
  readonly availableCompanies = computed<Company[]>(() => {
    const scope = this.userCompanyId();
    return scope == null ? this.allCompanies() : this.allCompanies().filter((c) => c.id === scope);
  });

  private readonly staff = computed<Staff[]>(() => {
    this.tick();
    const cid = this.effectiveCompanyId();
    return this.org.staff.snapshot().filter((s) => cid == null || s.companyId === cid);
  });
  private readonly departments = computed<Department[]>(() => {
    this.tick();
    const cid = this.effectiveCompanyId();
    return this.org.departments.snapshot().filter((d) => cid == null || d.companyId === cid);
  });
  private readonly positions = computed<Position[]>(() => {
    this.tick();
    const cid = this.effectiveCompanyId();
    return this.org.positions.snapshot().filter((p) => cid == null || p.companyId === cid);
  });

  /** True when there is genuinely nothing set up yet. */
  readonly isEmpty = computed(() => {
    this.tick();
    return this.org.companies.snapshot().length === 0 && this.org.staff.snapshot().length === 0;
  });

  // ---- Derived counts ----
  private readonly activeStaff = computed(() => this.staff().filter((s) => s.status === EntityStatus.ACTIVE).length);
  private readonly vacantCount = computed(
    () => this.positions().filter((p) => p.isVacant && p.status !== 'CLOSED').length,
  );

  // ---- KPI cards (role-aware set) ----
  readonly kpis = computed<DashboardKpi[]>(() => {
    const n = (v: number) => v.toLocaleString();
    const companies = this.effectiveCompanyId() == null ? this.allCompanies().length : 1;
    const depts = this.departments().length;
    const employees = this.staff().length;
    const active = this.activeStaff();
    const vacancies = this.vacantCount();

    const companiesCard: DashboardKpi = {
      key: 'companies', label: 'Companies', value: n(companies),
      sublabel: 'In the group', icon: 'pi pi-building', color: '#0f8bfd', route: '/companies',
    };
    const deptCard: DashboardKpi = {
      key: 'departments', label: 'Departments', value: n(depts),
      sublabel: this.effectiveCompanyId() == null ? 'Across all companies' : 'In this company',
      icon: 'pi pi-briefcase', color: '#8b5cf6', route: '/departments',
    };
    const staffCard: DashboardKpi = {
      key: 'employees', label: 'Employees', value: n(employees),
      sublabel: `${n(active)} active`, icon: 'pi pi-users', color: '#34d399', route: '/staff',
    };
    const vacancyCard: DashboardKpi = {
      key: 'vacancies', label: 'Open Vacancies', value: n(vacancies),
      sublabel: vacancies ? 'Awaiting a hire' : 'All positions filled',
      icon: 'pi pi-inbox', color: '#fbbf24', route: '/vacancies',
    };

    // Super Admin (group-wide) leads with Companies; scoped users lead with Positions.
    if (this.userCompanyId() === null && this.effectiveCompanyId() === null) {
      return [companiesCard, deptCard, staffCard, vacancyCard];
    }
    const positionsCard: DashboardKpi = {
      key: 'positions', label: 'Positions', value: n(this.positions().length),
      sublabel: 'Defined roles', icon: 'pi pi-id-card', color: '#0f8bfd', route: '/positions',
    };
    return [deptCard, staffCard, positionsCard, vacancyCard];
  });

  // ---- Workforce distribution (employees per department) ----
  readonly workforceByDepartment = computed<Distribution[]>(() => {
    const counts = new Map<number, number>();
    for (const s of this.staff()) if (s.deptId != null) counts.set(s.deptId, (counts.get(s.deptId) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([deptId, value], i) => ({ name: this.org.departmentName(deptId), value, color: PALETTE[i % PALETTE.length] }));
  });
  readonly totalDistributed = computed(() => this.workforceByDepartment().reduce((sum, d) => sum + d.value, 0));

  readonly activeVsInactive = computed(() => {
    const total = this.staff().length;
    const active = this.activeStaff();
    return { active, inactive: total - active, total };
  });

  // ---- Organisation health (all from real data; null when not calculable) ----
  readonly health = computed<HealthMetric[]>(() => {
    const depts = this.departments();
    const positions = this.positions();
    const staff = this.staff();
    const pct = (num: number, den: number) => (den === 0 ? null : Math.round((num / den) * 100));

    const withManager = pct(depts.filter((d) => d.headStaffId != null).length, depts.length);
    const filled = pct(positions.filter((p) => !p.isVacant).length, positions.length);
    const active = pct(staff.filter((s) => s.status === EntityStatus.ACTIVE).length, staff.length);

    const color = (v: number | null) => (v == null ? '#94a3b8' : v >= 80 ? '#34d399' : v >= 50 ? '#fbbf24' : '#f87171');
    return [
      { label: 'Departments with a head', percent: withManager, color: color(withManager) },
      { label: 'Filled positions', percent: filled, color: color(filled) },
      { label: 'Active employees', percent: active, color: color(active) },
    ];
  });

  // ---- Pending actions (only surfaced when there is something to do) ----
  readonly pendingActions = computed<PendingAction[]>(() => {
    const items: PendingAction[] = [];
    const vac = this.vacantCount();
    if (vac) items.push({ key: 'vac', label: 'Open vacancies to fill', count: vac, icon: 'pi pi-inbox', color: '#fbbf24', route: '/vacancies' });

    const noHead = this.departments().filter((d) => d.headStaffId == null).length;
    if (noHead) items.push({ key: 'nohead', label: 'Departments without a head', count: noHead, icon: 'pi pi-briefcase', color: '#f472b6', route: '/departments' });

    const incomplete = this.staff().filter((s) => !s.email || !s.title || !s.employeeCode).length;
    if (incomplete) items.push({ key: 'incomplete', label: 'Incomplete employee records', count: incomplete, icon: 'pi pi-exclamation-circle', color: '#0f8bfd', route: '/staff' });

    const inactive = this.staff().filter((s) => s.status !== EntityStatus.ACTIVE).length;
    if (inactive) items.push({ key: 'inactive', label: 'Inactive employees', count: inactive, icon: 'pi pi-user-minus', color: '#94a3b8', route: '/staff' });

    return items;
  });

  // ---- Recent activity (from the audit trail) ----
  readonly recentActivity = computed<ActivityItem[]>(() => {
    this.tick();
    return this.recentEvents()
      .map((e) => {
        const parts = (e.actorName || '?').trim().split(/\s+/);
        const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
        const style = ACTIVITY_STYLE[e.action] ?? { icon: 'pi pi-circle', color: '#94a3b8' };
        return { id: e.id, initials, who: e.actorName, action: e.description, time: relativeTime(e.timestamp), ...style };
      });
  });

  // ---- Quick actions (respect the frontend role) ----
  readonly quickActions = computed<QuickAction[]>(() => {
    const admin = this.auth.canEditOrgData();
    const superAdmin = this.auth.isSuperAdmin();
    return [
      { label: 'Add Company', icon: 'pi pi-building', route: '/companies', visible: superAdmin },
      { label: 'Add Department', icon: 'pi pi-briefcase', route: '/departments', visible: admin },
      { label: 'Add Employee', icon: 'pi pi-user-plus', route: '/staff', visible: admin },
      { label: 'Manage Vacancies', icon: 'pi pi-inbox', route: '/vacancies', visible: admin },
      { label: 'View Organogram', icon: 'pi pi-sitemap', route: '/organogram', visible: true },
      { label: 'My Profile', icon: 'pi pi-user', route: '/profile', visible: true },
    ].filter((a) => a.visible);
  });

  /** (Re)loads the dashboard. Simulated latency drives the skeleton states. */
  refresh(): void {
    this.loading.set(true);
    this.error.set(false);
    setTimeout(() => {
      try {
        this.tick.update((v) => v + 1);
        this.loading.set(false);
      } catch {
        this.error.set(true);
        this.loading.set(false);
      }
    }, 350);
    if (this.auth.isAdmin()) {
      this.audit.list({ page: 0, size: 6, sort: 'timestamp', direction: 'desc', companyId: this.effectiveCompanyId() })
        .subscribe({ next: (page) => this.recentEvents.set(page.content), error: () => this.recentEvents.set([]) });
    } else {
      this.recentEvents.set([]);
    }
  }
}
