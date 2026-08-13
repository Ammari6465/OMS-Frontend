import { CurrentUser } from '../models/auth.model';
import { Role } from '../models/enums';

export interface DemoAccount {
  username: string;
  password: string;
  user: CurrentUser;
}

export const DEMO_TOKEN_PREFIX = 'demo.';
export const DEMO_USER_KEY = 'oms.auth.demo.user';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: 'admin_sunrich',
    password: 'Admin@12345',
    user: {
      userId: 1,
      username: 'admin_sunrich',
      email: 'admin@sunrichgroup.com',
      fullName: 'Company Admin',
      role: Role.COMPANY_ADMIN,
    },
  },
  {
    username: 'superadmin',
    password: 'Admin@12345',
    user: {
      userId: 2,
      username: 'superadmin',
      email: 'superadmin@sunrichgroup.com',
      fullName: 'System Administrator',
      role: Role.SUPER_ADMIN,
    },
  },
  {
    username: 'hr_manager',
    password: 'Hr@12345',
    user: {
      userId: 3,
      username: 'hr_manager',
      email: 'hr@sunrichgroup.com',
      fullName: 'HR Manager',
      role: Role.MANAGER,
    },
  },
  {
    username: 'dept_manager',
    password: 'Dept@12345',
    user: {
      userId: 4,
      username: 'dept_manager',
      email: 'deptmanager@sunrichgroup.com',
      fullName: 'Department Manager',
      role: Role.MANAGER,
    },
  },
  {
    username: 'staff_john',
    password: 'Staff@12345',
    user: {
      userId: 5,
      username: 'staff_john',
      email: 'john@sunrichgroup.com',
      fullName: 'John Doe (Staff)',
      role: Role.STAFF,
    },
  },
  {
    username: 'viewer_guest',
    password: 'Viewer@12345',
    user: {
      userId: 6,
      username: 'viewer_guest',
      email: 'viewer@sunrichgroup.com',
      fullName: 'Read-Only Viewer',
      role: Role.READ_ONLY,
    },
  },
  {
    username: 'admin',
    password: 'admin123',
    user: {
      userId: 7,
      username: 'admin',
      email: 'admin@sunrichgroup.com',
      fullName: 'Sunrich Administrator',
      role: Role.SUPER_ADMIN,
    },
  },
  {
    username: 'manager',
    password: 'manager123',
    user: {
      userId: 8,
      username: 'manager',
      email: 'manager@sunrichgroup.com',
      fullName: 'Sunrich Group Manager',
      role: Role.MANAGER,
    },
  },
  {
    username: 'viewer',
    password: 'viewer123',
    user: {
      userId: 9,
      username: 'viewer',
      email: 'viewer@sunrichgroup.com',
      fullName: 'Sunrich Analyst',
      role: Role.READ_ONLY,
    },
  },
];

/** Email is not required for login; mock authentication accepts usernames only. */
export function matchDemoAccount(username: string, password: string): DemoAccount | undefined {
  const account = findDemoAccount(username);
  return account?.password === password ? account : undefined;
}

export function findDemoAccount(username: string): DemoAccount | undefined {
  const key = username.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((account) => account.username.toLowerCase() === key);
}

/** Returns true if the username maps to a known mock account (any password). */
export function isKnownAccount(username: string): boolean {
  const key = username.trim().toLowerCase();
  return DEMO_ACCOUNTS.some((a) => a.username.toLowerCase() === key);
}
