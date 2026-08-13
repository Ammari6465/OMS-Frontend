/** View models for the Dashboard. All values are computed from local data. */

export interface DashboardKpi {
  key: string;
  label: string;
  value: string;
  sublabel: string;
  icon: string;
  color: string;
  route?: string;
}

export interface Distribution {
  name: string;
  value: number;
  color: string;
}

export interface HealthMetric {
  label: string;
  /** 0–100, or null when it can't be calculated from the current data. */
  percent: number | null;
  color: string;
}

export interface PendingAction {
  key: string;
  label: string;
  count: number;
  icon: string;
  color: string;
  route: string;
}

export interface ActivityItem {
  id: number;
  initials: string;
  who: string;
  action: string;
  time: string;
  icon: string;
  color: string;
}

export interface QuickAction {
  label: string;
  icon: string;
  route: string;
  /** When false, the action is hidden for the current user. */
  visible: boolean;
}
