import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { CompanyList } from './company-list';
import { OrgDataService } from '../../core/data/org-data.service';
import { Company } from '../../core/models/organization.model';
import { EntityStatus } from '../../core/models/enums';

describe('CompanyList Component UI & Operations', () => {
  let component: CompanyList;
  let fixture: ComponentFixture<CompanyList>;
  let orgDataMock: any;
  let messageServiceMock: any;
  let confirmationServiceMock: any;

  const mockCompany: Company = {
    id: 1,
    name: 'Sunrich Holdings',
    regNumber: 'REG-100',
    headOffice: 'Colombo',
    dateEstablished: '2020-01-01',
    status: EntityStatus.ACTIVE,
    isDeleted: false,
  };

  beforeEach(async () => {
    orgDataMock = {
      companies: {
        list: vi.fn().mockReturnValue(of({ content: [mockCompany], totalElements: 1 })),
        create: vi.fn().mockReturnValue(of(mockCompany)),
        update: vi.fn().mockReturnValue(of({ ...mockCompany, name: 'Updated Holdings' })),
        softDelete: vi.fn().mockReturnValue(of(null)),
        restore: vi.fn().mockReturnValue(of(mockCompany)),
      },
    };

    messageServiceMock = {
      add: vi.fn(),
    };

    confirmationServiceMock = {
      confirm: vi.fn().mockImplementation((options: any) => options.accept()),
    };

    await TestBed.configureTestingModule({
      imports: [CompanyList, ReactiveFormsModule, FormsModule],
      providers: [
        { provide: OrgDataService, useValue: orgDataMock },
        { provide: MessageService, useValue: messageServiceMock },
        { provide: ConfirmationService, useValue: confirmationServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CompanyList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('[POSITIVE] initializes and loads company rows on init', () => {
    expect(orgDataMock.companies.list).toHaveBeenCalledWith({
      size: 1000,
      includeDeleted: false,
      sort: 'name',
      direction: 'asc',
    });
    expect(component.rows()).toEqual([mockCompany]);
  });

  it('[POSITIVE] openCreate resets form and displays modal dialog', () => {
    component.openCreate();
    expect(component.editingId()).toBeNull();
    expect(component.dialogVisible).toBe(true);
    expect(component.form.value.name).toBe('');
    expect(component.form.value.status).toBe(EntityStatus.ACTIVE);
  });

  it('[POSITIVE] save creates new company and displays success toast', () => {
    component.openCreate();
    component.form.patchValue({
      name: 'New Sunrich Branch',
      regNumber: 'BRANCH-01',
      headOffice: 'Kandy',
      status: EntityStatus.ACTIVE,
    });

    component.save();

    expect(orgDataMock.companies.create).toHaveBeenCalledWith({
      name: 'New Sunrich Branch',
      regNumber: 'BRANCH-01',
      headOffice: 'Kandy',
      dateEstablished: '',
      status: EntityStatus.ACTIVE,
    });
    expect(messageServiceMock.add).toHaveBeenCalledWith({
      severity: 'success',
      summary: 'Company created',
      detail: 'New Sunrich Branch',
    });
    expect(component.dialogVisible).toBe(false);
  });

  it('[POSITIVE] openEdit populates form and save updates existing company', () => {
    component.openEdit(mockCompany);

    expect(component.editingId()).toBe(1);
    expect(component.form.value.name).toBe('Sunrich Holdings');
    expect(component.dialogVisible).toBe(true);

    component.form.patchValue({ name: 'Updated Holdings' });
    component.save();

    expect(orgDataMock.companies.update).toHaveBeenCalledWith(1, {
      name: 'Updated Holdings',
      regNumber: 'REG-100',
      headOffice: 'Colombo',
      dateEstablished: '2020-01-01',
      status: EntityStatus.ACTIVE,
    });
    expect(messageServiceMock.add).toHaveBeenCalledWith({
      severity: 'success',
      summary: 'Company updated',
      detail: 'Updated Holdings',
    });
  });

  it('[POSITIVE] toggleArchived reloads companies with includeDeleted parameter', () => {
    component.toggleArchived(true);
    expect(component.showArchived()).toBe(true);
    expect(orgDataMock.companies.list).toHaveBeenCalledWith({
      size: 1000,
      includeDeleted: true,
      sort: 'name',
      direction: 'asc',
    });
  });

  it('[NEGATIVE] save with blank company name marks form control invalid and blocks API call', () => {
    component.openCreate();
    component.form.patchValue({ name: '' });

    component.save();

    expect(component.form.controls.name.touched).toBe(true);
    expect(orgDataMock.companies.create).not.toHaveBeenCalled();
    expect(component.dialogVisible).toBe(true);
  });
});
