import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgDataService } from '../../core/data/org-data.service';
import { Position } from '../../core/models/organization.model';
import { AuthService } from '../../core/services/auth.service';
import { PositionList } from './position-list';
import { PositionService } from './position.service';

describe('PositionList', () => {
  let component:PositionList; let fixture:ComponentFixture<PositionList>;
  const position:Position={id:20,companyId:1,companyName:'Sunrich',deptId:5,departmentName:'Engineering',
    reportsToPositionId:10,reportsToPositionTitle:'Director',title:'Engineering Manager',isVacant:true,staffId:null,status:'OPEN',version:1,isDeleted:false};
  const api={list:vi.fn(),get:vi.fn(),create:vi.fn(),update:vi.fn(),archive:vi.fn(),restore:vi.fn()};
  const messages={add:vi.fn()};

  beforeEach(async()=>{
    Object.values(api).forEach((mock)=>mock.mockReset());messages.add.mockReset();
    api.list.mockReturnValue(of({content:[position],totalElements:1}));api.get.mockReturnValue(of(position));
    api.create.mockImplementation((request)=>of({...position,...request}));api.update.mockImplementation((_id,request)=>of({...position,...request,version:2}));
    api.archive.mockReturnValue(of(undefined));api.restore.mockReturnValue(of(position));
    const org={companyOptions:vi.fn().mockReturnValue([{label:'Sunrich',value:1}]),departmentOptions:vi.fn().mockReturnValue([{label:'Engineering',value:5}]),
      companyName:vi.fn().mockReturnValue('Sunrich'),departmentName:vi.fn().mockReturnValue('Engineering'),staffName:vi.fn().mockReturnValue('—'),
      companies:{snapshot:vi.fn().mockReturnValue([])},departments:{snapshot:vi.fn().mockReturnValue([{id:5,companyId:1,name:'Engineering'}])},
      positions:{snapshot:vi.fn().mockReturnValue([{...position,id:10,title:'Director',reportsToPositionId:null}]),init:vi.fn().mockReturnValue(of(undefined))},
      staff:{snapshot:vi.fn().mockReturnValue([]),init:vi.fn().mockReturnValue(of(undefined))}};
    const auth={canEditOrgData:signal(true),currentUser:signal({userId:1,companyId:1}),isSuperAdmin:signal(true)};
    const confirmation={confirm:vi.fn()};
    await TestBed.configureTestingModule({imports:[PositionList],providers:[
      {provide:PositionService,useValue:api},{provide:OrgDataService,useValue:org},{provide:AuthService,useValue:auth},
      {provide:MessageService,useValue:messages},{provide:ConfirmationService,useValue:confirmation},
    ]}).compileComponents();fixture=TestBed.createComponent(PositionList);component=fixture.componentInstance;fixture.detectChanges();
  });

  it('loads a server-side paginated position list',()=>{
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({page:0,size:20,sort:'title',direction:'asc',includeDeleted:false}));
    expect(component.rows()).toEqual([position]);expect(component.totalRecords()).toBe(1);
  });

  it('sends combined filters to the backend and supports refresh',()=>{
    component.companyFilter.set(1);component.departmentFilter.set(5);component.statusFilter.set('OPEN');
    component.parentFilter.set(10);component.assignedFilter.set(false);component.refresh();
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({companyId:1,departmentId:5,status:'OPEN',reportsToPositionId:10,assigned:false}));
  });

  it('clears stale department hierarchy and staff values when company changes',()=>{
    component.openEdit(position);component.form.patchValue({reportsToPositionId:10,staffId:99});component.form.controls.companyId.setValue(2);
    expect(component.form.value.deptId).toBeNull();expect(component.form.value.reportsToPositionId).toBeNull();expect(component.form.value.staffId).toBeNull();
  });

  it('creates and updates positions with hierarchy and version data',()=>{
    component.openCreate();component.form.patchValue({companyId:1,title:'Platform Lead',deptId:5,reportsToPositionId:10,status:'OPEN'});component.save();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({title:'Platform Lead',reportsToPositionId:10}));
    component.openEdit(position);component.form.patchValue({title:'Senior Engineering Manager'});component.save();
    expect(api.update).toHaveBeenCalledWith(20,expect.objectContaining({title:'Senior Engineering Manager',version:1}));
  });

  it('blocks invalid forms before making a request',()=>{
    component.openCreate();component.form.patchValue({companyId:null,title:''});component.save();
    expect(api.create).not.toHaveBeenCalled();expect(component.form.controls.title.touched).toBe(true);
  });
});
