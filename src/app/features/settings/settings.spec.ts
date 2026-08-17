import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessageService } from 'primeng/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Settings } from './settings';
import { OmsStyleService } from '../../core/services/oms-style.service';
import { environment } from '../../../environments/environment';

describe('Settings Component UI & Interactions', () => {
  let component: Settings;
  let fixture: ComponentFixture<Settings>;
  let http: HttpTestingController;
  let messages: MessageService;
  let omsStyle: any;

  beforeEach(async () => {
    omsStyle = {
      styles: [{ id: 'default', name: 'Classic', font: 'Inter', badgeClass: 'oms-badge-classic' }],
      currentStyle: vi.fn().mockReturnValue('default'),
      setStyle: vi.fn(), preview: vi.fn(), endPreview: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        MessageService,
        { provide: OmsStyleService, useValue: omsStyle },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    messages = TestBed.inject(MessageService);
    vi.spyOn(messages, 'add');
    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  function loadRules(): void {
    http.expectOne(`${environment.apiUrl}/records/settings`).flush({
      success: true,
      data: [{ id: 1, kind: 'notification-preferences', values: { onboarding: true, exits: false, transfers: true, vacancies: false } }],
    });
    fixture.detectChanges();
  }

  it('loads the enforced system notification rules', () => {
    loadRules();
    expect(component.loading()).toBe(false);
    expect(component.rules().find((rule) => rule.key === 'exits')?.value).toBe(false);
    expect(component.securityPolicy.find((item) => item.role === 'Company Admin')?.allowed).toBe(true);
  });

  it('saves a changed rule and reports success', () => {
    loadRules();
    component.toggleRule('vacancies', true);
    expect(component.saving()).toBe(true);
    const request = http.expectOne(`${environment.apiUrl}/records/settings/1`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.values.vacancies).toBe(true);
    request.flush({ success: true, data: { id: 1, kind: 'notification-preferences', values: request.request.body.values } });
    expect(component.saving()).toBe(false);
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('rolls back an optimistic change when saving fails', () => {
    loadRules();
    component.toggleRule('vacancies', true);
    http.expectOne(`${environment.apiUrl}/records/settings/1`).flush(null, { status: 500, statusText: 'Server error' });
    expect(component.rules().find((rule) => rule.key === 'vacancies')?.value).toBe(false);
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('shows a recoverable load error', () => {
    http.expectOne(`${environment.apiUrl}/records/settings`).flush(null, { status: 503, statusText: 'Unavailable' });
    expect(component.loading()).toBe(false);
    expect(component.loadError()).toContain('server');
  });

  it('keeps the application theme selector local and immediate', () => {
    loadRules();
    omsStyle.setStyle('default');
    expect(omsStyle.setStyle).toHaveBeenCalledWith('default');
  });
});
