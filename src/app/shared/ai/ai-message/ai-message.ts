import { Component, computed, input, output } from '@angular/core';

import {
  AiAction,
  AiMessage,
  AiSuggestion,
  AmbiguityBlock,
  AmbiguityCandidate,
  ComparisonBlock,
  DataQualityBlock,
  DepartmentBlock,
  EmployeeBlock,
  PositionBlock,
  ReportingChainBlock,
} from '../ai-models';

/** Renders an interactive copilot message with entity cards and dynamic follow-up chips. */
@Component({
  selector: 'app-ai-message',
  template: `
    <div class="row" [class.user]="message().role === 'user'" [class.assistant]="message().role === 'assistant'">
      @if (message().role === 'assistant') {
        <span class="ai-avatar" aria-hidden="true"><i class="pi pi-sparkles"></i></span>
      }
      <div class="bubble-container">
        <div class="bubble" [attr.data-tone]="message().tone ?? 'normal'">
          @if (message().pending) {
            <span class="typing" role="status" aria-label="Assistant is thinking">
              <span></span><span></span><span></span>
            </span>
          } @else {
            <p class="text">{{ message().text }}</p>

            <!-- Structured Result Blocks -->
            @if (message().blocks?.length) {
              <div class="blocks-container">
                @for (b of message().blocks; track $index) {
                  <!-- 1. Employee Card -->
                  @if (b.kind === 'employee') {
                    <div class="card employee-card">
                      <div class="card-head">
                        <div class="emp-avatar">{{ initials(b.name) }}</div>
                        <div class="emp-meta">
                          <div class="emp-name-row">
                            <strong>{{ b.name }}</strong>
                            @if (b.employeeCode) {
                              <span class="badge code">{{ b.employeeCode }}</span>
                            }
                          </div>
                          <div class="emp-title">{{ b.title || 'Staff Member' }}</div>
                          <div class="emp-badges">
                            @if (b.departmentName) {
                              <span class="badge dept"><i class="pi pi-building"></i>{{ b.departmentName }}</span>
                            }
                            @if (b.companyName) {
                              <span class="badge comp"><i class="pi pi-briefcase"></i>{{ b.companyName }}</span>
                            }
                          </div>
                        </div>
                      </div>

                      <div class="card-body">
                        @if (b.managerName) {
                          <div class="field-line">
                            <span class="label">Reports to:</span>
                            <span class="val manager-link" (click)="askPerson(b.managerName)">
                              <i class="pi pi-user"></i>{{ b.managerName }}
                            </span>
                          </div>
                        }
                        @if (b.email) {
                          <div class="field-line">
                            <span class="label">Email:</span>
                            <a [href]="'mailto:' + b.email" class="val link">{{ b.email }}</a>
                          </div>
                        }
                        @if (b.cellNumber || b.landline) {
                          <div class="field-line">
                            <span class="label">Phone:</span>
                            <span class="val">{{ b.cellNumber || b.landline }}</span>
                          </div>
                        }
                        @if (b.directReportsCount != null && b.directReportsCount > 0) {
                          <div class="field-line">
                            <span class="label">Team:</span>
                            <span class="val team-tag" (click)="askTeam(b.name)">
                              {{ b.directReportsCount }} direct / {{ b.extendedTeamCount }} extended
                            </span>
                          </div>
                        }
                      </div>

                      <div class="card-actions">
                        <button type="button" class="mini-btn" (click)="focusOrganogram(b.id)">
                          <i class="pi pi-sitemap"></i>Organogram
                        </button>
                        <button type="button" class="mini-btn" (click)="navigateToStaff(b.id)">
                          <i class="pi pi-user"></i>Profile
                        </button>
                        @if (b.managerName) {
                          <button type="button" class="mini-btn" (click)="askManager(b.name)">
                            <i class="pi pi-arrow-up"></i>Manager
                          </button>
                        }
                        @if (b.directReportsCount) {
                          <button type="button" class="mini-btn" (click)="askReports(b.name)">
                            <i class="pi pi-users"></i>Reports ({{ b.directReportsCount }})
                          </button>
                        }
                      </div>
                    </div>
                  }

                  <!-- 2. Department Card -->
                  @if (b.kind === 'department') {
                    <div class="card dept-card">
                      <div class="card-head">
                        <div class="dept-avatar"><i class="pi pi-building"></i></div>
                        <div class="emp-meta">
                          <strong>{{ b.name }}</strong>
                          <div class="emp-title">{{ b.companyName }}</div>
                        </div>
                      </div>
                      <div class="dept-stats-row">
                        <div class="stat-pill">
                          <span class="stat-num">{{ b.employeeCount }}</span>
                          <span class="stat-lbl">Staff</span>
                        </div>
                        <div class="stat-pill">
                          <span class="stat-num">{{ b.vacancyCount }}</span>
                          <span class="stat-lbl">Vacancies</span>
                        </div>
                        <div class="stat-pill">
                          <span class="stat-num">{{ b.positionCount }}</span>
                          <span class="stat-lbl">Positions</span>
                        </div>
                      </div>
                      @if (b.headName) {
                        <div class="field-line" style="margin-top: 0.5rem;">
                          <span class="label">Department Head:</span>
                          <span class="val manager-link" (click)="askPerson(b.headName)">{{ b.headName }}</span>
                        </div>
                      }
                      <div class="card-actions">
                        <button type="button" class="mini-btn" (click)="navigateToStaffDept(b.id)">
                          <i class="pi pi-users"></i>View Staff
                        </button>
                        <button type="button" class="mini-btn" (click)="navigateToVacancies(b.id)">
                          <i class="pi pi-inbox"></i>Vacancies ({{ b.vacancyCount }})
                        </button>
                        <button type="button" class="mini-btn" (click)="askDeptCompare(b.name)">
                          <i class="pi pi-chart-bar"></i>Compare
                        </button>
                      </div>
                    </div>
                  }

                  <!-- 3. Position / Vacancy Card -->
                  @if (b.kind === 'position') {
                    <div class="card pos-card">
                      <div class="pos-head">
                        <div>
                          <strong>{{ b.title }}</strong>
                          <div class="emp-title">{{ b.departmentName }} · {{ b.companyName }}</div>
                        </div>
                        <span class="badge" [class.vacant]="b.isVacant" [class.filled]="!b.isVacant">
                          {{ b.isVacant ? 'OPEN VACANCY' : 'FILLED' }}
                        </span>
                      </div>
                      <div class="card-actions">
                        <button type="button" class="mini-btn" (click)="navigateToVacancies(b.deptId)">
                          <i class="pi pi-inbox"></i>View Vacancies
                        </button>
                        <button type="button" class="mini-btn" (click)="navigateToOrganogram()">
                          <i class="pi pi-sitemap"></i>Organogram
                        </button>
                      </div>
                    </div>
                  }

                  <!-- 4. Comparison Card -->
                  @if (b.kind === 'comparison') {
                    <div class="card comp-card">
                      <div class="comp-title"><strong>{{ b.title }}</strong></div>
                      <div class="comp-grid">
                        <div class="comp-col">
                          <div class="comp-name">{{ b.itemA.name }}</div>
                          <div class="comp-metric">{{ b.itemA.employeeCount }} <span>employees</span></div>
                          @if (b.itemA.vacancyCount != null) {
                            <div class="comp-sub">{{ b.itemA.vacancyCount }} open vacancies</div>
                          }
                        </div>
                        <div class="comp-vs">VS</div>
                        <div class="comp-col">
                          <div class="comp-name">{{ b.itemB.name }}</div>
                          <div class="comp-metric">{{ b.itemB.employeeCount }} <span>employees</span></div>
                          @if (b.itemB.vacancyCount != null) {
                            <div class="comp-sub">{{ b.itemB.vacancyCount }} open vacancies</div>
                          }
                        </div>
                      </div>
                      <div class="comp-diff">{{ b.differenceSummary }}</div>
                    </div>
                  }

                  <!-- 5. Reporting Chain Timeline -->
                  @if (b.kind === 'reporting-chain') {
                    <div class="card chain-card">
                      <div class="chain-title">
                        <i class="pi pi-arrows-v"></i>
                        <strong>Reporting Chain for {{ b.targetStaffName }}</strong>
                      </div>
                      <div class="chain-nodes">
                        @for (node of b.nodes; track node.id; let last = $last) {
                          <div class="chain-step" [class.target]="node.isTarget">
                            <div class="step-badge">L{{ node.level }}</div>
                            <div class="step-info">
                              <span class="step-name">{{ node.name }}</span>
                              @if (node.title) {
                                <span class="step-title">{{ node.title }}</span>
                              }
                            </div>
                            @if (node.isTarget) {
                              <span class="selected-pill">Selected</span>
                            }
                          </div>
                          @if (!last) {
                            <div class="chain-arrow">↓</div>
                          }
                        }
                      </div>
                    </div>
                  }

                  <!-- 6. Ambiguity Candidate Selector -->
                  @if (b.kind === 'ambiguity') {
                    <div class="card ambiguity-card">
                      <div class="amb-prompt">{{ b.prompt }}</div>
                      <div class="candidates-list">
                        @for (c of b.candidates; track c.id) {
                          <button type="button" class="cand-item" (click)="selectCandidate(c)">
                            <div class="cand-avatar">{{ initials(c.name) }}</div>
                            <div class="cand-meta">
                              <div class="cand-top">
                                <strong>{{ c.name }}</strong>
                                @if (c.employeeCode) {
                                  <span class="badge code">{{ c.employeeCode }}</span>
                                }
                              </div>
                              <div class="cand-sub">{{ c.title || 'Staff' }} · {{ c.departmentName }} ({{ c.companyName }})</div>
                            </div>
                            <i class="pi pi-chevron-right cand-arrow"></i>
                          </button>
                        }
                      </div>
                    </div>
                  }

                  <!-- 7. Data Quality Issues Card -->
                  @if (b.kind === 'data-quality') {
                    <div class="card quality-card">
                      <div class="qual-head">
                        <span class="qual-cat">{{ b.category }}</span>
                        <span class="badge qual-count">{{ b.totalIssues }} issue{{ b.totalIssues === 1 ? '' : 's' }}</span>
                      </div>
                      <div class="qual-list">
                        @for (item of b.issues; track item.id) {
                          <div class="qual-item" (click)="navigateToStaff(item.id)">
                            <span><strong>{{ item.name }}</strong>: {{ item.issue }}</span>
                            <i class="pi pi-arrow-right"></i>
                          </div>
                        }
                      </div>
                    </div>
                  }
                }
              </div>
            }

            <!-- Action Buttons -->
            @if (actions().length) {
              <div class="actions">
                @for (a of actions(); track a.label) {
                  <button type="button" class="act" (click)="action.emit(a)">
                    <i [class]="a.icon" aria-hidden="true"></i>{{ a.label }}
                  </button>
                }
              </div>
            }
          }
        </div>

        <!-- Dynamic Follow-Up Suggestion Chips -->
        @if (message().role === 'assistant' && message().suggestions?.length && !message().pending) {
          <div class="followup-chips">
            <span class="followup-lbl"><i class="pi pi-sparkles"></i>Suggested:</span>
            @for (s of message().suggestions; track s.label) {
              <button type="button" class="chip-btn" (click)="askSuggestion(s.query)">
                <i [class]="s.icon"></i>{{ s.label }}
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .row { display: flex; gap: 0.6rem; align-items: flex-start; margin-bottom: 0.25rem; }
      .row.user { justify-content: flex-end; }
      .ai-avatar {
        display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 auto; border-radius: 9px;
        color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 14%, transparent);
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.18);
      }
      .bubble-container { max-width: 90%; display: flex; flex-direction: column; gap: 0.45rem; }
      .row.user .bubble-container { align-items: flex-end; }
      .bubble {
        padding: 0.75rem 0.95rem; border-radius: 14px; font-size: 0.88rem; line-height: 1.5;
        border: 1px solid var(--p-content-border-color); background: var(--p-content-background); color: var(--p-text-color);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
      }
      .row.user .bubble {
        background: var(--p-primary-color); border-color: transparent;
        color: var(--p-primary-contrast-color, #fff); border-bottom-right-radius: 4px;
      }
      .row.assistant .bubble { border-bottom-left-radius: 4px; }
      .bubble[data-tone='denied'] { border-color: color-mix(in srgb, #f59e0b 45%, transparent); background: color-mix(in srgb, #f59e0b 8%, var(--p-content-background)); }
      .bubble[data-tone='error'] { border-color: color-mix(in srgb, #f87171 45%, transparent); background: color-mix(in srgb, #f87171 8%, var(--p-content-background)); }
      .text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }

      /* Structured Cards */
      .blocks-container { display: flex; flex-direction: column; gap: 0.65rem; margin-top: 0.75rem; }
      .card {
        border-radius: 12px; border: 1px solid var(--p-content-border-color);
        background: color-mix(in srgb, var(--p-primary-color) 4%, var(--p-content-background));
        padding: 0.75rem 0.85rem; font-size: 0.84rem;
      }
      .card-head { display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.5rem; }
      .emp-avatar, .dept-avatar, .cand-avatar {
        width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-weight: 700;
        font-size: 0.82rem; background: color-mix(in srgb, var(--p-primary-color) 16%, transparent);
        color: var(--p-primary-color); flex-shrink: 0; border: 1px solid color-mix(in srgb, var(--p-primary-color) 30%, transparent);
      }
      .emp-meta { flex: 1; min-width: 0; }
      .emp-name-row { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
      .emp-title { font-size: 0.76rem; color: var(--p-text-muted-color); margin-top: 1px; }
      .emp-badges { display: flex; gap: 0.35rem; margin-top: 0.25rem; flex-wrap: wrap; }
      .badge {
        font-size: 0.68rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;
        background: var(--oms-subtle-bg, rgba(255, 255, 255, 0.08)); color: var(--p-text-muted-color);
      }
      .badge.code { background: color-mix(in srgb, var(--p-primary-color) 18%, transparent); color: var(--p-primary-color); }
      .badge.vacant { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
      .badge.filled { background: rgba(34, 197, 94, 0.15); color: #22c55e; }

      .card-body { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.6rem; }
      .field-line { display: flex; gap: 0.4rem; font-size: 0.78rem; align-items: center; }
      .field-line .label { color: var(--p-text-muted-color); font-weight: 500; min-width: 70px; }
      .field-line .val { color: var(--p-text-color); font-weight: 600; }
      .manager-link, .team-tag { color: var(--p-primary-color); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .manager-link:hover, .team-tag:hover { filter: brightness(1.2); }
      .link { color: var(--p-primary-color); text-decoration: none; }

      .dept-stats-row { display: flex; gap: 0.5rem; margin: 0.5rem 0; }
      .stat-pill {
        flex: 1; text-align: center; padding: 0.35rem 0.2rem; border-radius: 8px;
        background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
        border: 1px solid color-mix(in srgb, var(--p-primary-color) 20%, transparent);
      }
      .stat-num { display: block; font-weight: 700; font-size: 0.95rem; color: var(--p-primary-color); }
      .stat-lbl { font-size: 0.65rem; color: var(--p-text-muted-color); text-transform: uppercase; }

      .pos-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.5rem; }

      /* Comparison Card */
      .comp-grid { display: flex; align-items: center; gap: 0.5rem; margin: 0.6rem 0; }
      .comp-col { flex: 1; background: var(--p-content-background); padding: 0.55rem; border-radius: 8px; text-align: center; border: 1px solid var(--p-content-border-color); }
      .comp-name { font-weight: 700; font-size: 0.85rem; }
      .comp-metric { font-size: 1.1rem; font-weight: 800; color: var(--p-primary-color); margin: 0.2rem 0; }
      .comp-metric span { font-size: 0.72rem; font-weight: normal; color: var(--p-text-muted-color); }
      .comp-vs { font-weight: 800; font-size: 0.75rem; color: var(--p-text-muted-color); }
      .comp-diff { font-size: 0.78rem; font-weight: 600; color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 10%, transparent); padding: 0.4rem 0.6rem; border-radius: 6px; }

      /* Chain Timeline */
      .chain-title { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; margin-bottom: 0.5rem; color: var(--p-primary-color); }
      .chain-nodes { display: flex; flex-direction: column; gap: 0.25rem; }
      .chain-step { display: flex; align-items: center; gap: 0.55rem; padding: 0.4rem 0.6rem; border-radius: 8px; background: var(--p-content-background); border: 1px solid var(--p-content-border-color); }
      .chain-step.target { border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 10%, transparent); }
      .step-badge { font-size: 0.68rem; font-weight: 700; background: var(--p-primary-color); color: #fff; padding: 1px 6px; border-radius: 99px; }
      .step-info { flex: 1; display: flex; flex-direction: column; }
      .step-name { font-weight: 700; font-size: 0.82rem; }
      .step-title { font-size: 0.7rem; color: var(--p-text-muted-color); }
      .selected-pill { font-size: 0.65rem; font-weight: 700; color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 20%, transparent); padding: 2px 6px; border-radius: 4px; }
      .chain-arrow { text-align: center; color: var(--p-text-muted-color); font-size: 0.75rem; line-height: 0.8; }

      /* Ambiguity Candidates */
      .amb-prompt { font-size: 0.82rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--p-primary-color); }
      .candidates-list { display: flex; flex-direction: column; gap: 0.4rem; }
      .cand-item {
        display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.65rem; border-radius: 8px; border: 1px solid var(--p-content-border-color);
        background: var(--p-content-background); color: var(--p-text-color); cursor: pointer; text-align: left; transition: all 150ms ease;
      }
      .cand-item:hover { border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 8%, transparent); transform: translateX(3px); }
      .cand-meta { flex: 1; min-width: 0; }
      .cand-top { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; }
      .cand-sub { font-size: 0.72rem; color: var(--p-text-muted-color); margin-top: 1px; }
      .cand-arrow { font-size: 0.75rem; color: var(--p-text-muted-color); }

      /* Data Quality */
      .qual-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
      .qual-cat { font-weight: 700; color: #f59e0b; }
      .qual-count { background: rgba(245, 158, 11, 0.18); color: #f59e0b; }
      .qual-list { display: flex; flex-direction: column; gap: 0.35rem; max-height: 180px; overflow-y: auto; }
      .qual-item {
        display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; padding: 0.3rem 0.5rem;
        border-radius: 6px; background: var(--p-content-background); cursor: pointer; border: 1px solid var(--p-content-border-color);
      }
      .qual-item:hover { border-color: var(--p-primary-color); }

      /* Buttons & Chips */
      .card-actions { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem; border-top: 1px solid var(--p-content-border-color); padding-top: 0.45rem; }
      .mini-btn {
        display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.55rem; border-radius: 6px;
        border: 1px solid color-mix(in srgb, var(--p-primary-color) 30%, transparent); background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
        color: var(--p-primary-color); font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 150ms ease;
      }
      .mini-btn:hover { background: color-mix(in srgb, var(--p-primary-color) 18%, transparent); transform: translateY(-1px); }

      .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.65rem; }
      .act {
        display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.65rem; border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--p-primary-color) 35%, var(--p-content-border-color));
        background: color-mix(in srgb, var(--p-primary-color) 8%, transparent); color: var(--p-primary-color);
        font-size: 0.76rem; font-weight: 650; cursor: pointer; transition: background 0.15s, transform 0.15s;
      }
      .act:hover { background: color-mix(in srgb, var(--p-primary-color) 16%, transparent); transform: translateY(-1px); }

      .followup-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; padding: 0 0.2rem; }
      .followup-lbl { font-size: 0.7rem; font-weight: 700; color: var(--p-text-muted-color); display: inline-flex; align-items: center; gap: 3px; margin-right: 0.15rem; }
      .chip-btn {
        display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.6rem; border-radius: 99px;
        border: 1px solid var(--p-content-border-color); background: var(--p-content-background);
        color: var(--p-text-color); font-size: 0.73rem; cursor: pointer; transition: all 150ms ease;
      }
      .chip-btn:hover { border-color: var(--p-primary-color); color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 8%, transparent); transform: translateY(-1px); }
      .chip-btn i { font-size: 0.7rem; color: var(--p-primary-color); }

      .typing { display: inline-flex; gap: 4px; align-items: center; padding: 0.2rem 0; }
      .typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--p-text-muted-color); opacity: 0.5; animation: ai-blink 1.2s infinite ease-in-out; }
      .typing span:nth-child(2) { animation-delay: 0.2s; }
      .typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes ai-blink { 0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
    `,
  ],
})
export class AiMessageComponent {
  readonly message = input.required<AiMessage>();
  readonly action = output<AiAction>();
  readonly actions = computed(() => this.message().actions ?? []);

