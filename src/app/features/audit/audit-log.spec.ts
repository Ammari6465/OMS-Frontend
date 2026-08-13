import { ComponentFixture,TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of,throwError } from 'rxjs';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { AuditEvent,AuditService } from '../../core/data/audit.service';
import { OrgDataService } from '../../core/data/org-data.service';
import { Role } from '../../core/models/enums';
import { AuthService } from '../../core/services/auth.service';
import { AuditLog } from './audit-log';

describe('AuditLog',()=>{let component:AuditLog;let fixture:ComponentFixture<AuditLog>;const event:AuditEvent={id:9,actorId:1,actorName:'Alice Admin',actorUsername:'alice',actorEmail:'alice@example.com',actorRole:Role.COMPANY_ADMIN,action:'UPDATE',module:'Staff',entityType:'Staff',entityId:1042,companyId:1,staffId:1042,description:'Staff updated',beforeValue:'department=Finance,position=Accountant,status=ACTIVE',afterValue:'department=IT,position=Developer,status=ACTIVE',status:'SUCCESS',timestamp:'2026-08-13T10:32:00'};const api={list:vi.fn(),summary:vi.fn(),get:vi.fn(),export:vi.fn()};
beforeEach(async()=>{Object.values(api).forEach((m)=>m.mockReset());api.list.mockReturnValue(of({content:[event],totalElements:1}));api.summary.mockReturnValue(of({totalEvents:10,todayEvents:2,successfulActions:10,failedActions:0,securityEvents:3}));api.get.mockReturnValue(of(event));api.export.mockReturnValue(of(new Blob(['csv'])));const auth={isSuperAdmin:signal(true),currentUser:signal({userId:1,companyId:null})};const org={companyOptions:vi.fn().mockReturnValue([{label:'Sunrich',value:1}])};await TestBed.configureTestingModule({imports:[AuditLog],providers:[{provide:AuditService,useValue:api},{provide:AuthService,useValue:auth},{provide:OrgDataService,useValue:org}]}).compileComponents();fixture=TestBed.createComponent(AuditLog);component=fixture.componentInstance;fixture.detectChanges()});
it('loads paginated newest-first events and real summary metrics',()=>{expect(api.list).toHaveBeenCalledWith(expect.objectContaining({page:0,size:20,sort:'timestamp',direction:'desc'}));expect(component.rows()).toEqual([event]);expect(component.summary().securityEvents).toBe(3)});
it('sends combined company role action module result and inclusive date filters',()=>{component.companyFilter.set(1);component.roleFilter.set(Role.COMPANY_ADMIN);component.actionFilter.set('UPDATE');component.moduleFilter.set('Staff');component.resultFilter.set('SUCCESS');component.datePreset.set('CUSTOM');component.fromDate.set('2026-08-01');component.toDate.set('2026-08-13');component.refresh();expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({companyId:1,role:Role.COMPANY_ADMIN,action:'UPDATE',module:'Staff',result:'SUCCESS',from:'2026-08-01T00:00:00',to:'2026-08-14T00:00:00'}))});
it('loads event detail and builds a readable before-after comparison',()=>{component.openDetails(event);expect(api.get).toHaveBeenCalledWith(9);expect(component.selected()).toEqual(event);expect(component.changes(event)).toEqual([{field:'department',before:'Finance',after:'IT'},{field:'position',before:'Accountant',after:'Developer'}])});
it('shows retryable load errors and no stale rows',()=>{api.list.mockReturnValueOnce(throwError(()=>new Error('network')));component.refresh();expect(component.loadError()).toBe('Check your connection and try again.');expect(component.rows()).toEqual([])});
});
