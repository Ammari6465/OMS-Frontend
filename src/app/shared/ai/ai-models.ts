/**
 * Ask OMS — shared AI copilot models.
 *
 * The copilot follows an intent → structured-context → natural-language & block flow.
 * The *engine* (see intent-engine.ts) performs all calculation from real OMS
 * data; a pluggable {@link AiProvider} only rephrases the already-computed
 * result. No model ever calculates business metrics or sees raw records beyond
 * the minimal `context` payload.
 */

export type AiRole = 'user' | 'assistant';

export type AiIntentKind =
  | 'reporting-hierarchy'
  | 'manager-of'
  | 'team-hierarchy'
  | 'reporting-chain'
  | 'contact-info'
  | 'person-attribute'
  | 'recent-hires'
  | 'join-roster'
  | 'department-stats'
  | 'department-head'
  | 'department-scoped'
  | 'company-scoped'
  | 'multi-filter'
  | 'comparison'
  | 'data-quality'
  | 'positions-by-title'
  | 'vacancies'
  | 'find-employee'
  | 'insights'
  | 'activity-summary'
  | 'workplace-location'
  | 'my-profile'
  | 'my-manager'
  | 'my-team'
  | 'my-department'
  | 'my-reporting-chain'
  | 'ambiguity'
  | 'how-to'
  | 'guide'
  | 'help'
  | 'greeting'
  | 'courtesy'
  | 'capabilities'
  | 'did-you-mean'
  | 'unknown'
  | 'denied';

/** A follow-up the user can take from an answer (navigate, focus the organogram, select candidate, ask prompt). */
export interface AiAction {
  kind: 'navigate' | 'focus-organogram' | 'select-context' | 'ask-prompt';
  label: string;
  icon: string;
  route?: string;
  staffId?: number;
  deptId?: number;
  companyId?: number;
  prompt?: string;
  deskId?: number;
}

/** Conversational context persisted within an Ask OMS session. */
export interface AskOmsContext {
  lastIntent?: AiIntentKind;
  lastEntityType?: 'staff' | 'department' | 'company' | 'position' | 'vacancy' | 'desk';
  staffId?: number | null;
  staffName?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  companyId?: number | null;
  companyName?: string | null;
  positionId?: number | null;
  resultStaffIds?: number[];
  lastQuery?: string;
  comparisonDeptId?: number | null;
}

// ---- Structured Entity Blocks ----

export interface EmployeeBlock {
  kind: 'employee';
  id: number;
  name: string;
  title?: string | null;
  employeeCode?: string | null;
  departmentName?: string;
  deptId?: number | null;
  companyName?: string;
  companyId?: number | null;
  managerName?: string | null;
  managerId?: number | null;
  email?: string | null;
  cellNumber?: string | null;
  landline?: string | null;
  status?: string;
  dateJoined?: string | null;
  directReportsCount?: number;
  extendedTeamCount?: number;
}

export interface DepartmentBlock {
  kind: 'department';
  id: number;
  name: string;
  companyName?: string;
  companyId?: number | null;
  headName?: string | null;
  headStaffId?: number | null;
  employeeCount: number;
  vacancyCount: number;
  positionCount: number;
}

export interface PositionBlock {
  kind: 'position';
  id: number;
  title: string;
  departmentName?: string;
  deptId?: number | null;
  companyName?: string;
  companyId?: number | null;
  isVacant: boolean;
  status: string;
}

export interface MetricComparisonItem {
  id?: number;
  name: string;
  entityType: 'department' | 'company';
  employeeCount: number;
  vacancyCount?: number;
  headName?: string | null;
}

export interface ComparisonBlock {
  kind: 'comparison';
  title: string;
  itemA: MetricComparisonItem;
  itemB: MetricComparisonItem;
  differenceSummary: string;
}

export interface ReportingChainNode {
  id: number;
  name: string;
  title?: string | null;
  departmentName?: string;
  level: number;
  isTarget?: boolean;
}

export interface ReportingChainBlock {
  kind: 'reporting-chain';
  targetStaffName: string;
  levelsAboveTarget: number;
  nodes: ReportingChainNode[];
}

export interface AmbiguityCandidate {
  id: number;
  name: string;
  employeeCode?: string | null;
  title?: string | null;
  departmentName?: string;
  deptId?: number | null;
  companyName?: string;
  companyId?: number | null;
}

export interface AmbiguityBlock {
  kind: 'ambiguity';
  prompt: string;
  candidates: AmbiguityCandidate[];
}

export interface DataQualityIssue {
  id: number;
  entityType: 'staff' | 'department' | 'position';
  name: string;
  issue: string;
  route: string;
  staffId?: number;
}

export interface DataQualityBlock {
  kind: 'data-quality';
  category: string;
  summary: string;
  totalIssues: number;
  issues: DataQualityIssue[];
}

/** Scannable roll-up for "any vacancies?" — totals plus a per-department split. */
export interface VacancySummaryBlock {
  kind: 'vacancy-summary';
  /** Present when the question was scoped to one department. */
  scopeName?: string | null;
  scopeDeptId?: number | null;
  totalOpen: number;
  departmentCount: number;
  byDepartment: { name: string; deptId?: number | null; count: number }[];
  titles: string[];
}

export interface CapabilityExample {
  label: string;
  query: string;
}

export interface CapabilityGroup {
  title: string;
  icon: string;
  examples: CapabilityExample[];
}

/** Grouped "what can you ask" reference, shown only when explicitly requested. */
export interface CapabilityBlock {
  kind: 'capability';
  groups: CapabilityGroup[];
}

export type AskOmsBlock =
  | EmployeeBlock
  | DepartmentBlock
  | PositionBlock
  | ComparisonBlock
  | ReportingChainBlock
  | AmbiguityBlock
  | DataQualityBlock
  | VacancySummaryBlock
  | CapabilityBlock;

export interface AiSuggestion {
  label: string;
  query: string;
  icon: string;
}

/** The outcome of interpreting one question. */
export interface AiResult {
  intent: AiIntentKind;
  /** Minimal structured context — exactly what would be sent to an LLM. */
  context: Record<string, unknown>;
  /** Deterministic, data-derived natural-language answer. */
  answer: string;
  actions: AiAction[];
  tone: 'normal' | 'denied' | 'empty' | 'error';
  blocks?: AskOmsBlock[];
  updatedContext?: Partial<AskOmsContext>;
  suggestions?: AiSuggestion[];
  /** Intent-match score, when the result came from the scoring layer. */
  confidence?: number;
  /**
   * True for results a provider must not rephrase — greetings, help screens and
   * clarifications are UI copy, not data-derived prose.
   */
  skipRephrase?: boolean;
}

export interface AiMessage {
  id: number;
  role: AiRole;
  text: string;
  actions?: AiAction[];
  blocks?: AskOmsBlock[];
  suggestions?: AiSuggestion[];
  tone?: AiResult['tone'];
  /** True while the assistant reply is streaming/being computed. */
  pending?: boolean;
  ts: number;
}
