export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  COMPANY_ADMIN = 'COMPANY_ADMIN',
  MANAGER = 'MANAGER',
  STAFF = 'STAFF',
  READ_ONLY = 'READ_ONLY',
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'Super Admin',
  [Role.COMPANY_ADMIN]: 'Company Admin',
  [Role.MANAGER]: 'Manager',
  [Role.STAFF]: 'Staff Member',
  [Role.READ_ONLY]: 'Read-Only Viewer',
};

export enum EmploymentType {
  PERMANENT = 'PERMANENT',
  CONTRACT = 'CONTRACT',
  INTERN = 'INTERN',
}

export enum EntityStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
