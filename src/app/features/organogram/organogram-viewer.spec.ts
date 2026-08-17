import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { signal } from '@angular/core';

import { OrganogramViewer } from './organogram-viewer';
import { OrgDataService } from '../../core/data/org-data.service';
import { EmploymentType, EntityStatus } from '../../core/models/enums';
import { Staff } from '../../core/models/organization.model';

describe('OrganogramViewer Component UI & Interactions', () => {
  let component: OrganogramViewer;
  let fixture: ComponentFixture<OrganogramViewer>;
  let orgDataMock: any;
  let messageServiceMock: any;

  const mockManager: Staff = {
    id: 1,
    companyId: 10,
    companyName: 'Sunrich Global',
    name: 'Chief Executive',
    title: 'CEO',
    empType: EmploymentType.PERMANENT,
    status: EntityStatus.ACTIVE,
    isDeleted: false,
    version: 1,
  };

  const mockEmployee: Staff = {
    id: 2,
    companyId: 10,
    companyName: 'Sunrich Global',
    managerId: 1,
    managerName: 'Chief Executive',
    name: 'Dev Lead',
    title: 'Lead Developer',
    empType: EmploymentType.PERMANENT,
    status: EntityStatus.ACTIVE,
    isDeleted: false,
    version: 1,
  };

  beforeEach(async () => {
    orgDataMock = {
      companies: { snapshot: vi.fn().mockReturnValue([{ id: 10, name: 'Sunrich Global' }]) },
      companyOptions: signal([{ label: 'Sunrich Global', value: 10 }]),
      departments: { snapshot: vi.fn().mockReturnValue([]) },
      departmentOptions: signal([]),
      departmentName: vi.fn().mockReturnValue('Technology'),
      staff: {
        snapshot: vi.fn().mockReturnValue([mockManager, mockEmployee]),
        update: vi.fn(),
      },
      positions: { snapshot: vi.fn().mockReturnValue([]) },
    };

    messageServiceMock = { add: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [OrganogramViewer, FormsModule],
      providers: [
        { provide: OrgDataService, useValue: orgDataMock },
        { provide: MessageService, useValue: messageServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganogramViewer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('[POSITIVE] initializes with company selected and builds root node hierarchy', () => {
    expect(component.companyId()).toBe(10);
    expect(component.roots().length).toBe(1);
    expect(component.roots()[0].staff.name).toBe('Chief Executive');
    expect(component.roots()[0].children.length).toBe(1);
    expect(component.roots()[0].children[0].staff.name).toBe('Dev Lead');
  });

  it('[POSITIVE] zoomBy updates zoom scale within 25% to 200% limits', () => {
    const initialZoom = component.zoom();

    component.zoomBy(0.3);
    expect(component.zoom()).toBeCloseTo(initialZoom + 0.3);

    component.zoomBy(3.0);
    expect(component.zoom()).toBe(2.0); // Capped at max 2.0

    component.zoomBy(-5.0);
    expect(component.zoom()).toBe(0.3); // Capped at min 0.3
  });

  it('[POSITIVE] resetView restores zoom scale to 100%', () => {
    component.zoomBy(0.5);
    expect(component.zoom()).not.toBe(1.0);

    component.resetView();
    expect(component.zoom()).toBe(1.0);
  });

  it('[POSITIVE] keeps the organogram transform two-dimensional', () => {
    component.zoom.set(1.25);
    expect(component.stageTransform()).toBe('translate(0px, 0px) scale(1.25)');
    expect(component.stageTransform()).not.toContain('rotate');
  });

  it('[POSITIVE] highlights the hovered person, manager and direct reports', () => {
    const root = component.roots()[0];
    component.hoveredId.set(mockEmployee.id);
    expect(component.isRelated(root)).toBe(true);
    expect(component.isRelated(root.children[0])).toBe(true);
  });

  it('[POSITIVE] expandAll and collapseAll toggle node collapse states', () => {
    const rootNode = component.roots()[0];

    component.collapseAll();
    expect(component.isCollapsed(rootNode)).toBe(true);

    component.expandAll();
    expect(component.isCollapsed(rootNode)).toBe(false);
  });

  it('[NEGATIVE] search term filter highlights matching nodes and dims non-matching nodes', () => {
    const rootNode = component.roots()[0];
    const childNode = rootNode.children[0];

    component.term.set('Dev Lead');

    expect(component.isHit(childNode)).toBe(true);
    expect(component.isHit(rootNode)).toBe(false);
  });

  it('[NEGATIVE] clearing company selection renders empty organogram state placeholder', () => {
    component.companyId.set(null);
    fixture.detectChanges();

    expect(component.roots().length).toBe(0);
  });
});
