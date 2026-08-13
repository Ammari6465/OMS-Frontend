import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactiveFormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { Profile } from './profile';
import { AuthService } from '../../core/services/auth.service';
import { OrgDataService } from '../../core/data/org-data.service';
import { UserAdminService } from '../../core/data/user-admin.service';
import { Role } from '../../core/models/enums';

describe('Profile Component UI & Workflows', () => {
  let component: Profile;
  let fixture: ComponentFixture<Profile>;
  let authServiceMock: any;
  let messageServiceMock: any;
  let orgDataMock: any;
  let userAdminMock: any;

  const mockUser = {
    userId: 1,
    username: 'john_doe',
    email: 'john@sunrichgroup.com',
    fullName: 'John Doe',
    role: Role.COMPANY_ADMIN,
    companyId: 10,
    staffId: 100,
  };

  beforeEach(async () => {
    authServiceMock = {
      currentUser: signal(mockUser),
      updateProfile: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
    };

    messageServiceMock = {
      add: vi.fn(),
    };

    orgDataMock = {
      staff: { snapshot: vi.fn().mockReturnValue([]) },
      companies: { snapshot: vi.fn().mockReturnValue([]) },
      departments: { snapshot: vi.fn().mockReturnValue([]) },
      positions: { snapshot: vi.fn().mockReturnValue([]) },
    };

    userAdminMock = {
      store: { snapshot: vi.fn().mockReturnValue([]) },
    };

    await TestBed.configureTestingModule({
      imports: [Profile, ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: MessageService, useValue: messageServiceMock },
        { provide: OrgDataService, useValue: orgDataMock },
        { provide: UserAdminService, useValue: userAdminMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Profile);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('[POSITIVE] renders authenticated user identity details', () => {
    expect(component.user()).toEqual(mockUser);
    expect(component.initials()).toBe('JD');
    expect(component.roleLabel()).toBe('Company Admin');
  });

  it('[POSITIVE] openEditProfile populates form controls', () => {
    component.openEditProfile();

    expect(component.editVisible).toBe(true);
    expect(component.editForm.value).toEqual({
      fullName: 'John Doe',
      email: 'john@sunrichgroup.com',
    });
  });

  it('[POSITIVE] saveProfile calls updateProfile service on valid form', () => {
    component.openEditProfile();
    component.editForm.patchValue({ fullName: 'Johnathan Doe', email: 'johnathan@sunrichgroup.com' });
    authServiceMock.updateProfile.mockReturnValue(of({ ...mockUser, fullName: 'Johnathan Doe' }));

    component.saveProfile();

    expect(authServiceMock.updateProfile).toHaveBeenCalledWith({
      fullName: 'Johnathan Doe',
      email: 'johnathan@sunrichgroup.com',
    });
    expect(messageServiceMock.add).toHaveBeenCalledWith({
      severity: 'success',
      summary: 'Profile updated',
      detail: 'Your personal information was saved successfully.',
    });
    expect(component.editVisible).toBe(false);
  });

  it('[NEGATIVE] saveProfile with invalid email address blocks submission', () => {
    component.openEditProfile();
    component.editForm.patchValue({ email: 'not-an-email' });

    component.saveProfile();

    expect(authServiceMock.updateProfile).not.toHaveBeenCalled();
    expect(component.editInvalid('email')).toBe(true);
  });

  it('[POSITIVE] password strength meter evaluates password rules', () => {
    component.openPasswordDialog();
    component.passwordForm.patchValue({ newPassword: 'Pass' });
    expect(component.passwordStrength()).toBe(1); // Meets 1 rule (uppercase)

    component.passwordForm.patchValue({ newPassword: 'StrongPassword#123' });
    expect(component.passwordStrength()).toBe(4); // Meets length (>=8), uppercase, number, special
    expect(component.strengthLabel()).toBe('Strong');
  });

  it('[POSITIVE] changePassword succeeds when current password is correct and new password is strong', () => {
    component.openPasswordDialog();
    component.passwordForm.patchValue({
      currentPassword: 'OldPassword123',
      newPassword: 'StrongPassword#123',
      confirmPassword: 'StrongPassword#123',
    });
    authServiceMock.changePassword.mockReturnValue(of(undefined));

    component.changePassword();

    expect(authServiceMock.changePassword).toHaveBeenCalledWith({
      currentPassword: 'OldPassword123',
      newPassword: 'StrongPassword#123',
    });
    expect(messageServiceMock.add).toHaveBeenCalledWith({
      severity: 'success',
      summary: 'Password changed',
      detail: 'Your password was updated successfully.',
    });
    expect(component.passwordVisible).toBe(false);
  });

  it('[NEGATIVE] changePassword fails when confirm password does not match new password', () => {
    component.openPasswordDialog();
    component.passwordForm.patchValue({
      currentPassword: 'OldPassword123',
      newPassword: 'StrongPassword#123',
      confirmPassword: 'DifferentPassword#123',
    });

    component.changePassword();

    expect(component.passwordForm.hasError('mismatch')).toBe(true);
    expect(authServiceMock.changePassword).not.toHaveBeenCalled();
  });

  it('[NEGATIVE] changePassword displays error banner when backend returns incorrect current password', () => {
    component.openPasswordDialog();
    component.passwordForm.patchValue({
      currentPassword: 'WrongPassword123',
      newPassword: 'StrongPassword#123',
      confirmPassword: 'StrongPassword#123',
    });
    authServiceMock.changePassword.mockReturnValue(
      throwError(() => ({ code: 'INCORRECT_CURRENT_PASSWORD' }))
    );

    component.changePassword();

    expect(component.passwordError()).toBe('The current password is incorrect.');
    expect(component.passwordSaving()).toBe(false);
  });
});