  initials(name: string): string {
    if (!name) return '';
    const clean = name.replace(/^(dr\.|dr|mr\.|mr|mrs\.|mrs|ms\.|ms|prof\.|prof|eng\.|eng|sir|rev\.|rev)\s+/i, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return name.slice(0, 2).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  focusOrganogram(staffId: number): void {
    this.action.emit({ kind: 'focus-organogram', label: 'Show in Organogram', icon: 'pi pi-sitemap', staffId });
  }

  navigateToStaff(staffId: number): void {
    this.action.emit({ kind: 'navigate', label: 'View Profile', icon: 'pi pi-user', route: '/staff', staffId });
  }

  navigateToStaffDept(deptId: number): void {
    this.action.emit({ kind: 'navigate', label: 'View Department Staff', icon: 'pi pi-users', route: '/staff', deptId });
  }

  navigateToVacancies(deptId?: number | null): void {
    this.action.emit({ kind: 'navigate', label: 'View Vacancies', icon: 'pi pi-inbox', route: '/vacancies', deptId: deptId ?? undefined });
  }

  navigateToOrganogram(): void {
    this.action.emit({ kind: 'navigate', label: 'Open Organogram', icon: 'pi pi-sitemap', route: '/organogram' });
  }

  selectCandidate(c: AmbiguityCandidate): void {
    this.action.emit({ kind: 'select-context', label: c.name, icon: 'pi pi-user', staffId: c.id });
  }

  askPerson(name: string): void {
    this.action.emit({ kind: 'ask-prompt', label: `Find ${name}`, icon: 'pi pi-search', prompt: `Find ${name}` });
  }

  askManager(name: string): void {
    this.action.emit({ kind: 'ask-prompt', label: `Who is the manager of ${name}?`, icon: 'pi pi-arrow-up', prompt: `Who is the manager of ${name}?` });
  }

  askReports(name: string): void {
    this.action.emit({ kind: 'ask-prompt', label: `Who reports to ${name}?`, icon: 'pi pi-users', prompt: `Who reports to ${name}?` });
  }

  askTeam(name: string): void {
    this.action.emit({ kind: 'ask-prompt', label: `Show ${name}'s team`, icon: 'pi pi-users', prompt: `Show ${name}'s team` });
  }

  askDeptCompare(deptName: string): void {
    this.action.emit({ kind: 'ask-prompt', label: `Compare ${deptName} with Operations`, icon: 'pi pi-chart-bar', prompt: `Compare ${deptName} and Operations` });
  }

  askSuggestion(query: string): void {
    this.action.emit({ kind: 'ask-prompt', label: query, icon: 'pi pi-sparkles', prompt: query });
  }
}
