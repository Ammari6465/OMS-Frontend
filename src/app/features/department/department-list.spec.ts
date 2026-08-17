import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { DepartmentList } from './department-list';
import { DepartmentService } from './department.service';
import { OrgDataService } from '../../core/data/org-data.service';
import { AuthService } from '../../core/services/auth.service';
import { Department } from '../../core/models/organization.model';
import { EntityStatus } from '../../core/models/enums';

describe('DepartmentList Component UI & Operations', () => {
  let component: DepartmentList;
  let fixture: ComponentFixture<DepartmentList>;
  let departmentServiceMock: any;
  let orgDataMock: any;
  let authServiceMock: any;
  let messageServiceMock: any;
  let confirmationServiceMock: any;

  const mockDepartment: Department = {
    id: 10,
    companyId: 1,
    companyName: 'Sunrich Group',
    name: 'Engineering',
    description: 'Software Engineering Team',
    status: EntityStatus.ACTIVE,
    version: 1,
    isDeleted: false,
  };

  beforeEach(async () => {
    departmentServiceMock = {
      list: vi.fn().mockReturnValue(of({ content: [mockDepartment], totalElements: 1 })),
      create: vi.fn().mockReturnValue(of(mockDepartment)),
      update: vi.fn().mockReturnValue(of({ ...mockDepartment, name: 'Core Engineering', version: 2 })),
      archive: vi.fn().mockReturnValue(of(null)),
      restore: vi.fn().mockReturnValue(of(mockDepartment)),
    };

    orgDataMock = {
      departments: { init: vi.fn().mockReturnValue(of(undefined)) },
      companyOptions: signal([{ label: 'Sunrich Group', value: 1 }]),
      companyName: vi.fn().mockReturnValue('Sunrich Group'),
      departmentName: vi.fn().mockReturnValue('—'),
      staffName: vi.fn().mockReturnValue('—'),
      staffOptions: vi.fn().mockReturnValue([]),
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
      imports: [DepartmentList, ReactiveFormsModule, FormsModule],
      providers: [
        { provide: DepartmentService, useValue: departmentServiceMock },
        { provide: OrgDataService, useValue: orgDataMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: MessageService, useValue: messageServiceMock },
        { provide: ConfirmationService, useValue: confirmationServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DepartmentList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('[POSITIVE] initializes and loads paginated department rows on init', () => {
    expect(departmentServiceMock.list).toHaveBeenCalledWith({
      page: 0,
      size: 20,
      sort: 'name',
      direction: 'asc',
      search: '',
      status: null,
      companyId: null,
      includeDeleted: false,
    });
    expect(component.rows()).toEqual([mockDepartment]);
  });

  it('[POSITIVE] openCreate resets form and displays department modal dialog', () => {
    component.openCreate();

    expect(component.editingId()).toBeNull();
    expect(component.dialogVisible).toBe(true);
    expect(component.form.value.name).toBe('');
    expect(component.form.value.companyId).toBeNull();
  });

  it('[POSITIVE] save creates new department and shows success toast', () => {
    component.openCreate();
    component.form.patchValue({
      companyId: 1,
      name: 'Technology',
      description: 'IT & Software',
      status: EntityStatus.ACTIVE,
    });

    component.save();

    expect(departmentServiceMock.create).toHaveBeenCalledWith({
      companyId: 1,
      name: 'Technology',
      description: 'IT & Software',
      parentDeptId: null,
      headStaffId: null,
      status: EntityStatus.ACTIVE,
    });
    expect(messageServiceMock.add).toHaveBeenCalledWith({
      severity: 'success',
      summary: 'Department created',
      detail: 'Technology',
    });
    expect(component.dialogVisible).toBe(false);
    expect(orgDataMock.departments.init).toHaveBeenCalled();
  });

  it('[POSITIVE] openEdit populates form with existing department details and version', () => {
    component.openEdit(mockDepartment);

    expect(component.editingId()).toBe(10);
    expect(component.form.value.name).toBe('Engineering');
    expect(component.form.value.companyId).toBe(1);

    component.form.patchValue({ name: 'Core Engineering' });
    component.save();

    expect(departmentServiceMock.update).toHaveBeenCalledWith(10, {
      companyId: 1,
      name: 'Core Engineering',
      description: 'Software Engineering Team',
      parentDeptId: null,
      headStaffId: null,
      status: EntityStatus.ACTIVE,
      version: 1,
    });
  });

  it('[POSITIVE] applySearch and filters reload department table with query params', () => {
    component.applySearch('Tech');
    expect(departmentServiceMock.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'Tech', page: 0 }));

    component.applyCompanyFilter(1);
    expect(departmentServiceMock.list).toHaveBeenCalledWith(expect.objectContaining({ companyId: 1, page: 0 }));
  });

  it('[NEGATIVE] save with missing required company or name marks controls invalid and blocks API call', () => {
    component.openCreate();
    component.form.patchValue({ companyId: null, name: '' });

    component.save();

    expect(component.form.controls.name.touched).toBe(true);
    expect(component.form.controls.companyId.touched).toBe(true);
    expect(departmentServiceMock.create).not.toHaveBeenCalled();
    expect(component.dialogVisible).toBe(true);
  });
});
