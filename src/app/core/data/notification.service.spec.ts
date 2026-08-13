import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { NotificationService } from './notification.service';

describe('NotificationService',()=>{let service:NotificationService;let http:HttpTestingController;const envelope=<T>(data:T)=>({success:true,data,timestamp:new Date().toISOString()});
beforeEach(()=>{TestBed.configureTestingModule({providers:[NotificationService,MessageService,{provide:AuthService,useValue:{token:null}},provideHttpClient(),provideHttpClientTesting()]});service=TestBed.inject(NotificationService);http=TestBed.inject(HttpTestingController)});afterEach(()=>http.verify());
it('sends paging and combined notification filters to the server',async()=>{const result=firstValueFrom(service.list({page:2,size:20,search:'vacancy',category:'VACANCY',priority:'HIGH',read:false}));const req=http.expectOne(r=>r.url===`${environment.apiUrl}/notifications`);expect(req.request.params.get('page')).toBe('2');expect(req.request.params.get('category')).toBe('VACANCY');expect(req.request.params.get('priority')).toBe('HIGH');expect(req.request.params.get('read')).toBe('false');req.flush(envelope({content:[],page:2,size:20,totalElements:0,totalPages:0,first:false,last:true,numberOfElements:0,empty:true}));await result});
it('uses the recipient read-state endpoint and updates the unread signal',async()=>{service.summary.set({total:1,unread:1,today:1});const promise=firstValueFrom(service.setRead(7,true));const req=http.expectOne(`${environment.apiUrl}/notifications/7/read`);expect(req.request.method).toBe('PATCH');expect(req.request.body).toEqual({isRead:true});req.flush(envelope({id:7,type:'SYSTEM',title:'System notification',message:'Done',icon:'pi pi-bell',color:'#0f8bfd',category:'SYSTEM',priority:'NORMAL',isRead:true,createdAt:new Date().toISOString()}));await promise;expect(service.unread()).toBe(0)});
});
