import { EmploymentType, EntityStatus } from './enums';

export interface Audited {
  id: number;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Company extends Audited {
  name: string;
  regNumber?: string;
  headOffice?: string;
  dateEstablished?: string;
  logoUrl?: string;
  status: EntityStatus;
}

export interface Department extends Audited {
  companyId: number;
  companyName?: string;
  name: string;
  description?: string;
  parentDeptId?: number | null;
  headStaffId?: number | null;
  status: EntityStatus;
  version: number;
}

export interface Staff extends Audited {
  companyId: number;
  companyName?: string;
  deptId?: number | null;
  departmentName?: string | null;
  managerId?: number | null;
  managerName?: string | null;
  positionId?: number | null;
  positionTitle?: string | null;
  employeeCode?: string;
  name: string;
  title?: string;
  empType: EmploymentType;
  email?: string;
  landline?: string;
  cellNumber?: string;
  dateJoined?: string;
  dateLeft?: string | null;
  status: EntityStatus;
  photoUrl?: string;
  version: number;
}

export interface Position extends Audited {
  companyId: number;
  companyName?: string;
  title: string;
  deptId?: number | null;
  departmentName?: string | null;
  reportsToPositionId?: number | null;
  reportsToPositionTitle?: string | null;
  isVacant: boolean;
  staffId?: number | null;
  staffName?: string | null;
  status: 'OPEN' | 'FILLED' | 'CLOSED';
  version?: number;
  subordinateCount?: number;
  createdBy?: number | null;
  updatedBy?: number | null;
}
