import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { Login } from './login';
import { AuthService } from '../../../core/services/auth.service';
import { OrgDataService } from '../../../core/data/org-data.service';
import { NotificationService } from '../../../core/data/notification.service';
import { Role } from '../../../core/models/enums';

describe('Login Component UI & Form Workflow', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let authServiceMock: any;
  let routerMock: any;
  let orgDataMock: any;
  let notificationMock: any;

  const mockUser = {
    userId: 1,
    username: 'superadmin',
    email: 'admin@sunrichgroup.com',
    role: Role.SUPER_ADMIN,
    fullName: 'Super Admin',
  };

  beforeEach(async () => {
    authServiceMock = {
      login: vi.fn(),
    };
    routerMock = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };
    orgDataMock = {
      init: vi.fn().mockReturnValue(of(null)),
    };
    notificationMock = {
      init: vi.fn().mockReturnValue(of(null)),
    };

    await TestBed.configureTestingModule({
      imports: [Login, ReactiveFormsModule],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: OrgDataService, useValue: orgDataMock },
        { provide: NotificationService, useValue: notificationMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => (key === 'reason' ? null : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('[POSITIVE] initializes form with empty controls', () => {
    expect(component.form.value).toEqual({
      username: '',
      password: '',
      rememberMe: false,
    });
    expect(component.form.valid).toBe(false);
  });

  it('[NEGATIVE] submitting empty form marks all fields as touched and blocks submit', () => {
    component.submit();
    expect(component.form.controls.username.touched).toBe(true);
    expect(component.form.controls.password.touched).toBe(true);
    expect(authServiceMock.login).not.toHaveBeenCalled();
  });

  it('[POSITIVE] fillDemo populates username and password', () => {
    component.fillDemo('superadmin', 'Admin@12345');
    expect(component.form.value.username).toBe('superadmin');
    expect(component.form.value.password).toBe('Admin@12345');
    expect(component.error()).toBeNull();
  });

  it('[POSITIVE] successful submit calls auth service and redirects to dashboard', () => {
    component.fillDemo('superadmin', 'Admin@12345');
    authServiceMock.login.mockReturnValue(of(mockUser));

    component.submit();

    expect(authServiceMock.login).toHaveBeenCalledWith(
      { username: 'superadmin', password: 'Admin@12345' },
      false
    );
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('[NEGATIVE] invalid credentials displays error alert message', () => {
    component.fillDemo('superadmin', 'WrongPassword');
    authServiceMock.login.mockReturnValue(
      throwError(() => ({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }))
    );

    component.submit();

    expect(component.error()).toEqual({
      summary: 'Invalid credentials',
      detail: 'Invalid username or password. Please check your credentials and try again.',
    });
    expect(component.loading()).toBe(false);
  });

  it('[NEGATIVE] inactive user account displays inactive error message', () => {
    component.fillDemo('inactive_user', 'Password123');
    authServiceMock.login.mockReturnValue(
      throwError(() => ({ code: 'INACTIVE', message: 'Account inactive' }))
    );

    component.submit();

    expect(component.error()).toEqual({
      summary: 'Account inactive',
      detail: 'Your account is currently inactive. Please contact your administrator.',
    });
  });
});
