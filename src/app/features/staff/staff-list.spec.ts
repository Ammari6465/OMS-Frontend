import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { StaffList } from './staff-list';
import { StaffService } from './staff.service';
import { OrgDataService } from '../../core/data/org-data.service';
import { AuthService } from '../../core/services/auth.service';
import { Staff } from '../../core/models/organization.model';
import { EmploymentType, EntityStatus } from '../../core/models/enums';

describe('StaffList Component UI & Operations', () => {
  let component: StaffList;
  let fixture: ComponentFixture<StaffList>;
  let staffServiceMock: any;
  let orgDataMock: any;
  let authServiceMock: any;
  let messageServiceMock: any;
  let confirmationServiceMock: any;

  const mockStaff: Staff = {
    id: 100,
    companyId: 1,
    companyName: 'Sunrich Group',
    deptId: 5,
    departmentName: 'Engineering',
    managerId: 10,
    managerName: 'Sarah Manager',
    positionId: 20,
    positionTitle: 'Lead Architect',
    employeeCode: 'EMP-100',
    name: 'Alice Developer',
    title: 'Lead Architect',
    empType: EmploymentType.PERMANENT,
    email: 'alice@sunrichgroup.com',
    dateJoined: '2022-01-15',
    status: EntityStatus.ACTIVE,
    version: 1,
    isDeleted: false,
  };

  beforeEach(async () => {
    staffServiceMock = {
      list: vi.fn().mockReturnValue(of({ content: [mockStaff], totalElements: 1 })),
      get: vi.fn().mockReturnValue(of(mockStaff)),
      create: vi.fn().mockImplementation((req) => of({ ...mockStaff, ...req })),
      update: vi.fn().mockImplementation((id, req) => of({ ...mockStaff, ...req, version: (req.version ?? 1) + 1 })),
      archive: vi.fn().mockReturnValue(of(null)),
      restore: vi.fn().mockReturnValue(of(mockStaff)),
    };

    orgDataMock = {
      companyOptions: signal([{ label: 'Sunrich Group', value: 1 }]),
      departmentOptions: signal([{ label: 'Engineering', value: 5 }]),
      positionOptions: signal([{ label: 'Lead Architect', value: 20 }]),
      staffOptions: signal([{ label: 'Sarah Manager', value: 10 }]),
      companyName: vi.fn().mockReturnValue('Sunrich Group'),
      departmentName: vi.fn().mockReturnValue('Engineering'),
      staffName: vi.fn().mockReturnValue('Sarah Manager'),
      positionTitle: vi.fn().mockReturnValue('Lead Architect'),
      positions: { snapshot: vi.fn().mockReturnValue([]), init: vi.fn().mockReturnValue(of(null)) },
      staff: { snapshot: vi.fn().mockReturnValue([]), init: vi.fn().mockReturnValue(of(null)) },
    };

    authServiceMock = {
      canEditOrgData: signal(true),
      currentUser: signal({ userId: 1, username: 'admin', companyId: 1 }),
      isSuperAdmin: signal(true),
    };

    messageServiceMock = { add: vi.fn() };
    confirmationServiceMock = {
      confirm: vi.fn().mockImplementation((options: any) => options.accept()),
    };

    await TestBed.configureTestingModule({
      imports: [StaffList, ReactiveFormsModule, FormsModule],
      providers: [
        { provide: StaffService, useValue: staffServiceMock },
        { provide: OrgDataService, useValue: orgDataMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: MessageService, useValue: messageServiceMock },
        { provide: ConfirmationService, useValue: confirmationServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StaffList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('[POSITIVE] initializes and loads paginated staff rows on init', () => {
    expect(staffServiceMock.list).toHaveBeenCalledWith(expect.objectContaining({
      page: 0,
      size: 20,
      sort: 'name',
      direction: 'asc',
      includeDeleted: false,
    }));
    expect(component.rows()).toEqual([mockStaff]);
  });

  it('[POSITIVE] openCreate resets form and displays staff modal dialog', () => {
    component.openCreate();

    expect(component.editingId()).toBeNull();
    expect(component.dialogVisible).toBe(true);
    expect(component.form.value.name).toBe('');
    expect(component.form.value.employeeCode).toBe('');
  });

  it('[POSITIVE] save creates new staff member and displays success toast', () => {
    component.openCreate();
    component.form.patchValue({
      companyId: 1,
      deptId: 5,
      employeeCode: 'EMP-101',
      name: 'Bob Engineer',
      email: 'bob@sunrichgroup.com',
      empType: EmploymentType.PERMANENT,
      status: EntityStatus.ACTIVE,
    });

    component.save();

    expect(staffServiceMock.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 1,
      deptId: 5,
      employeeCode: 'EMP-101',
      name: 'Bob Engineer',
      email: 'bob@sunrichgroup.com',
    }));
    expect(messageServiceMock.add).toHaveBeenCalledWith({
      severity: 'success',
      summary: 'Staff created',
      detail: 'Bob Engineer',
    });
    expect(component.dialogVisible).toBe(false);
  });

  it('[POSITIVE] openEdit populates form with staff details and sends version on update', () => {
    component.openEdit(mockStaff);

    expect(component.editingId()).toBe(100);
    expect(component.form.value.name).toBe('Alice Developer');
    expect(component.form.value.employeeCode).toBe('EMP-100');

    component.form.patchValue({ name: 'Alice Senior Architect' });
    component.save();

    expect(staffServiceMock.update).toHaveBeenCalledWith(100, expect.objectContaining({
      name: 'Alice Senior Architect',
      version: 1,
    }));
  });

  it('[NEGATIVE] dateRangeValidator flags error when dateLeft is before dateJoined', () => {
    component.openCreate();
    component.form.patchValue({
      dateJoined: '2023-05-01',
      dateLeft: '2023-04-30',
    });

    expect(component.form.hasError('invalidEmploymentDates')).toBe(true);
  });

  it('[NEGATIVE] save with missing required company or name marks fields touched and blocks API call', () => {
    component.openCreate();
    component.form.patchValue({ companyId: null, name: '' });

    component.save();

    expect(component.form.controls.name.touched).toBe(true);
    expect(component.form.controls.companyId.touched).toBe(true);
    expect(staffServiceMock.create).not.toHaveBeenCalled();
    expect(component.dialogVisible).toBe(true);
  });

  it('[POSITIVE] sends manager, employment type, and joining date filters to the server', () => {
    component.managerFilter.set(10);
    component.employmentTypeFilter.set(EmploymentType.PERMANENT);
    component.joinedFrom.set('2024-01-01');
    component.joinedTo.set('2024-12-31');

    component.refresh();

    expect(staffServiceMock.list).toHaveBeenLastCalledWith(expect.objectContaining({
      managerId: 10,
      employmentType: EmploymentType.PERMANENT,
      joinedFrom: '2024-01-01',
      joinedTo: '2024-12-31',
    }));
  });

  it('[POSITIVE] refresh retries the current server-side query', () => {
    const callsBeforeRefresh = staffServiceMock.list.mock.calls.length;
    component.refresh();
    expect(staffServiceMock.list).toHaveBeenCalledTimes(callsBeforeRefresh + 1);
  });
});
