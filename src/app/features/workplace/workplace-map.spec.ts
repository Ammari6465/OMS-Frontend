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
import { Desk, DetectedObject, FloorMap } from './workplace.service';

const url = `${environment.apiUrl}/workplaces`;

const floor = { id: 7, version: 1, buildingId: 3, buildingName: 'Building A', officeId: 2, officeName: 'Head Office', companyId: 10, companyName: 'Sunrich', name: 'Floor 3', displayOrder: 3, hasPlan: false, status: 'ACTIVE', isDeleted: false };

function desk(over: Partial<Desk> = {}): Desk {
  return { id: 100, version: 1, floorId: 7, code: 'F3-027', mode: 'ASSIGNED', availability: 'AVAILABLE', x: 10, y: 10, width: 4, height: 3, rotation: 0, capacity: 1, accessible: false, status: 'ACTIVE', isDeleted: false, ...over } as Desk;
}

function recognised(over: Partial<DetectedObject> = {}): DetectedObject {
  return { id: 1, floorId: 7, type: 'DESK', code: 'A01', polygon: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }], bbox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, center: { x: 0.15, y: 0.15 }, rotation: 0, area: 0.005, confidence: 0.9, source: 'AUTO', version: 0, ...over } as DetectedObject;
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

  afterEach(() => {
    // Opening a floor also fetches its recognised objects. Tests that are not
    // about detection simply answer it with an empty overlay set.
    http.match((r) => r.url.endsWith('/objects'))
      .forEach((r) => r.flush({ success: true, data: [], timestamp: '' }));
    // Startup also asks what the detection engines can read, so the scan button
    // can explain itself. Answer with the SVG-only default.
    http.match((r) => r.url.endsWith('/detection/status'))
      .forEach((r) => r.flush({ success: true, data: { detector: 'heuristic:svg', available: true, visionConfigured: false, readableMediaTypes: ['image/svg+xml'] }, timestamp: '' }));
    http.verify();
    role = Role.SUPER_ADMIN;
  });

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

  it('[POSITIVE] renders recognised objects and hides them by layer', async () => {
    await setup();
    loadHierarchy();
    const detected = [
      { id: 1, floorId: 7, type: 'DESK', code: 'A01', polygon: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }], bbox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, center: { x: 0.15, y: 0.15 }, rotation: 0, area: 0.005, confidence: 0.9, source: 'AUTO', version: 0 },
      { id: 2, floorId: 7, type: 'CONFERENCE_ROOM', name: 'Conference Room A', polygon: [{ x: 0.5, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.3 }], bbox: { x: 0.5, y: 0.1, width: 0.3, height: 0.2 }, center: { x: 0.65, y: 0.2 }, rotation: 0, area: 0.03, confidence: 0.8, source: 'AUTO', version: 0 },
    ];
    http.expectOne((r) => r.url.endsWith('/floors/7/objects')).flush({ success: true, data: detected, timestamp: '' });

    expect(component.visibleObjects().map((o) => o.id)).toEqual([1, 2]);
    expect(component.objectColour(component.detected()[0])).toBe('#3b82f6');
    expect(component.objectLabel(component.detected()[1])).toBe('Conference Room A');
    expect(component.deskCandidates()).toBe(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('g.detected text')?.textContent).toContain('A01');

    // Switching the desks layer off leaves the room visible.
    component.toggleLayer('desks');
    expect(component.layerVisible('desks')).toBe(false);
    expect(component.visibleObjects().map((o) => o.id)).toEqual([2]);
  });

  it('[POSITIVE] edits the name, code, and type of any recognised object', async () => {
    await setup();
    loadHierarchy();
    const original = recognised();
    http.expectOne((r) => r.url.endsWith('/floors/7/objects') && r.method === 'GET')
      .flush({ success: true, data: [original], timestamp: '' });

    component.selectDesk(desk());
    component.selectObject(original);
    expect(component.selected()).toBeNull();
    component.editDetectedObject(original);
    component.detectedForm.setValue({ name: 'Priya Desk', code: 'p-01', type: 'CABIN', x: 20, y: 25, width: 15, height: 12, rotation: 30 });
    component.saveDetectedObject();

    const request = http.expectOne((r) => r.url.endsWith('/floors/7/objects') && r.method === 'PUT');
    expect(request.request.body).toEqual({ objects: [{
      id: 1, type: 'CABIN', name: 'Priya Desk', code: 'P-01',
      polygon: '0.2,0.25 0.35,0.25 0.35,0.37 0.2,0.37', rotation: 30, ocrText: null,
    }], removedIds: [] });
    const updated = recognised({ name: 'Priya Desk', code: 'P-01', type: 'CABIN', source: 'EDITED' });
    request.flush({ success: true, data: [updated], timestamp: '' });

    expect(component.selectedObject()?.name).toBe('Priya Desk');
    expect(component.objectLabel(component.detected()[0])).toBe('Priya Desk');
    expect(component.detectedEditVisible).toBe(false);
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', summary: 'Map object updated' }));
  });

  it('[POSITIVE] lets an admin rename a desk and shows that name on the map', async () => {
    await setup();
    loadHierarchy();
    const target = component.currentMap()!.desks[0];

    component.editDesk(target);
    component.deskForm.patchValue({ displayName: 'Priya Window Desk' });
    component.applyDeskForm();

    const renamed = component.currentMap()!.desks[0];
    expect(renamed.displayName).toBe('Priya Window Desk');
    expect(component.deskMapLabel(renamed)).toBe('Priya Window…');
    expect(component.deskAria(renamed)).toContain('Priya Window Desk');
    expect(component.dirty()).toBe(true);
  });

  it('[POSITIVE] generates the required zone code instead of sending an invalid request', async () => {
    await setup();
    loadHierarchy();
    component.openEntity('zone');
    component.entityForm.controls.name.setValue('Main Walkway');
    component.onEntityNameInput();

    expect(component.entityForm.controls.code.value).toBe('MAIN-WALKWAY');
    expect(component.canCreateEntity()).toBe(true);
    const reload = vi.spyOn(component, 'loadHierarchy').mockImplementation(() => undefined);
    component.createEntity();
    const create = http.expectOne((r) => r.url.endsWith('/zones') && r.method === 'POST');
    expect(create.request.body).toEqual({ floorId: 7, name: 'Main Walkway', code: 'MAIN-WALKWAY', colour: '#64748b', status: 'ACTIVE' });
    create.flush({ success: true, data: { id: 66, floorId: 7, name: 'Main Walkway', code: 'MAIN-WALKWAY', colour: '#64748b' }, timestamp: '' });

    expect(component.entityVisible).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('[POSITIVE] promoting detected desks reloads the map and the overlays', async () => {
    await setup();
    loadHierarchy();
    http.expectOne((r) => r.url.endsWith('/floors/7/objects')).flush({ success: true, data: [], timestamp: '' });

    component.promoteDesks();

    http.expectOne((r) => r.url.endsWith('/objects/promote-desks'))
      .flush({ success: true, data: { created: 12, skipped: 0, deskIds: [] }, timestamp: '' });
    // Both the overlay set and the desk layer are refreshed, since promotion
    // creates real desks and stamps the detections with their new desk ids.
    expect(http.match((r) => r.url.endsWith('/floors/7/objects')).length).toBe(1);
    expect(http.match((r) => r.url.endsWith('/floors/7/map')).length).toBe(1);
  });

  it('[POSITIVE] auto-build creates detected desks and rooms without another admin step', async () => {
    await setup();
    loadHierarchy();
    http.expectOne((r) => r.url.endsWith('/floors/7/objects')).flush({ success: true, data: [], timestamp: '' });
    const promoteDesks = vi.spyOn(component, 'promoteDesks').mockImplementation(() => undefined);
    const promoteRooms = vi.spyOn(component, 'promoteRooms').mockImplementation(() => undefined);

    component.runDetection(false, true);
    const scan = http.expectOne((r) => r.url.endsWith('/floors/7/detect') && r.method === 'POST');
    scan.flush({ success: true, data: {
      floorId: 7, detector: 'vision', detected: 2, preserved: 0,
      objects: [recognised(), recognised({ id: 2, type: 'MEETING_ROOM', code: 'MR-01' })],
      message: 'Detected 2 objects.',
    }, timestamp: '' });

    expect(promoteDesks).toHaveBeenCalledOnce();
    expect(promoteRooms).toHaveBeenCalledOnce();
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Automatic map build' }));
  });

  it('[POSITIVE] an admin can manually place, name, size, and delete any facility', async () => {
    await setup();
    loadHierarchy();
    http.expectOne((r) => r.url.endsWith('/floors/7/objects')).flush({ success: true, data: [], timestamp: '' });
    component.editMode.set(true);
    component.openManualObject();
    component.manualObjectForm.setValue({ name: 'Main Lift', code: 'lift-01', type: 'ELEVATOR', width: 20, height: 10, rotation: 5 });
    component.startManualObjectPlacement();

    expect(component.objectPlaceMode()).toBe(true);
    (component as any).placeManualObject({ x: 50, y: 50 });
    const create = http.expectOne((r) => r.url.endsWith('/floors/7/objects') && r.method === 'PUT');
    expect(create.request.body).toEqual({ objects: [{
      type: 'ELEVATOR', name: 'Main Lift', code: 'LIFT-01',
      polygon: '0.4,0.45 0.6,0.45 0.6,0.55 0.4,0.55', rotation: 5, ocrText: null,
    }], removedIds: [] });
    const lift = recognised({ id: 44, type: 'ELEVATOR', name: 'Main Lift', code: 'LIFT-01', source: 'MANUAL' });
    create.flush({ success: true, data: [lift], timestamp: '' });

    expect(component.selectedObject()?.id).toBe(44);
    expect(component.objectPlaceMode()).toBe(false);
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.deleteDetectedObject(lift);
    const remove = http.expectOne((r) => r.url.endsWith('/floors/7/objects') && r.method === 'PUT');
    expect(remove.request.body).toEqual({ objects: [], removedIds: [44] });
    remove.flush({ success: true, data: [], timestamp: '' });
    expect(component.detected()).toEqual([]);
    confirmDelete.mockRestore();
  });

  it('[POSITIVE] an admin can drag a door to a new position and save it automatically', async () => {
    await setup();
    loadHierarchy();
    const door = recognised({ id: 55, type: 'DOOR', name: 'Main Door' });
    http.expectOne((r) => r.url.endsWith('/floors/7/objects')).flush({ success: true, data: [door], timestamp: '' });
    component.editMode.set(true);
    (component as any).point = vi.fn()
      .mockReturnValueOnce({ x: 10, y: 10 })
      .mockReturnValueOnce({ x: 20, y: 25 });
    const event = { pointerId: 1, clientX: 0, clientY: 0, stopPropagation() {}, currentTarget: { setPointerCapture() {} } } as any;

    component.detectedPointerDown(event, door);
    component.pointerMove(event);
    component.pointerUp(event);

    const saveMove = http.expectOne((r) => r.url.endsWith('/floors/7/objects') && r.method === 'PUT');
    expect(saveMove.request.body).toEqual({ objects: [{
      id: 55, type: 'DOOR', name: 'Main Door', code: 'A01',
      polygon: '0.2,0.25 0.3,0.25 0.3,0.35', rotation: 0, ocrText: null,
    }], removedIds: [] });
    const movedDoor = recognised({ id: 55, type: 'DOOR', name: 'Main Door', polygon: [{ x: .2, y: .25 }, { x: .3, y: .25 }, { x: .3, y: .35 }], bbox: { x: .2, y: .25, width: .1, height: .1 }, center: { x: .25, y: .3 }, source: 'EDITED' });
    saveMove.flush({ success: true, data: [movedDoor], timestamp: '' });

    expect(component.selectedObject()?.center).toEqual({ x: .25, y: .3 });
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Object moved' }));
  });

  it('[POSITIVE] does not recreate a detected room that is already a zone', async () => {
    await setup();
    loadHierarchy();
    const room = recognised({ id: 9, type: 'MEETING_ROOM', code: 'MR1' });
    http.expectOne((r) => r.url.endsWith('/floors/7/objects'))
      .flush({ success: true, data: [room], timestamp: '' });
    component.currentMap.update((map) => map ? ({
      ...map,
      zones: [...map.zones, { id: 99, version: 1, floorId: 7, name: 'Meeting room', code: 'MR1', colour: '#14b8a6', status: 'ACTIVE', isDeleted: false }],
    }) : map);

    expect(component.roomCandidates()).toBe(0);
    component.promoteRooms();
    http.expectNone((r) => r.url.endsWith('/zones') && r.method === 'POST');
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

  it('clears every editable map record in one confirmed request while keeping the plan', async () => {
    await setup();
    loadHierarchy({ floor: { ...floor, hasPlan: true }, zones: [{ id: 5, name: 'Finance Zone' }], desks: [desk(), assignedDesk] } as FloorMap);
    http.expectOne((r) => r.url.endsWith('/floors/7/plan')).flush(new Blob(['map'], { type: 'image/png' }));
    component.editMode.set(true);
    component.dirty.set(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.clearMapContents();

    const req = http.expectOne((r) => r.url.endsWith('/floors/7/contents'));
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, data: { desks: 2, zones: 1, assignments: 1, detectedObjects: 3 }, timestamp: '' });
    http.expectOne((r) => r.url.endsWith('/summary')).flush({ success: true, data: { totalDesks: 0, assignedDesks: 0, availableDesks: 0, unavailableDesks: 0, staffWithoutDesks: 1, utilizationPercent: 0 }, timestamp: '' });

    expect(component.currentMap()?.desks).toEqual([]);
    expect(component.currentMap()?.zones).toEqual([]);
    expect(component.dirty()).toBe(false);
    expect(component.currentMap()?.floor.hasPlan).toBe(true);
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', summary: 'Map contents cleared' }));
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

  /**
   * Without this the only way to learn that a raster plan needs a vision
   * engine is to upload one and read the error, which sends people round a
   * loop between two formats neither of which the server can read.
   */
  describe('scan availability', () => {
    function status(over: Partial<{ visionConfigured: boolean; readableMediaTypes: string[] }> = {}) {
      http.expectOne((r) => r.url.endsWith('/detection/status')).flush({
        success: true,
        data: { detector: 'heuristic:svg', available: true, visionConfigured: false, readableMediaTypes: ['image/svg+xml'], ...over },
        timestamp: '',
      });
    }

    async function floorWithPlan(mediaType: string) {
      await setup();
      loadHierarchy({ floor: { ...floor, hasPlan: true, planMediaType: mediaType }, zones: [], desks: [] } as FloorMap);
      // A floor with a plan also fetches the image itself.
      http.expectOne((r) => r.url.endsWith('/floors/7/plan')).flush(new Blob(['x'], { type: mediaType }));
    }

    it('[NEGATIVE] blocks the scan and says why when a raster plan has no vision engine', async () => {
      await floorWithPlan('image/png');
      status();

      expect(component.canScanPlan()).toBe(false);
      expect(component.scanHint()).toContain('vision detection');
    });

    it('[POSITIVE] allows the scan when the engine can read the plan', async () => {
      await floorWithPlan('image/svg+xml');
      status();

      expect(component.canScanPlan()).toBe(true);
      expect(component.scanHint()).toBe('');
    });

    it('[POSITIVE] allows a raster scan once vision is configured', async () => {
      await floorWithPlan('image/png');
      status({ visionConfigured: true, readableMediaTypes: ['image/jpeg', 'image/png', 'image/svg+xml'] });

      expect(component.canScanPlan()).toBe(true);
    });

    it('does not block the scan when the status call fails', async () => {
      await floorWithPlan('image/png');
      http.expectOne((r) => r.url.endsWith('/detection/status')).error(new ProgressEvent('offline'));

      // Unknown capability must not disable a control that might work.
      expect(component.canScanPlan()).toBe(true);
    });
  });

  /**
   * The map sets touch-action:none, so the browser's own pinch is suppressed.
   * Without these gestures a phone has no way to zoom the plan at all.
   */
  describe('touch gestures', () => {
    /** The map fills a 400px-wide element mapped onto a 0..100 viewBox. */
    function stubSvgGeometry() {
      const svg = (component as any).mapSvg.nativeElement as SVGSVGElement;
      svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform(this: any) { return { x: this.x / 4, y: this.y / 4 }; } }) as any;
      svg.getScreenCTM = () => ({ inverse: () => ({}) }) as any;
      return svg;
    }

    function touch(id: number, x: number, y: number) {
      return { pointerId: id, clientX: x, clientY: y, stopPropagation() {}, currentTarget: { setPointerCapture() {} } } as any;
    }

    async function openMap() {
      await setup();
      loadHierarchy({ floor: { ...floor, hasPlan: true }, zones: [], desks: [] } as FloorMap);
      http.expectOne((r) => r.url.endsWith('/floors/7/objects')).flush({ success: true, data: [], timestamp: '' });
      http.expectOne((r) => r.url.endsWith('/floors/7/plan')).flush(new Blob(['<svg></svg>'], { type: 'image/svg+xml' }));
      fixture.detectChanges();
      stubSvgGeometry();
    }

    it('[POSITIVE] two fingers spreading apart zoom the map in', async () => {
      await openMap();
      expect(component.zoom()).toBe(1);

      component.mapPointerDown(touch(1, 100, 100));
      component.mapPointerDown(touch(2, 200, 200));
      component.pointerMove(touch(1, 50, 50));
      component.pointerMove(touch(2, 250, 250));

      expect(component.zoom()).toBeGreaterThan(1);
    });

    it('[POSITIVE] two fingers coming together zoom the map out', async () => {
      await openMap();
      component.mapPointerDown(touch(1, 50, 50));
      component.mapPointerDown(touch(2, 250, 250));
      component.pointerMove(touch(1, 140, 140));
      component.pointerMove(touch(2, 160, 160));

      expect(component.zoom()).toBeLessThan(1);
    });

    it('[NEGATIVE] a second finger cancels the one-finger pan instead of fighting it', async () => {
      await openMap();
      component.mapPointerDown(touch(1, 100, 100));
      component.pointerMove(touch(1, 140, 100));
      const panned = component.panX();
      expect(panned).not.toBe(0);

      // Second finger down: the pan must stop tracking finger one.
      component.mapPointerDown(touch(2, 200, 200));
      component.pointerMove(touch(1, 300, 100));

      expect((component as any).panDrag).toBeNull();
    });

    it('[NEGATIVE] lifting one finger of a pinch does not resume panning', async () => {
      await openMap();
      component.mapPointerDown(touch(1, 100, 100));
      component.mapPointerDown(touch(2, 200, 200));
      component.pointerUp(touch(2, 200, 200));
      const held = { x: component.panX(), y: component.panY() };

      component.pointerMove(touch(1, 400, 400));

      expect(component.panX()).toBe(held.x);
      expect(component.panY()).toBe(held.y);
    });

    it('keeps zoom within the same bounds as the toolbar buttons', async () => {
      await openMap();
      component.mapPointerDown(touch(1, 199, 199));
      component.mapPointerDown(touch(2, 201, 201));
      // A wildly divergent spread would otherwise scale without limit.
      component.pointerMove(touch(1, 0, 0));
      component.pointerMove(touch(2, 4000, 4000));

      expect(component.zoom()).toBeLessThanOrEqual(4);
      expect(component.zoom()).toBeGreaterThanOrEqual(0.5);
    });
  });
});
