import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { Role } from './core/models/enums';
import { unsavedWorkplaceGuard } from './features/workplace/unsaved-workplace.guard';

const ADMINS = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN];

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

  // ---- Public / guest-only auth area ----
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./layout/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      { path: 'login', loadComponent: () => import('./features/auth/login/login').then((m) => m.Login) },
      {
        path: 'forgot-password',
        loadComponent: () => import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
      },
      {
        path: 'reset-password',
        loadComponent: () => import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
      },
    ],
  },

  // ---- Authenticated application shell ----
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      {
        path: 'dashboard',
        data: { breadcrumb: 'Dashboard' },
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'profile',
        data: { breadcrumb: 'My Profile' },
        loadComponent: () => import('./features/profile/profile').then((m) => m.Profile),
      },

      // ---- Modules delivered in subsequent builds (placeholder screens) ----
      {
        path: 'organogram',
        data: { breadcrumb: 'Organogram' },
        loadComponent: () => import('./features/organogram/organogram-viewer').then((m) => m.OrganogramViewer),
      },
      {
        path: 'companies',
        canActivate: [roleGuard(ADMINS)],
        data: { breadcrumb: 'Companies' },
        loadComponent: () => import('./features/company/company-list').then((m) => m.CompanyList),
      },
      {
        path: 'departments',
        data: { breadcrumb: 'Departments' },
        loadComponent: () => import('./features/department/department-list').then((m) => m.DepartmentList),
      },
      {
        path: 'staff',
        data: { breadcrumb: 'Staff' },
        loadComponent: () => import('./features/staff/staff-list').then((m) => m.StaffList),
      },
      {
        path: 'positions',
        canActivate: [roleGuard(ADMINS)],
        data: { breadcrumb: 'Positions' },
        loadComponent: () => import('./features/position/position-list').then((m) => m.PositionList),
      },
      {
        path: 'vacancies',
        canActivate: [roleGuard(ADMINS)],
        data: { breadcrumb: 'Vacancies' },
        loadComponent: () => import('./features/vacancy/vacancy-list').then((m) => m.VacancyList),
      },
      {
        path: 'workplaces',
        data: { breadcrumb: 'Workplaces' },
        loadComponent: () => import('./features/workplace/workplace-map').then((m) => m.WorkplaceMap),
      },
      {
        path: 'workplaces/offices',
        canActivate: [roleGuard(ADMINS)],
        data: { breadcrumb: 'Workplace Administration', tab: 'offices' },
        loadComponent: () => import('./features/workplace/workplace-admin').then((m) => m.WorkplaceAdmin),
      },
      {
        path: 'workplaces/desks',
        canActivate: [roleGuard(ADMINS)],
        data: { breadcrumb: 'Desks', tab: 'desks' },
        loadComponent: () => import('./features/workplace/workplace-admin').then((m) => m.WorkplaceAdmin),
      },
      {
        path: 'workplaces/floors/:floorId/map',
        data: { breadcrumb: 'Floor Map' },
        canDeactivate: [unsavedWorkplaceGuard],
        loadComponent: () => import('./features/workplace/workplace-map').then((m) => m.WorkplaceMap),
      },
      {
        path: 'users',
        canActivate: [roleGuard(ADMINS)],
        data: { breadcrumb: 'Users & Roles', title: 'Users & Roles', icon: 'pi pi-shield' },
        loadComponent: () => import('./features/users/user-list').then((m) => m.UserList),
      },
      {
        path: 'audit',
        canActivate: [roleGuard(ADMINS)],
        data: { breadcrumb: 'Audit Log' },
        loadComponent: () => import('./features/audit/audit-log').then((m) => m.AuditLog),
      },
      {
        path: 'notifications',
        data: { breadcrumb: 'Notifications' },
        loadComponent: () => import('./features/notifications/notification-center').then((m) => m.NotificationCenter),
      },
      {
        path: 'settings',
        canActivate: [roleGuard([Role.SUPER_ADMIN])],
        data: { breadcrumb: 'Settings', title: 'Settings', icon: 'pi pi-cog' },
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
      },
      {
        path: 'forbidden',
        data: { breadcrumb: 'Access Denied' },
        loadComponent: () => import('./features/errors/forbidden').then((m) => m.Forbidden),
      },
    ],
  },

  // ---- 404 ----
  { path: '**', loadComponent: () => import('./features/errors/not-found').then((m) => m.NotFound) },
];
