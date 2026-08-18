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
import { WorkplaceService } from '../../features/workplace/workplace.service';

const ACTIVITY_RE = /\b(activit(y|ies)|what happened|what.s new|today.s (summary|updates?)|summar(y|ise|ize) (today|the day|activity)|notification summary)\b/i;
const WORKPLACE_RE = /\b(sit|sitting|seated|desk|floor|workplace|available desks?|assigned desks?|zone)\b/i;

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
  private readonly workplaces = inject(WorkplaceService);

  /** Swappable formatter. Defaults to the deterministic local provider. */
  private provider: AiProvider = new LocalTemplateProvider();

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly messages = signal<AiMessage[]>([]);
  readonly sessionContext = signal<AskOmsContext>({});

  private seq = 0;

  /**
   * Quick actions for the empty state only.
   *
   * Once a conversation starts, follow-ups are attached to each answer instead
   * (see {@link generateFollowUpSuggestions}), so the panel never repeats the
   * same global list under every message.
   */
  readonly suggestions = computed<AiSuggestion[]>(() => [
    { label: 'Find employee', query: 'Find an employee', icon: 'pi pi-search' },
    { label: 'Explore departments', query: 'Which department has the most employees?', icon: 'pi pi-building' },
    { label: 'Open vacancies', query: 'Show open vacancies', icon: 'pi pi-inbox' },
    { label: 'Reporting structure', query: 'Show department sizes', icon: 'pi pi-sitemap' },
  ]);

  /** A live example for the hint under the input — uses a real department. */
  readonly exampleHint = computed<string>(() => {
    const dept = this.org.departments.snapshot()[0];
    return dept ? `Try "Who manages ${dept.name}?"` : 'Try "Who manages Operations?"';
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

    const result$: Observable<AiResult> = WORKPLACE_RE.test(q)
      ? this.workplaceAnswer(q)
      : ACTIVITY_RE.test(q) ? this.activitySummary() : of(interpret(q, dataContext));

    result$
      .pipe(
        switchMap((result) =>
          // Greetings, help screens and clarifications are UI copy, not
          // data-derived prose — there is nothing for a provider to improve,
          // and a round trip would only add latency.
          result.skipRephrase
            ? of({ result, text: result.answer })
            : this.provider.rephrase(result, q).pipe(map((text) => ({ result, text }))),
        ),
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
      if (action.deskId != null) queryParams['deskId'] = action.deskId;
      void this.router.navigate([action.route], { queryParams });
      if (window.matchMedia('(max-width: 720px)').matches) this.close();
    }
  }

  // ---- context + async tools ----

  private workplaceAnswer(query:string):Observable<AiResult>{
    const q=query.toLowerCase();const people=this.org.staff.snapshot();const person=people.find(s=>q.includes(s.name.toLowerCase()))??people.find(s=>s.name.toLowerCase().split(/\s+/).some(n=>n.length>2&&q.includes(n)));
    if(person&&/\b(where|sit|seated|desk|floor|workplace)\b/i.test(query))return this.workplaces.current(person.id).pipe(map(location=>location?{intent:'workplace-location' as const,context:{staffId:person.id,desk:location.deskCode,floor:location.floorName,office:location.officeName},answer:`${person.name} is assigned to desk ${location.deskCode} in ${location.zoneName||'an unzoned area'}, ${location.floorName}, ${location.buildingName}, ${location.officeName}.${location.telephoneExtension?` Extension ${location.telephoneExtension}.`:''}`,actions:[{kind:'navigate' as const,label:'View on floor map',icon:'pi pi-map-marker',route:`/workplaces/floors/${location.floorId}/map`,deskId:location.deskId},{kind:'navigate' as const,label:'Open staff record',icon:'pi pi-user',route:'/staff',staffId:person.id}],tone:'normal' as const}:{intent:'workplace-location' as const,context:{staffId:person.id},answer:`${person.name} does not have an active desk assignment.`,actions:[{kind:'navigate' as const,label:'Open Workplaces',icon:'pi pi-map',route:'/workplaces'}],tone:'empty' as const}));
    return this.workplaces.desks().pipe(map(desks=>{const desk=desks.find(d=>q.includes(d.code.toLowerCase()));if(desk)return{intent:'workplace-location' as const,context:{desk:desk.code},answer:desk.assignment?`Desk ${desk.code} is assigned to ${desk.assignment.staffName||'a staff member'}${desk.zoneName?` in ${desk.zoneName}`:''}.`:`Desk ${desk.code} is ${desk.availability.toLowerCase()}${desk.zoneName?` in ${desk.zoneName}`:''}.`,actions:[{kind:'navigate' as const,label:'Open desk on map',icon:'pi pi-map-marker',route:`/workplaces/floors/${desk.floorId}/map`,deskId:desk.id}],tone:'normal' as const};const zone=desks.find(d=>d.zoneName&&q.includes(d.zoneName.toLowerCase()))?.zoneName;if(zone){const occupants=desks.filter(d=>d.zoneName===zone&&d.assignment?.staffName);return{intent:'workplace-location' as const,context:{zone,count:occupants.length},answer:occupants.length?`${occupants.length} people sit in ${zone}:\n${occupants.map(d=>`• ${d.assignment!.staffName} — ${d.code}`).join('\n')}`:`No active permanent assignments were found in ${zone}.`,actions:[{kind:'navigate' as const,label:'Open Workplaces',icon:'pi pi-map',route:'/workplaces'}],tone:(occupants.length?'normal':'empty') as 'normal'|'empty'}}if(/without.*desk/i.test(q)){const assigned=new Set(desks.flatMap(d=>d.assignment?[d.assignment.staffId]:[]));const missing=people.filter(s=>s.status==='ACTIVE'&&!assigned.has(s.id));return{intent:'workplace-location' as const,context:{count:missing.length},answer:missing.length?`${missing.length} active staff do not have a primary desk assignment:\n${missing.slice(0,15).map(s=>`• ${s.name}`).join('\n')}`:'All active staff have a desk assignment.',actions:[{kind:'navigate' as const,label:'Open Workplaces',icon:'pi pi-map',route:'/workplaces'}],tone:(missing.length?'normal':'empty') as 'normal'|'empty'}}const available=desks.filter(d=>d.availability==='AVAILABLE'&&d.status==='ACTIVE');return{intent:'workplace-location' as const,context:{available:available.length},answer:available.length?`${available.length} desks are currently available for permanent assignment. ${available.slice(0,10).map(d=>d.code).join(', ')}.`:'No available desks were found.',actions:[{kind:'navigate' as const,label:'Show available desks',icon:'pi pi-map',route:'/workplaces'}],tone:(available.length?'normal':'empty') as 'normal'|'empty'}}));
  }

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
