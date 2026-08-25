import { Role } from '../core/models/enums';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Roles allowed to see the item. Empty = all authenticated users. */
  roles?: Role[];
  /** False while the module's backend is still being delivered. */
  implemented: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const ADMINS = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN];
const VACANCY_ROLES = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.MANAGER];

/**
 * Full application information architecture. Items flagged `implemented:false`
 * are visible (so the shell reflects the target IA) but route to a clearly
 * labelled "coming soon" screen until their module lands in a later build.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', icon: 'pi pi-th-large', route: '/dashboard', implemented: true },
      { label: 'Organogram', icon: 'pi pi-sitemap', route: '/organogram', implemented: true },
    ],
  },
  {
    title: 'Organisation',
    items: [
      { label: 'Workplaces', icon: 'pi pi-map', route: '/workplaces', implemented: true },
      { label: 'Workplace Admin', icon: 'pi pi-sliders-h', route: '/workplaces/offices', roles: ADMINS, implemented: true },
      { label: 'Companies', icon: 'pi pi-building', route: '/companies', roles: ADMINS, implemented: true },
      { label: 'Departments', icon: 'pi pi-briefcase', route: '/departments', roles: ADMINS, implemented: true },
      { label: 'Staff', icon: 'pi pi-users', route: '/staff', implemented: true },
      { label: 'Positions', icon: 'pi pi-id-card', route: '/positions', roles: ADMINS, implemented: true },
      { label: 'Vacancies', icon: 'pi pi-inbox', route: '/vacancies', roles: VACANCY_ROLES, implemented: true },
    ],
  },
  {
    title: 'Governance',
    items: [
      { label: 'Users & Roles', icon: 'pi pi-shield', route: '/users', roles: [Role.SUPER_ADMIN, Role.COMPANY_ADMIN], implemented: true },
      { label: 'Audit Log', icon: 'pi pi-history', route: '/audit', roles: ADMINS, implemented: true },
      { label: 'Notifications', icon: 'pi pi-bell', route: '/notifications', implemented: true },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'My Profile', icon: 'pi pi-user', route: '/profile', implemented: true },
      { label: 'Settings', icon: 'pi pi-cog', route: '/settings', roles: [Role.SUPER_ADMIN], implemented: true },
    ],
  },
];
