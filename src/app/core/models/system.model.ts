import { Role } from './enums';
import { Audited } from './organization.model';

/** A system login account managed on the Users & Roles screen. */
export interface AppUser extends Audited {
  username: string;
  fullName: string;
  email: string;
  role: Role;
  companyId?: number | null;
  companyName?: string | null;
  staffId?: number | null;
  staffName?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  employeeCode?: string | null;
  isActive: boolean;
  isLocked: boolean;
  lockedUntil?: string | null;
  failedLoginAttempts: number;
  lastLogin?: string | null;
  version: number;
}

export type AuditActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'TRANSFER' | 'REPARENT' | 'IMPORT' | 'LOGIN' | 'LOGIN_FAILED' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'PASSWORD_RESET';

/** Immutable change record shown on the Audit Log screen. */
export interface AuditEntry extends Audited {
  entityType: string;
  entityId?: number | null;
  action: AuditActionType;
  summary: string;
  changedBy: string;
  changedAt: string;
}

export type NotificationType =
  | 'STAFF_ONBOARDED'
  | 'STAFF_EXITED'
  | 'VACANCY_OPENED'
  | 'COMPANY_ADDED'
  | 'DEPARTMENT_CHANGE'
  | 'PROMOTION' | 'TITLE_CHANGE' | 'DEPARTMENT_TRANSFER' | 'COMPANY_TRANSFER' | 'REPORTING_LINE_CHANGE' | 'VACANCY_CLOSED'
  | 'SYSTEM';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  icon: string;
  color: string;
  category: 'WORKFORCE' | 'ORGANIZATION' | 'VACANCY' | 'SYSTEM';
  priority: 'HIGH' | 'NORMAL';
  link?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationSummary { total: number; unread: number; today: number; }
