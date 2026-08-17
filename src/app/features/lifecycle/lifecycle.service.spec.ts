import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LifecycleService, LifecycleWorkflow } from './lifecycle.service';

describe('LifecycleService',()=>{
 let service:LifecycleService;let http:HttpTestingController;
 beforeEach(()=>{TestBed.configureTestingModule({providers:[LifecycleService,provideHttpClient(),provideHttpClientTesting()]});service=TestBed.inject(LifecycleService);http=TestBed.inject(HttpTestingController)});
 afterEach(()=>http.verify());
 it('loads a filtered workflow queue',()=>{service.list({type:'LEAVER',status:'PENDING_APPROVAL'}).subscribe(page=>expect(page.totalElements).toBe(1));const req=http.expectOne(r=>r.url.endsWith('/lifecycle-workflows'));expect(req.request.params.get('type')).toBe('LEAVER');expect(req.request.params.get('status')).toBe('PENDING_APPROVAL');req.flush({success:true,data:{content:[{}],totalElements:1,page:0,size:20,totalPages:1,first:true,last:true,numberOfElements:1,empty:false},timestamp:''})});
 it('sends optimistic version when submitting',()=>{const w={id:9,version:4} as LifecycleWorkflow;service.submit(w).subscribe();const req=http.expectOne(r=>r.url.endsWith('/9/submit'));expect(req.request.body).toEqual({version:4});req.flush({success:true,data:w,timestamp:''})});
 it('records a required rejection reason',()=>{const w={id:9,version:4} as LifecycleWorkflow;service.reject(w,'Insufficient handover').subscribe();const req=http.expectOne(r=>r.url.endsWith('/9/reject'));expect(req.request.params.get('version')).toBe('4');expect(req.request.body.reason).toBe('Insufficient handover');req.flush({success:true,data:w,timestamp:''})});
});
