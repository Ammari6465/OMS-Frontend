import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkplaceAdmin } from './workplace-admin';
import { OrgDataService } from '../../core/data/org-data.service';
import { AuthService } from '../../core/services/auth.service';
import { Role } from '../../core/models/enums';

const office = { id: 2, version: 1, companyId: 10, companyName: 'Sunrich', name: 'Head Office', code: 'HO', city: 'Mumbai', country: 'India', timeZone: 'Asia/Calcutta', status: 'ACTIVE', isDeleted: false };
const archivedOffice = { ...office, id: 9, name: 'Closed Office', code: 'CO', isDeleted: true };
const building = { id: 3, version: 1, officeId: 2, officeName: 'Head Office', companyId: 10, name: 'Building A', code: 'A', status: 'ACTIVE', isDeleted: false };
const floor = { id: 7, version: 2, buildingId: 3, buildingName: 'Building A', officeId: 2, officeName: 'Head Office', companyId: 10, companyName: 'Sunrich', name: 'Floor 3', displayOrder: 3, hasPlan: true, planOriginalName: 'floor3.png', status: 'ACTIVE', isDeleted: false };
const zone = { id: 5, version: 1, floorId: 7, name: 'Finance Zone', code: 'FIN', colour: '#3366ff', status: 'ACTIVE', isDeleted: false };
const deskRow = {
  id: 100, version: 4, floorId: 7, code: 'F3-027', mode: 'ASSIGNED', availability: 'ASSIGNED', x: 10, y: 10, width: 4, height: 3, rotation: 0, capacity: 1, accessible: false, status: 'ACTIVE', isDeleted: false, zoneId: 5,
  assignment: { id: 900, version: 1, deskId: 100, deskCode: 'F3-027', floorId: 7, floorName: 'Floor 3', buildingName: 'Building A', officeName: 'Head Office', zoneName: 'Finance Zone', staffId: 55, staffName: 'Priya Sharma', departmentId: 4, departmentName: 'Finance', effectiveFrom: '2026-01-01', primaryAssignment: true },
};

