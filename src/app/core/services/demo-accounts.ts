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
    username: 'chairman',
    password: 'Chairman@2026!',
    user: {
      userId: 1,
      username: 'chairman',
      email: 'chairman@sunrichgroup.com',
      fullName: 'Arjun Wijesinghe',
      role: Role.SUPER_ADMIN,
    },
  },
  {
    username: 'technology.admin',
    password: 'CompanyAdmin@2026!',
    user: {
      userId: 2,
      username: 'technology.admin',
      email: 'technology.admin@sunrichgroup.com',
      fullName: 'Navin Chandrasekara',
      role: Role.COMPANY_ADMIN,
    },
  },
  {
    username: 'technology.manager',
    password: 'Manager@2026!',
    user: {
      userId: 3,
      username: 'technology.manager',
      email: 'technology.manager@sunrichgroup.com',
      fullName: 'Iresha Wijemanne',
      role: Role.MANAGER,
    },
  },
  {
    username: 'technology.staff',
    password: 'Staff@2026!',
    user: {
      userId: 4,
      username: 'technology.staff',
      email: 'technology.staff@sunrichgroup.com',
      fullName: 'Kevin Dias',
      role: Role.STAFF,
    },
  },
  {
    username: 'technology.auditor',
    password: 'Viewer@2026!',
    user: {
      userId: 5,
      username: 'technology.auditor',
      email: 'technology.auditor@sunrichgroup.com',
      fullName: 'Mishal Ismail',
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
