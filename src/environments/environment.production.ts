/**
 * Production environment points at the public Railway backend.
 */
export const environment = {
  production: true,
  apiUrl: 'https://oms-backend-local.up.railway.app/api',
  appName: 'Organogram Management System',
  appVersion: '1.0.0',
  tokenStorageKey: 'oms.auth.token',
};
