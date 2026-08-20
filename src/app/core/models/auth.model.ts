import { Role } from './enums';

export interface LoginRequest {
  username: string;
  password: string;
}

/** Codes the mock (and later the real API) can surface to the login UI. */
export type AuthErrorCode = 'INVALID_CREDENTIALS' | 'INACTIVE' | 'LOCKED' | 'GENERIC';

export interface AuthError {
  code: AuthErrorCode;
  message?: string;
}

export interface CurrentUser {
  userId: number;
  username: string;
  email: string;
  fullName?: string;
  role: Role;
  companyId?: number;
  companyIds?: number[];
  staffId?: number;
}

export interface LoginResponse {
  token: string;
  tokenType: string;
  expiresInMs: number;
  user: CurrentUser;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export type ChangePasswordErrorCode = 'INCORRECT_CURRENT_PASSWORD' | 'PASSWORD_REUSE' | 'UNAUTHENTICATED';

export interface ChangePasswordError {
  code: ChangePasswordErrorCode;
}

export interface UpdateProfileRequest {
  fullName: string;
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
