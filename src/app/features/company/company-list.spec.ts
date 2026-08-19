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

  /** The group holding company: no parent, one sister concern. */
  const mockCompany: Company = {
    id: 1,
    name: 'Sunrich Holdings',
    regNumber: 'REG-100',
    headOffice: 'Colombo',
    dateEstablished: '2020-01-01',
    status: EntityStatus.ACTIVE,
    isDeleted: false,
    parentCompanyId: null,
    parentCompanyName: null,
    isGroupParent: true,
    sisterConcernCount: 1,
  };

  const mockSister: Company = {
    id: 2,
    name: 'Sunrich Tiles',
    status: EntityStatus.ACTIVE,
    isDeleted: false,
    parentCompanyId: 1,
    parentCompanyName: 'Sunrich Holdings',
    isGroupParent: false,
    sisterConcernCount: 0,
  };

  beforeEach(async () => {
    orgDataMock = {
      companies: {
        list: vi.fn().mockReturnValue(of({ content: [mockCompany, mockSister], totalElements: 2 })),
        refresh: vi.fn().mockReturnValue(of([mockCompany, mockSister])),
        create: vi.fn().mockReturnValue(of(mockSister)),
        update: vi.fn().mockReturnValue(of({ ...mockCompany, name: 'Updated Holdings' })),
        softDelete: vi.fn().mockReturnValue(of(null)),
        restore: vi.fn().mockReturnValue(of(mockCompany)),
      },
      groupParent: vi.fn().mockReturnValue(mockCompany),
      parentCompanyOptions: vi.fn().mockReturnValue([{ label: 'Sunrich Holdings', value: 1 }]),
      sisterConcerns: vi.fn().mockReturnValue([]),
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
    expect(component.rows()).toEqual([mockCompany, mockSister]);
  });

  it('[POSITIVE] openCreate resets form and defaults the parent to the holding company', () => {
    component.openCreate();
    expect(component.editingId()).toBeNull();
    expect(component.dialogVisible).toBe(true);
    expect(component.form.value.name).toBe('');
    expect(component.form.value.status).toBe(EntityStatus.ACTIVE);
    expect(component.form.value.parentCompanyId).toBe(1);
    expect(component.isGroupParent()).toBe(false);
  });

  it('[POSITIVE] save creates new company as a sister concern and displays success toast', () => {
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
      parentCompanyId: 1,
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
      parentCompanyId: null,
    });
    expect(messageServiceMock.add).toHaveBeenCalledWith({
      severity: 'success',
      summary: 'Company updated',
      detail: 'Updated Holdings',
    });
  });

  it('[POSITIVE] openEdit on the holding company hides the parent selector', () => {
    component.openEdit(mockCompany);
    expect(component.isGroupParent()).toBe(true);
  });

  it('[POSITIVE] openEdit on a sister concern offers parents excluding itself', () => {
    component.openEdit(mockSister);

    expect(component.isGroupParent()).toBe(false);
    expect(component.form.value.parentCompanyId).toBe(1);
    expect(orgDataMock.parentCompanyOptions).toHaveBeenCalledWith(2);
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

  it('[NEGATIVE] archiving a company that still has sister concerns is blocked', () => {
    orgDataMock.sisterConcerns.mockReturnValue([mockSister]);

    component.confirmDelete(mockCompany);

    expect(confirmationServiceMock.confirm).not.toHaveBeenCalled();
    expect(orgDataMock.companies.softDelete).not.toHaveBeenCalled();
    expect(messageServiceMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', summary: 'Cannot archive' }),
    );
  });

  it('[POSITIVE] archiving a leaf company proceeds and refreshes the list', () => {
    component.confirmDelete(mockSister);

    expect(orgDataMock.companies.softDelete).toHaveBeenCalledWith(2);
    expect(orgDataMock.companies.refresh).toHaveBeenCalled();
  });
});