describe('WorkplaceAdmin Component UI & Interactions', () => {
  let component: WorkplaceAdmin;
  let fixture: ComponentFixture<WorkplaceAdmin>;
  let http: HttpTestingController;
  let messages: MessageService;
  let router: any;
  let role = Role.SUPER_ADMIN;

  async function setup(tab = 'offices') {
    TestBed.resetTestingModule();
    router = { navigate: vi.fn().mockResolvedValue(true) };
    await TestBed.configureTestingModule({
      imports: [WorkplaceAdmin],
      providers: [
        MessageService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { tab } } } },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 1, role, companyId: 10 }) } },
        { provide: OrgDataService, useValue: { companyOptions: () => [{ label: 'Sunrich', value: 10 }] } },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    messages = TestBed.inject(MessageService);
    vi.spyOn(messages, 'add');
    fixture = TestBed.createComponent(WorkplaceAdmin);
    component = fixture.componentInstance;
  }

  function load(opts: { offices?: any[]; error?: boolean } = {}) {
    fixture.detectChanges();
    const offices = http.expectOne((r) => r.url.endsWith('/offices'));
    const buildings = http.expectOne((r) => r.url.endsWith('/buildings'));
    const floors = http.expectOne((r) => r.url.endsWith('/floors'));
    const zones = http.expectOne((r) => r.url.endsWith('/zones'));
    const desks = http.expectOne((r) => r.url.endsWith('/desks'));
    buildings.flush({ success: true, data: [building], timestamp: '' });
    floors.flush({ success: true, data: [floor], timestamp: '' });
    zones.flush({ success: true, data: [zone], timestamp: '' });
    desks.flush({ success: true, data: [deskRow], timestamp: '' });
    if (opts.error) offices.flush(null, { status: 500, statusText: 'Server Error' });
    else offices.flush({ success: true, data: opts.offices ?? [office], timestamp: '' });
    return { offices };
  }

  afterEach(() => { http.verify(); role = Role.SUPER_ADMIN; });

  it('opens on the tab named by the route', async () => {
    await setup('desks');
    load();
    expect(component.tab()).toBe('desks');
    expect(component.rows()).toHaveLength(1);
    expect(component.rows()[0].primary).toBe('F3-027');
  });

  it('renders each level of the hierarchy with its parent context', async () => {
    await setup();
    load();
    expect(component.rows()[0]).toMatchObject({ primary: 'Head Office', secondary: 'Sunrich' });
    component.selectTab('buildings');
    expect(component.rows()[0]).toMatchObject({ primary: 'Building A', secondary: 'Head Office' });
    component.selectTab('floors');
    expect(component.rows()[0]).toMatchObject({ primary: 'Floor 3', tertiary: 'floor3.png' });
    component.selectTab('zones');
    expect(component.rows()[0]).toMatchObject({ primary: 'Finance Zone', secondary: 'Building A · Floor 3' });
  });

  it('derives the assignments tab from active desk assignments', async () => {
    await setup();
    load();
    component.selectTab('assignments');
    expect(component.rows()).toHaveLength(1);
    expect(component.rows()[0]).toMatchObject({ primary: 'Priya Sharma', secondary: 'F3-027' });
  });

  it('shows a loading state and then an error state when the load fails', async () => {
    await setup();
    expect(component.loading()).toBe(false);
    load({ error: true });
    expect(component.loading()).toBe(false);
    expect(component.loadError()).toContain('Check your connection');
  });

  it('shows an empty state when nothing matches', async () => {
    await setup();
    load({ offices: [] });
    expect(component.rows()).toEqual([]);
    expect(component.loadError()).toBeNull();
  });

  it('filters by free text, status and office', async () => {
    await setup();
    load({ offices: [office, { ...office, id: 4, name: 'Branch Office', code: 'BO', status: 'INACTIVE' }] });
    expect(component.rows()).toHaveLength(2);
    component.search.set('branch');
    expect(component.rows().map((r: any) => r.primary)).toEqual(['Branch Office']);
    component.search.set('');
    component.statusFilter.set('INACTIVE');
    expect(component.rows().map((r: any) => r.primary)).toEqual(['Branch Office']);
    component.statusFilter.set(null);
    component.officeFilter.set(2);
    expect(component.rows().map((r: any) => r.primary)).toEqual(['Head Office']);
  });

  it('reloads with archived records when the toggle is switched on', async () => {
    await setup();
    load();
    component.toggleArchived(true);
    const req = http.expectOne((r) => r.url.endsWith('/offices') && r.params.get('includeDeleted') === 'true');
    req.flush({ success: true, data: [office, archivedOffice], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/buildings')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/zones')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/desks')).flush({ success: true, data: [], timestamp: '' });
    expect(component.rows().filter((r: any) => r.isDeleted)).toHaveLength(1);
  });

  it('reloads scoped to the chosen company', async () => {
    await setup();
    load();
    component.setCompany(10);
    expect(component.officeFilter()).toBeNull();
    http.expectOne((r) => r.url.endsWith('/offices') && r.params.get('companyId') === '10').flush({ success: true, data: [office], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/buildings')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/zones')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/desks')).flush({ success: true, data: [], timestamp: '' });
    expect(component.companyFilter()).toBe(10);
  });

  it('validates the create form before sending anything', async () => {
    await setup();
    load();
    component.openCreate();
    component.form.patchValue({ name: '', code: '' });
    component.submit();
    expect(component.formError()).toContain('Name is required');
    component.form.patchValue({ name: 'New Office' });
    component.submit();
    expect(component.formError()).toContain('Code is required');
    http.expectNone((r) => r.method === 'POST');
  });

  it('creates an office and refreshes the list', async () => {
    await setup();
    load();
    component.openCreate();
    component.form.patchValue({ companyId: 10, name: 'New Office', code: 'NO', timeZone: 'Asia/Calcutta' });
    component.submit();
    const req = http.expectOne((r) => r.url.endsWith('/offices') && r.method === 'POST');
    expect(req.request.body).toMatchObject({ companyId: 10, name: 'New Office', code: 'NO' });
    req.flush({ success: true, data: office, timestamp: '' });
    load();
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('sends the record version when editing so a stale write is rejected', async () => {
    await setup('floors');
    load();
    component.openEdit(component.rows()[0]);
    component.form.patchValue({ name: 'Floor 3 North' });
    component.submit();
    const req = http.expectOne((r) => r.url.endsWith('/floors/7') && r.method === 'PUT');
    expect(req.request.body).toMatchObject({ buildingId: 3, name: 'Floor 3 North', version: 2 });
    req.flush({ success: true, data: floor, timestamp: '' });
    load();
  });

  it('preserves desk geometry when a desk is edited from the table', async () => {
    await setup('desks');
    load();
    component.openEdit(component.rows()[0]);
    component.form.patchValue({ telephoneExtension: '4021' });
    component.submit();
    const req = http.expectOne((r) => r.url.endsWith('/desks/100') && r.method === 'PUT');
    expect(req.request.body).toMatchObject({ x: 10, y: 10, width: 4, height: 3, zoneId: 5, telephoneExtension: '4021', version: 4 });
    req.flush({ success: true, data: deskRow, timestamp: '' });
    load();
  });

  it('archives and restores after confirmation, and does nothing when cancelled', async () => {
    await setup();
    load();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    component.archive(component.rows()[0]);
    http.expectNone((r) => r.method === 'DELETE');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.archive(component.rows()[0]);
    http.expectOne((r) => r.url.endsWith('/offices/2') && r.method === 'DELETE').flush({ success: true, timestamp: '' });
    load();

    component.restore({ kind: 'offices', id: 9, primary: 'Closed Office' } as any);
    http.expectOne((r) => r.url.endsWith('/offices/9/restore') && r.method === 'PATCH').flush({ success: true, timestamp: '' });
    load();
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Restored' }));
  });

  it('releases a desk from the assignments tab', async () => {
    await setup();
    load();
    component.selectTab('assignments');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.releaseAssignment(component.rows()[0]);
    const req = http.expectOne((r) => r.url.endsWith('/assignments/900/release'));
    expect(req.request.body).toMatchObject({ version: 1 });
    req.flush({ success: true, data: {}, timestamp: '' });
    load();
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Desk released' }));
  });

  it('opens the floor map focused on the chosen desk', async () => {
    await setup('desks');
    load();
    component.viewOnMap(component.rows()[0]);
    expect(router.navigate).toHaveBeenCalledWith(['/workplaces/floors', 7, 'map'], { queryParams: { deskId: 100 } });
  });

  it('withholds management controls from non-administrators', async () => {
    role = Role.STAFF;
    await setup();
    load();
    expect(component.canManage()).toBe(false);
    expect(component.isSuperAdmin()).toBe(false);
  });
});
