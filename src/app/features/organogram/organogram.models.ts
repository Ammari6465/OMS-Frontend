export type OrganogramView = 'EMPLOYEE' | 'POSITION';

export interface OrganogramNode {
  id: number;
  parentId: number | null;
  companyId: number;
  departmentId: number | null;
  employeeCode?: string | null;
  name: string;
  title?: string | null;
  photoUrl?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | null;
  version: number;
  vacant: boolean;
  staffId?: number | null;
}
export interface OrganogramDepartment {
  id: number;
  name: string;
  parentId: number | null;
  headStaffId: number | null;
}
export interface OrganogramVacancy {
  id: number;
  title: string;
  departmentId: number | null;
  reportsToPositionId: number | null;
  version: number;
}
export interface OrganogramWarning {
  code: string;
  message: string;
  nodeIds: number[];
}
export interface OrganogramResponse {
  company: { id: number; name: string; logoUrl?: string | null };
  view: OrganogramView;
  nodes: OrganogramNode[];
  rootIds: number[];
  orphanIds: number[];
  departments: OrganogramDepartment[];
  vacancies: OrganogramVacancy[];
  dataVersion: number;
  generatedAt: string;
  capabilities: { canEditHierarchy: boolean; canViewContactDetails: boolean };
  warnings: OrganogramWarning[];
}
export interface OrganogramStaffDetails {
  id: number;
  name: string;
  employeeCode?: string | null;
  title?: string | null;
  departmentId?: number | null;
  managerId?: number | null;
  employmentType: string;
  dateJoined?: string | null;
  dateLeft?: string | null;
  status: string;
  photoUrl?: string | null;
  email?: string | null;
  landline?: string | null;
  cellNumber?: string | null;
  version: number;
}
export interface OrganogramEvent {
  companyId: number;
  entityType: string;
  entityId: number;
  action: string;
  version: number;
  timestamp: string;
}
export interface HierarchyNode {
  data: OrganogramNode;
  children: HierarchyNode[];
  directReports: number;
  totalReports: number;
}
