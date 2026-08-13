import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgDataService } from '../../core/data/org-data.service';
import { Position } from '../../core/models/organization.model';
import { AuthService } from '../../core/services/auth.service';
import { PositionService } from '../position/position.service';
import { VacancyList } from './vacancy-list';

describe('VacancyList',()=>{
  let component:VacancyList;let fixture:ComponentFixture<VacancyList>;
  const vacancy:Position={id:30,companyId:1,companyName:'Sunrich',deptId:5,departmentName:'Engineering',title:'Platform Engineer',
    reportsToPositionId:10,reportsToPositionTitle:'Engineering Manager',isVacant:true,staffId:null,status:'OPEN',version:1,isDeleted:false,createdAt:'2024-01-01'};
  const api={list:vi.fn(),vacancySummary:vi.fn(),get:vi.fn(),create:vi.fn(),update:vi.fn(),archive:vi.fn()};
  const confirmation={confirm:vi.fn()};const messages={add:vi.fn()};
  const canEdit=signal(true);

  beforeEach(async()=>{Object.values(api).forEach((mock)=>mock.mockReset());confirmation.confirm.mockReset();messages.add.mockReset();
    api.list.mockReturnValue(of({content:[vacancy],totalElements:1}));api.vacancySummary.mockReturnValue(of({total:3,open:1,filled:1,closed:1}));
    api.get.mockReturnValue(of(vacancy));api.create.mockImplementation((request)=>of({...vacancy,...request}));
    api.update.mockImplementation((_id,request)=>of({...vacancy,...request,version:2}));api.archive.mockReturnValue(of(undefined));
    const org={companyOptions:vi.fn().mockReturnValue([{label:'Sunrich',value:1}]),departmentOptions:vi.fn().mockReturnValue([{label:'Engineering',value:5}]),
      companyName:vi.fn().mockReturnValue('Sunrich'),departmentName:vi.fn().mockReturnValue('Engineering'),staffName:vi.fn().mockReturnValue('Alice'),
      departments:{snapshot:vi.fn().mockReturnValue([{id:5,companyId:1,name:'Engineering'}])},
      positions:{snapshot:vi.fn().mockReturnValue([{...vacancy,id:10,title:'Engineering Manager'}]),init:vi.fn().mockReturnValue(of(undefined))},
      staff:{snapshot:vi.fn().mockReturnValue([{id:99,companyId:1,deptId:5,name:'Alice',employeeCode:'EMP99',status:'ACTIVE'}]),init:vi.fn().mockReturnValue(of(undefined))}};
    canEdit.set(true);const auth={canEditOrgData:canEdit,currentUser:signal({userId:1,companyId:1}),isSuperAdmin:signal(true)};
    await TestBed.configureTestingModule({imports:[VacancyList],providers:[{provide:PositionService,useValue:api},{provide:OrgDataService,useValue:org},
      {provide:AuthService,useValue:auth},{provide:ConfirmationService,useValue:confirmation},{provide:MessageService,useValue:messages},
      {provide:Router,useValue:{navigate:vi.fn()}}]}).compileComponents();fixture=TestBed.createComponent(VacancyList);component=fixture.componentInstance;fixture.detectChanges();});

  it('loads paginated vacancy records and real summary counts',()=>{expect(api.list).toHaveBeenCalledWith(expect.objectContaining({page:0,size:20,sort:'createdAt',direction:'desc'}));
    expect(api.vacancySummary).toHaveBeenCalledWith(null);expect(component.rows()).toEqual([vacancy]);expect(component.summary()).toEqual({total:3,open:1,filled:1,closed:1});});
  it('sends combined company department position and status filters',()=>{component.companyFilter.set(1);component.departmentFilter.set(5);component.positionFilter.set(30);component.statusFilter.set('OPEN');component.refresh();
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({companyId:1,departmentId:5,positionId:30,status:'OPEN'}));expect(api.vacancySummary).toHaveBeenLastCalledWith(1);});
  it('clears stale dependent selections when company changes',()=>{component.openEdit(vacancy);component.form.controls.companyId.setValue(2);expect(component.form.value.deptId).toBeNull();expect(component.form.value.reportsToPositionId).toBeNull();});
  it('creates edits and fills vacancies with optimistic locking',()=>{component.openCreate();component.form.patchValue({companyId:1,deptId:5,title:'New Role',reportsToPositionId:10});component.save();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({title:'New Role',status:'OPEN',staffId:null}));component.openEdit(vacancy);component.form.patchValue({title:'Senior Platform Engineer'});component.save();
    expect(api.update).toHaveBeenCalledWith(30,expect.objectContaining({title:'Senior Platform Engineer',version:1}));component.openFill(vacancy);component.fillStaffId=99;component.fill();
    expect(api.update).toHaveBeenCalledWith(30,expect.objectContaining({staffId:99,version:1}));});
  it('confirms close and reopen transitions',()=>{confirmation.confirm.mockImplementation((options)=>options.accept());component.confirmClose(vacancy);
    expect(api.update).toHaveBeenCalledWith(30,expect.objectContaining({status:'CLOSED',version:1}));component.confirmReopen({...vacancy,status:'CLOSED'});
    expect(api.update).toHaveBeenLastCalledWith(30,expect.objectContaining({status:'OPEN',version:1}));});
  it('blocks invalid vacancy creation',()=>{component.openCreate();component.form.patchValue({companyId:null,title:''});component.save();expect(api.create).not.toHaveBeenCalled();expect(component.form.controls.title.touched).toBe(true);});
  it('exposes read-only permission and retryable load errors',()=>{canEdit.set(false);expect(component.canManage()).toBe(false);api.list.mockReturnValueOnce(throwError(()=>new Error('network')));component.refresh();expect(component.loadError()).toBe('Check your connection and try again.');expect(component.rows()).toEqual([]);});
});
