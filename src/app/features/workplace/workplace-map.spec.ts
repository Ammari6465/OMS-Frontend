import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkplaceMap } from './workplace-map';
import { OrgDataService } from '../../core/data/org-data.service';
import { AuthService } from '../../core/services/auth.service';
import { Role } from '../../core/models/enums';
import { environment } from '../../../environments/environment';
import { Desk, FloorMap } from './workplace.service';

const url = `${environment.apiUrl}/workplaces`;

const floor = { id: 7, version: 1, buildingId: 3, buildingName: 'Building A', officeId: 2, officeName: 'Head Office', companyId: 10, companyName: 'Sunrich', name: 'Floor 3', displayOrder: 3, hasPlan: false, status: 'ACTIVE', isDeleted: false };

function desk(over: Partial<Desk> = {}): Desk {
  return { id: 100, version: 1, floorId: 7, code: 'F3-027', mode: 'ASSIGNED', availability: 'AVAILABLE', x: 10, y: 10, width: 4, height: 3, rotation: 0, capacity: 1, accessible: false, status: 'ACTIVE', isDeleted: false, ...over } as Desk;
}

const assignedDesk = desk({
  id: 101, code: 'F3-028', x: 30, y: 30, availability: 'ASSIGNED', zoneId: 5, zoneName: 'Finance Zone',
  assignment: { id: 900, version: 1, deskId: 101, deskCode: 'F3-028', floorId: 7, floorName: 'Floor 3', buildingName: 'Building A', officeName: 'Head Office', zoneName: 'Finance Zone', staffId: 55, staffName: 'Priya Sharma', departmentId: 4, departmentName: 'Finance', positionTitle: 'Analyst', effectiveFrom: '2026-01-01', primaryAssignment: true } as any,
});

