import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { OrgDataService } from '../../core/data/org-data.service';
import { AuditService } from '../../core/data/audit.service';
import { NotificationService } from '../../core/data/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { AiAction, AiMessage, AiResult, AiSuggestion, AskOmsContext } from './ai-models';
import { AiDataContext, generateFollowUpSuggestions, interpret } from './intent-engine';
import { AiProvider, LocalTemplateProvider } from './ai-provider';
import { OrganogramFocusService } from './organogram-focus.service';

const ACTIVITY_RE = /\b(activit(y|ies)|what happened|what.s new|today.s (summary|updates?)|summar(y|ise|ize) (today|the day|activity)|notification summary)\b/i;

/**
 * Orchestrates the Ask OMS organizational copilot:
 * - Manages session conversation history & conversational entity context (pronouns, entity references).
 * - Builds an RBAC-scoped data context.
 * - Routes questions through the deterministic intent engine.
 * - Updates dynamic follow-up suggestions based on the active conversation topic.
 * - Delegates final wording to a pluggable {@link AiProvider}.
 */
@Injectable({ providedIn: 'root' })
export class AskOmsService {
  private readonly org = inject(OrgDataService);
  private readonly audit = inject(AuditService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly organogramFocus = inject(OrganogramFocusService);

  /** Swappable formatter. Defaults to the deterministic local provider. */
  private provider: AiProvider = new LocalTemplateProvider();

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly messages = signal<AiMessage[]>([]);
  readonly sessionContext = signal<AskOmsContext>({});

  private seq = 0;

  /** Dynamic role- and context-aware suggestions */
  readonly suggestions = computed<AiSuggestion[]>(() => {
    const ctx = this.sessionContext();
    const dataCtx = this.buildContext();

    if (ctx.staffName || ctx.departmentName) {
      return generateFollowUpSuggestions(ctx.lastIntent ?? 'find-employee', ctx, dataCtx);
    }

    const base: AiSuggestion[] = [
      { label: 'Guide me how to add a staff', query: 'Guide me how to add a staff', icon: 'pi pi-user-plus' },
      { label: 'Which department has the most employees?', query: 'Which department has the most employees?', icon: 'pi pi-chart-bar' },
      { label: 'Show open vacancies', query: 'Show open vacancies', icon: 'pi pi-inbox' },
      { label: 'Who joined recently?', query: 'Who joined recently?', icon: 'pi pi-calendar' },
      { label: 'Compare Finance and Operations', query: 'Compare Finance and Operations headcount', icon: 'pi pi-chart-bar' },
    ];

    // Seed a real employee name for quick demonstration
    const sample = this.org.staff.snapshot()[0];
    if (sample) {
      const first = sample.name.trim().split(/\s+/)[0];
      base.unshift({ label: `Find ${first}`, query: `Find ${sample.name}`, icon: 'pi pi-search' });
    }

    // Role-specific admin suggestions
    if (this.auth.isAdmin()) {
      base.push(
        { label: 'Staff with no manager', query: 'Which employees have no manager?', icon: 'pi pi-exclamation-circle' },
        { label: 'Departments with no head', query: 'Which departments have no head?', icon: 'pi pi-exclamation-triangle' },
        { label: "Summarise today's activity", query: "Summarise today's activity", icon: 'pi pi-history' },
      );
    }

    return base.slice(0, 6);
  });

  useBackendProvider(provider: AiProvider): void {
    this.provider = provider;
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  show(): void {
    this.open.set(true);
  }

  reset(): void {
    this.messages.set([]);
    this.sessionContext.set({});
  }

  clearContext(): void {
    this.sessionContext.set({});
  }

  selectStaffContext(staffId: number): void {
    const staff = this.org.staff.snapshot().find((s) => s.id === staffId);
    if (!staff) return;
    this.sessionContext.update((c) => ({
      ...c,
      staffId: staff.id,
      staffName: staff.name,
      departmentId: staff.deptId,
      departmentName: this.org.departmentName(staff.deptId),
      companyId: staff.companyId,
      companyName: this.org.companyName(staff.companyId),
      lastEntityType: 'staff',
      lastIntent: 'find-employee',
    }));
    this.ask(`Find ${staff.name}`);
  }

  ask(query: string): void {
    const q = query.trim();
    if (!q || this.busy()) return;

    this.messages.update((m) => [...m, { id: ++this.seq, role: 'user', text: q, ts: Date.now() }]);
    const pendingId = ++this.seq;
    this.messages.update((m) => [...m, { id: pendingId, role: 'assistant', text: '', pending: true, ts: Date.now() }]);
    this.busy.set(true);

    const dataContext = this.buildContext();

    const result$: Observable<AiResult> = ACTIVITY_RE.test(q)
      ? this.activitySummary()
      : of(interpret(q, dataContext));

    result$
      .pipe(
        switchMap((result) => this.provider.rephrase(result, q).pipe(map((text) => ({ result, text })))),
        catchError(() => {
          const fallback: AiResult = {
            intent: 'unknown',
            context: {},
            answer: 'Something went wrong while answering that. Please try again.',
            actions: [],
            tone: 'error',
          };
          return of({
            result: fallback,
            text: fallback.answer,
          });
        }),
      )
      .subscribe(({ result, text }) => {
        // Update conversational context if new entity was established
        if (result.updatedContext) {
          this.sessionContext.update((prev) => ({
            ...prev,
            ...result.updatedContext,
            lastQuery: q,
          }));
        }

        const dynamicSuggestions = result.suggestions ?? generateFollowUpSuggestions(result.intent, this.sessionContext(), dataContext);

        this.messages.update((m) =>
          m.map((msg) =>
            msg.id === pendingId
              ? {
                  ...msg,
                  text,
                  actions: result.actions,
                  blocks: result.blocks,
                  suggestions: dynamicSuggestions,
                  tone: result.tone,
                  pending: false,
                }
              : msg,
          ),
        );
        this.busy.set(false);
      });
  }

  runAction(action: AiAction): void {
    if (action.kind === 'select-context' && action.staffId != null) {
      this.selectStaffContext(action.staffId);
      return;
    }

    if (action.kind === 'ask-prompt' && action.prompt) {
      this.ask(action.prompt);
      return;
    }

    if (action.kind === 'focus-organogram' && action.staffId != null) {
      this.organogramFocus.focus(action.staffId);
      void this.router.navigate(['/organogram']);
      if (window.matchMedia('(max-width: 720px)').matches) this.close();
    } else if (action.kind === 'navigate' && action.route) {
      const queryParams: Record<string, any> = {};
      if (action.deptId != null) queryParams['deptId'] = action.deptId;
      if (action.companyId != null) queryParams['companyId'] = action.companyId;
      if (action.staffId != null) queryParams['staffId'] = action.staffId;
      void this.router.navigate([action.route], { queryParams });
      if (window.matchMedia('(max-width: 720px)').matches) this.close();
    }
  }

  // ---- context + async tools ----

  private buildContext(): AiDataContext {
    return {
      staff: this.org.staff.snapshot(),
      departments: this.org.departments.snapshot(),
      positions: this.org.positions.snapshot(),
      companies: this.org.companies.snapshot(),
      currentStaffId: this.auth.currentUser()?.staffId ?? null,
      canViewActivity: this.auth.isAdmin(),
      deptName: (id) => this.org.departmentName(id),
      companyName: (id) => this.org.companyName(id),
      currentContext: this.sessionContext(),
    };
  }

  /**
   * Today's activity summary. Admins get an audit-trail breakdown.
   * RBAC is enforced here — the audit trail is never read for non-admins.
   */
  private activitySummary(): Observable<AiResult> {
    if (!this.auth.isAdmin()) {
      const s = this.notifications.summary();
      return of({
        intent: 'activity-summary',
        context: { scope: 'personal', today: s.today, unread: s.unread },
        answer:
          `You have ${s.today} notification${s.today === 1 ? '' : 's'} from today` +
          `${s.unread ? `, ${s.unread} still unread` : ''}. ` +
          `The full organisation activity log is restricted to administrators.`,
        actions: [{ kind: 'navigate', label: 'Open Notifications', icon: 'pi pi-bell', route: '/notifications' }],
        tone: 'normal',
      });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return this.audit.list({ page: 0, size: 100, direction: 'desc', from: startOfToday.toISOString() }).pipe(
      map((page) => {
        const events = page.content;
        const counts = new Map<string, number>();
        for (const e of events) {
          const key = humanizeAudit(e.action, e.entityType);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const lines = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => `• ${n} ${label}${n === 1 ? '' : 's'}`);
        const answer = events.length
          ? `Today's organisation activity (${events.length} event${events.length === 1 ? '' : 's'}):\n${lines.join('\n')}`
          : 'No organisation activity has been recorded today yet.';
        return {
          intent: 'activity-summary' as const,
          context: { scope: 'organisation', total: events.length, breakdown: [...counts.entries()].map(([k, v]) => ({ label: k, count: v })) },
          answer,
          actions: [{ kind: 'navigate', label: 'Open Audit Log', icon: 'pi pi-history', route: '/audit' } as AiAction],
          tone: events.length ? ('normal' as const) : ('empty' as const),
        };
      }),
      catchError(() =>
        of({
          intent: 'activity-summary' as const,
          context: {},
          answer: 'I could not load the activity log just now. Please try again shortly.',
          actions: [] as AiAction[],
          tone: 'error' as const,
        }),
      ),
    );
  }
}

/** Turns an audit (action, entityType) pair into a readable activity label. */
function humanizeAudit(action: string, entityType: string): string {
  const entity = (entityType || 'record').toLowerCase();
  const a = (action || '').toUpperCase();
  if (entity.includes('position') || entity.includes('vacancy')) {
    if (a === 'DELETE') return 'vacancy closed';
    if (a === 'CREATE') return 'vacancy opened';
  }
  if (entity.includes('staff')) return a === 'CREATE' ? 'staff record added' : a === 'DELETE' ? 'staff record removed' : 'staff update';
  if (entity.includes('department')) return a === 'CREATE' ? 'department created' : 'department update';
  if (entity.includes('company')) return 'company update';
  if (entity.includes('user') || a === 'LOGIN') return a === 'LOGIN' ? 'login event' : 'user account change';
  const verb = a === 'CREATE' ? 'created' : a === 'DELETE' ? 'removed' : a === 'UPDATE' ? 'updated' : 'changed';
  return `${entity} ${verb}`;
}
