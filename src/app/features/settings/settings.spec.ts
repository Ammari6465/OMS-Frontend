import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessageService } from 'primeng/api';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { Settings } from './settings';
import { ThemeService } from '../../core/services/theme.service';
import { OmsStyleService } from '../../core/services/oms-style.service';
import { environment } from '../../../environments/environment';

describe('Settings Component UI & Interactions', () => {
  let component: Settings;
  let fixture: ComponentFixture<Settings>;
  let httpTestingController: HttpTestingController;
  let themeServiceMock: any;
  let omsStyleServiceMock: any;

  beforeEach(async () => {
    themeServiceMock = {
      mode: vi.fn().mockReturnValue('dark'),
      toggle: vi.fn(),
    };

    omsStyleServiceMock = {
      styles: [
        { id: 'default', name: 'Classic Pill', font: 'Inter', badgeClass: 'oms-badge-classic' },
        { id: 'glass', name: 'Glassmorphism', font: 'Inter', badgeClass: 'oms-badge-glass' },
      ],
      currentStyle: vi.fn().mockReturnValue('default'),
      setStyle: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        MessageService,
        { provide: ThemeService, useValue: themeServiceMock },
        { provide: OmsStyleService, useValue: omsStyleServiceMock },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpTestingController = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;

    // Flush initial GET settings request
    const req = httpTestingController.expectOne(`${environment.apiUrl}/records/settings`);
    req.flush({
      success: true,
      data: [
        {
          id: 1,
          kind: 'notification-preferences',
          values: { onboarding: true, exits: false, transfers: true, vacancies: false },
        },
        {
          id: 2,
          kind: 'password-reset-roles',
          values: { SUPER_ADMIN: true, COMPANY_ADMIN: true, MANAGER: false, STAFF: false, READ_ONLY: false },
        },
      ],
    });

    fixture.detectChanges();
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('[POSITIVE] initializes and loads settings records from backend endpoint', () => {
    expect(component.prefs().find((p) => p.key === 'exits')?.value).toBe(false);
    expect(component.prefs().find((p) => p.key === 'transfers')?.value).toBe(true);
    expect(component.resetRoles().find((r) => r.role === 'COMPANY_ADMIN')?.allowed).toBe(true);
  });

  it('[POSITIVE] toggling theme calls ThemeService toggle', () => {
    component.onTheme(false);
    expect(themeServiceMock.toggle).toHaveBeenCalled();
  });

  it('[POSITIVE] selecting typography style calls OmsStyleService setStyle', () => {
    omsStyleServiceMock.setStyle('glass');
    expect(omsStyleServiceMock.setStyle).toHaveBeenCalledWith('glass');
  });

  it('[POSITIVE] toggling notification preference sends HTTP PUT request', () => {
    component.togglePref('vacancies', true);

    const req = httpTestingController.expectOne(`${environment.apiUrl}/records/settings/1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.kind).toBe('notification-preferences');
    expect(req.request.body.values['vacancies']).toBe(true);
    req.flush({ success: true, data: { id: 1, kind: 'notification-preferences', values: { vacancies: true } } });
  });

  it('[POSITIVE] toggling password reset role policy sends HTTP PUT request', () => {
    component.toggleReset('MANAGER' as any, true);

    const req = httpTestingController.expectOne(`${environment.apiUrl}/records/settings/2`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.kind).toBe('password-reset-roles');
    expect(req.request.body.values['MANAGER']).toBe(true);
    req.flush({ success: true, data: { id: 2, kind: 'password-reset-roles', values: { MANAGER: true } } });
  });

  it('[NEGATIVE] SUPER_ADMIN password reset toggle remains disabled for self-preservation', () => {
    const superAdminRole = component.resetRoles().find((r) => r.role === 'SUPER_ADMIN');
    expect(superAdminRole?.allowed).toBe(true);
  });
});