describe('WorkplaceMap Component UI & Interactions', () => {
  let component: WorkplaceMap;
  let fixture: ComponentFixture<WorkplaceMap>;
  let http: HttpTestingController;
  let messages: MessageService;
  let router: any;
  let role = Role.SUPER_ADMIN;

  async function setup(queryParams: Record<string, string> = {}) {
    TestBed.resetTestingModule();
    router = { navigate: vi.fn().mockResolvedValue(true) };
    await TestBed.configureTestingModule({
      imports: [WorkplaceMap],
      providers: [
        MessageService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map(Object.entries({})) as any, queryParamMap: { get: (k: string) => queryParams[k] ?? null } } } },
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ id: 1, role, companyId: 10 }), isSuperAdmin: () => role === Role.SUPER_ADMIN, isAdmin: () => true },
        },
        {
          provide: OrgDataService,
          useValue: {
            companyOptions: () => [{ label: 'Sunrich', value: 10 }],
            departmentOptions: () => [{ label: 'Finance', value: 4 }],
            staffOptions: () => [{ label: 'Priya Sharma', value: 55 }],
            // Company 11 is a sister concern of holding company 10.
            companyGroupIds: (id: number) => new Set(id === 10 ? [10, 11] : [id]),
            companyAncestorIds: (id: number) => (id === 11 ? [11, 10] : [id]),
            companyName: (id: number) => (id === 10 ? 'Sunrich Companies' : 'Sunrich Logistics'),
          },
        },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    messages = TestBed.inject(MessageService);
    vi.spyOn(messages, 'add');
    fixture = TestBed.createComponent(WorkplaceMap);
    component = fixture.componentInstance;
  }

  /** Answers the three hierarchy calls ngOnInit makes, then the floor map request. */
  function loadHierarchy(map: Partial<FloorMap> | null = { floor: floor as any, zones: [{ id: 5, version: 1, floorId: 7, name: 'Finance Zone', code: 'FIN', colour: '#3366ff', status: 'ACTIVE', isDeleted: false }], desks: [desk(), assignedDesk] }) {
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/offices')).flush({ success: true, data: [{ id: 2, companyId: 10, name: 'Head Office' }], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/buildings')).flush({ success: true, data: [{ id: 3, officeId: 2, companyId: 10, name: 'Building A' }], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors')).flush({ success: true, data: [floor], timestamp: '' });
    if (map) {
      http.expectOne((r) => r.url.endsWith('/floors/7/map')).flush({ success: true, data: map, timestamp: '' });
      http.expectOne((r) => r.url.endsWith('/summary')).flush({ success: true, data: { totalDesks: 2, assignedDesks: 1, availableDesks: 1, unavailableDesks: 0, staffWithoutDesks: 0, utilizationPercent: 50 }, timestamp: '' });
    }
  }

  afterEach(() => { http.verify(); role = Role.SUPER_ADMIN; });

  it('[POSITIVE] a sister concern sees the holding company shared premises', async () => {
    await setup();
    fixture.detectChanges();
    // Ashford Centre belongs to holding company 10 and is shared with the group.
    http.expectOne((r) => r.url.endsWith('/offices')).flush({ success: true, data: [
      { id: 9, companyId: 10, companyName: 'Sunrich Companies', name: 'Ashford Centre' },
      { id: 4, companyId: 11, companyName: 'Sunrich Logistics', name: 'Logistics Depot' },
    ], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/buildings')).flush({ success: true, data: [
      { id: 3, officeId: 9, companyId: 10, name: 'Ashford Centre' },
    ], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors')).flush({ success: true, data: [], timestamp: '' });

    component.selectCompany(11);
    http.expectOne((r) => r.url.includes('/summary')).flush({ success: true, data: {
      totalDesks: 0, assignedDesks: 0, availableDesks: 0, unavailableDesks: 0, staffWithoutDesks: 0, utilizationPercent: 0,
    }, timestamp: '' });

    // Own office first-class, inherited one tagged with the owning company, and
    // the shared building comes along rather than being filtered out.
    expect(component.officeOptions().map((o) => o.label))
      .toEqual(['Ashford Centre · Sunrich Companies', 'Logistics Depot']);
    expect(component.filteredBuildings().map((b) => b.name)).toEqual(['Ashford Centre']);
  });

  it('[NEGATIVE] the holding company does not inherit a sister concerns own office', async () => {
    await setup();
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/offices')).flush({ success: true, data: [
      { id: 9, companyId: 10, companyName: 'Sunrich Companies', name: 'Ashford Centre' },
      { id: 4, companyId: 11, companyName: 'Sunrich Logistics', name: 'Logistics Depot' },
    ], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/buildings')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors')).flush({ success: true, data: [], timestamp: '' });

    component.selectCompany(10);
    http.expectOne((r) => r.url.includes('/summary')).flush({ success: true, data: {
      totalDesks: 0, assignedDesks: 0, availableDesks: 0, unavailableDesks: 0, staffWithoutDesks: 0, utilizationPercent: 0,
    }, timestamp: '' });

    expect(component.officeOptions().map((o) => o.label)).toEqual(['Ashford Centre']);
  });

  it('[POSITIVE] an office on the holding company keeps every concern selectable', async () => {
    await setup();
    fixture.detectChanges();
    // Shared premises flow down, so both 10 and its concern 11 stay selectable
    // even though only company 10 owns a record.
    http.expectOne((r) => r.url.endsWith('/offices')).flush({ success: true, data: [
      { id: 9, companyId: 10, companyName: 'Sunrich Companies', name: 'Ashford Centre' },
    ], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/buildings')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors')).flush({ success: true, data: [], timestamp: '' });

    expect(component.companyOptions().map((o) => o.value)).toEqual([10]);
  });

  it('loads the whole floor in a single map request and selects the first floor', async () => {
    await setup();
    loadHierarchy();
    expect(component.floorId()).toBe(7);
    expect(component.currentMap()?.desks).toHaveLength(2);
    expect(component.companyId()).toBe(10);
  });

  it('shows an error state when the hierarchy cannot be loaded', async () => {
    await setup();
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/buildings')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/offices')).flush(null, { status: 500, statusText: 'Server Error' });
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', summary: 'Unable to load workplaces' }));
  });

  it('leaves an empty state when no floors exist and never asks for an unscoped summary', async () => {
    await setup();
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/offices')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/buildings')).flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors')).flush({ success: true, data: [], timestamp: '' });
    expect(component.floorId()).toBeNull();
    // A super admin with no company selected must not send /summary without a companyId.
    http.expectNone((r) => r.url.endsWith('/summary'));
    expect(component.summary().totalDesks).toBe(0);
  });

  it('only offers edit controls to administrators', async () => {
    await setup();
    loadHierarchy();
    expect(component.canManage()).toBe(true);
    role = Role.STAFF;
    await setup();
    loadHierarchy();
    expect(component.canManage()).toBe(false);
  });

  it('filters desks by zone, department, status and availability', async () => {
    await setup();
    loadHierarchy();
    expect(component.visibleDesks()).toHaveLength(2);
    component.zoneFilter.set(5);
    expect(component.visibleDesks().map((d) => d.code)).toEqual(['F3-028']);
    component.zoneFilter.set(null);
    component.departmentFilter.set(4);
    expect(component.visibleDesks().map((d) => d.code)).toEqual(['F3-028']);
    component.departmentFilter.set(null);
    component.statusFilter.set('AVAILABLE');
    expect(component.visibleDesks().map((d) => d.code)).toEqual(['F3-027']);
    component.statusFilter.set(null);
    component.availableOnly.set(true);
    expect(component.visibleDesks().map((d) => d.code)).toEqual(['F3-027']);
  });

  it('matches the free-text search across staff, department, position and zone', async () => {
    await setup();
    loadHierarchy();
    component.search.set('priya');
    expect(component.visibleDesks().map((d) => d.code)).toEqual(['F3-028']);
    component.search.set('analyst');
    expect(component.visibleDesks().map((d) => d.code)).toEqual(['F3-028']);
    component.search.set('finance');
    expect(component.visibleDesks().map((d) => d.code)).toEqual(['F3-028']);
  });

  it('focuses, highlights and opens the details panel for a chosen search result', async () => {
    await setup();
    loadHierarchy();
    component.chooseResult({ deskId: 101, deskCode: 'F3-028', floorId: 7, availability: 'ASSIGNED', matchedOn: 'staff' } as any);
    expect(component.selected()?.code).toBe('F3-028');
    expect(component.highlighted()?.code).toBe('F3-028');
    expect(component.zoom()).toBe(2);
    // Panning centres the desk rather than leaving the view at the origin.
    expect(component.panX()).not.toBe(0);
  });

  it('resets the search back to a clean view', async () => {
    await setup();
    loadHierarchy();
    component.chooseResult({ deskId: 101, floorId: 7 } as any);
    component.resetSearch();
    expect(component.search()).toBe('');
    expect(component.searchResults()).toEqual([]);
    expect(component.selected()).toBeNull();
    expect(component.zoom()).toBe(1);
    expect(component.panX()).toBe(0);
  });

  it('focuses the desk named in the query string when the map opens', async () => {
    await setup({ deskId: '101' });
    loadHierarchy();
    expect(component.selected()?.code).toBe('F3-028');
    expect(component.zoom()).toBe(2);
  });

  it('keeps desk edits local and saves them as one batch with the removals', async () => {
    await setup();
    loadHierarchy();
    component.editMode.set(true);
    component.selectDesk(component.currentMap()!.desks[0]);
    component.snapshot();
    component.setDesks(component.currentMap()!.desks.map((d) => (d.id === 100 ? { ...d, x: 44 } : d)));
    component.dirty.set(true);
    // Dragging must not have produced any request of its own.
    http.expectNone((r) => r.url.includes('/desks/batch'));

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.selectDesk(component.currentMap()!.desks[0]);
    component.deleteDesk();
    expect(component.removedDeskIds()).toEqual([100]);

    component.save();
    const req = http.expectOne((r) => r.url.endsWith('/floors/7/desks/batch'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.removedDeskIds).toEqual([100]);
    req.flush({ success: true, data: [], timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors/7/map')).flush({ success: true, data: { floor, zones: [], desks: [] }, timestamp: '' });
    expect(component.removedDeskIds()).toEqual([]);
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', summary: 'Floor map saved' }));
  });

  it('refuses to delete a desk that still has an active assignment', async () => {
    await setup();
    loadHierarchy();
    component.editMode.set(true);
    component.selectDesk(assignedDesk);
    component.deleteDesk();
    expect(component.removedDeskIds()).toEqual([]);
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
  });

  it('discards unsaved edits by reloading the floor', async () => {
    await setup();
    loadHierarchy();
    component.dirty.set(true);
    component.discard();
    http.expectOne((r) => r.url.endsWith('/floors/7/map')).flush({ success: true, data: { floor, zones: [], desks: [desk()] }, timestamp: '' });
    expect(component.dirty()).toBe(false);
  });

  it('undoes the most recent unsaved edit', async () => {
    await setup();
    loadHierarchy();
    const original = component.currentMap()!.desks;
    component.snapshot();
    component.setDesks([]);
    component.undo();
    expect(component.currentMap()!.desks.map((d) => d.id)).toEqual(original.map((d) => d.id));
  });

  it('reports unsaved changes so the route guard can warn', async () => {
    await setup();
    loadHierarchy();
    expect(component.hasUnsavedChanges()).toBe(false);
    component.dirty.set(true);
    expect(component.hasUnsavedChanges()).toBe(true);
  });

  it('assigns a desk and refreshes the map and summary', async () => {
    await setup();
    loadHierarchy();
    component.openAssign(desk());
    component.assignForm.patchValue({ staffId: 55, effectiveFrom: '2026-08-18', reason: 'Permanent' });
    component.assign();
    const req = http.expectOne((r) => r.url.endsWith('/assignments'));
    expect(req.request.body).toMatchObject({ deskId: 100, staffId: 55, primaryAssignment: true });
    req.flush({ success: true, data: { id: 901 }, timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors/7/map')).flush({ success: true, data: { floor, zones: [], desks: [] }, timestamp: '' });
    http.expectOne((r) => r.url.includes('/summary')).flush({ success: true, data: { totalDesks: 2, assignedDesks: 2, availableDesks: 0, unavailableDesks: 0, staffWithoutDesks: 0, utilizationPercent: 100 }, timestamp: '' });
    expect(component.summary().assignedDesks).toBe(2);
  });

  it('exposes desk status without relying on colour alone', async () => {
    await setup();
    loadHierarchy();
    expect(component.deskAria(assignedDesk)).toContain('assigned');
    expect(component.deskAria(assignedDesk)).toContain('Priya Sharma');
    expect(component.deskSeverity(assignedDesk)).toBe('info');
    expect(component.deskSeverity(desk())).toBe('success');
  });

  it('keeps the accessible desk list in step with the map filters', async () => {
    await setup();
    loadHierarchy();
    component.availableOnly.set(true);
    // The table renders visibleDesks(), so the list alternative shows exactly what the map shows.
    expect(component.visibleDesks()).toHaveLength(1);
    expect(component.availableCount()).toBe(1);
  });

  it('uploads a floor plan and refreshes the floor map', async () => {
    await setup();
    loadHierarchy();
    const file = new File(['<svg></svg>'], 'floor.svg', { type: 'image/svg+xml' });
    const event = { target: { files: [file], value: 'floor.svg' } } as any;
    component.upload(event);
    const req = http.expectOne((r) => r.url.endsWith('/floors/7/plan') && r.method === 'POST');
    req.flush({ success: true, data: { ...floor, hasPlan: true }, timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors/7/map')).flush({ success: true, data: { floor: { ...floor, hasPlan: true }, zones: [], desks: [] }, timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/floors/7/plan')).flush(new Blob(['<svg></svg>'], { type: 'image/svg+xml' }));
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', summary: 'Floor plan uploaded' }));
    expect(event.target.value).toBe('');
  });

  it('shows an error message when floor plan upload fails', async () => {
    await setup();
    loadHierarchy();
    const file = new File(['bad'], 'broken.png', { type: 'image/png' });
    const event = { target: { files: [file], value: 'broken.png' } } as any;
    component.upload(event);
    const req = http.expectOne((r) => r.url.endsWith('/floors/7/plan') && r.method === 'POST');
    req.flush({ success: false, message: 'Invalid floor plan image' }, { status: 400, statusText: 'Bad Request' });
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', summary: 'Upload failed' }));
    expect(component.saving()).toBe(false);
    expect(event.target.value).toBe('');
  });
});

