import { HttpClient, HttpParams } from '@angular/common/http';import { Injectable, inject } from '@angular/core';import { map } from 'rxjs';
import { environment } from '../../../environments/environment';import { skipErrorToast } from '../../core/interceptors/error.interceptor';import { ApiResponse } from '../../core/models/api.model';
export type DeskMode='ASSIGNED'|'RESERVABLE'|'DROP_IN'|'UNAVAILABLE';export type DeskAvailability='AVAILABLE'|'ASSIGNED'|'RESERVED'|'CHECKED_IN'|'UNAVAILABLE';
export interface Office{id:number;version:number;companyId:number;companyName:string;name:string;code:string;address?:string;city?:string;country?:string;timeZone:string;status:string;isDeleted:boolean}
export interface Building{id:number;version:number;officeId:number;officeName:string;companyId:number;name:string;code:string;description?:string;status:string;isDeleted:boolean}
export interface Floor{id:number;version:number;buildingId:number;buildingName:string;officeId:number;officeName:string;companyId:number;companyName:string;name:string;displayOrder:number;hasPlan:boolean;planOriginalName?:string;planMediaType?:string;planWidth?:number;planHeight?:number;mapRevision:number;status:string;isDeleted:boolean}
export interface Zone{id:number;version:number;floorId:number;name:string;code:string;colour:string;description?:string;status:string;isDeleted:boolean}
export interface Assignment{id:number;version:number;deskId:number;deskCode:string;floorId:number;floorName:string;buildingName:string;officeName:string;zoneName?:string;telephoneExtension?:string;staffId:number;staffName?:string;employeeCode?:string;departmentId?:number;departmentName?:string;positionTitle?:string;effectiveFrom:string;effectiveTo?:string;primaryAssignment:boolean;reason?:string;releaseReason?:string}
export interface SpaceAssignment{id:number;version:number;spaceId:number;spaceCode:string;spaceName:string;floorId:number;floorName:string;buildingName:string;officeName:string;staffId:number;staffName?:string;employeeCode?:string;departmentId?:number;departmentName?:string;positionTitle?:string;effectiveFrom:string;effectiveTo?:string;primaryAssignment:boolean;reason?:string;releaseReason?:string}
export interface Desk{id:number;version:number;floorId:number;zoneId?:number;zoneName?:string;spaceId?:number;spaceName?:string;code:string;displayName?:string;mode:DeskMode;availability:DeskAvailability;x:number;y:number;width:number;height:number;rotation:number;capacity:number;telephoneExtension?:string;accessible:boolean;equipmentTags?:string;notes?:string;status:string;isDeleted:boolean;assignment?:Assignment}
/** A typed physical space (cabin, meeting room, washroom, …) with permanent geometry, the successor to the room-as-zone hack. */
export type SpaceType='CABIN'|'CONFERENCE_ROOM'|'MEETING_ROOM'|'RECEPTION'|'PANTRY'|'WASHROOM'|'SERVER_ROOM'|'STORAGE'|'OPEN_WORKSPACE'|'WALKWAY'|'DOOR'|'STAIRCASE'|'ELEVATOR'|'EMERGENCY_EXIT';
export interface WorkplaceSpace{id:number;version:number;floorId:number;zoneId?:number;zoneName?:string;type:SpaceType;name:string;code:string;polygon:PlanPoint[];bbox:{x:number;y:number;width:number;height:number};rotation:number;capacity?:number;colour:string;bookable:boolean;accessible:boolean;departmentId?:number;departmentName?:string;amenities?:string;equipmentTags?:string;notes?:string;deskCount:number;status:string;isDeleted:boolean;assignment?:SpaceAssignment}
export interface FloorMap{floor:Floor;planUrl?:string;zones:Zone[];spaces:WorkplaceSpace[];desks:Desk[]}
export type DetectedObjectType='DESK'|'CABIN'|'CONFERENCE_ROOM'|'MEETING_ROOM'|'RECEPTION'|'PANTRY'|'WASHROOM'|'SERVER_ROOM'|'STORAGE'|'ZONE'|'WALKWAY'|'DOOR'|'STAIRCASE'|'ELEVATOR'|'EXIT'|'UNKNOWN';
export type DetectionSource='AUTO'|'MANUAL'|'EDITED';
/** Normalised plan coordinates: 0..1 on both axes, origin top-left. */
export interface PlanPoint{x:number;y:number}
export interface DetectedObject{id:number;floorId:number;type:DetectedObjectType;name?:string;code?:string;polygon:PlanPoint[];bbox:{x:number;y:number;width:number;height:number};center:PlanPoint;rotation:number;area:number;confidence:number;ocrText?:string;source:DetectionSource;detector?:string;deskId?:number;zoneId?:number;spaceId?:number;version:number}
export interface DetectionRun{floorId:number;detector:string;detected:number;preserved:number;objects:DetectedObject[];message:string}
export interface DeskPromotion{created:number;skipped:number;deskIds:number[]}
export interface RoomPromotion{created:number;skipped:number;spaceIds:number[]}
export interface MapContentsClearResult{desks:number;zones:number;assignments:number;detectedObjects:number}
/** What recognition can read on this deployment, known before a scan is run. */
export interface DetectionStatus{detector:string;available:boolean;visionConfigured:boolean;readableMediaTypes:string[]}
export interface DetectedObjectEdit{id?:number;type:DetectedObjectType;name?:string|null;code?:string|null;polygon:string;rotation:number;ocrText?:string|null}
export interface WorkplaceSearchResult{deskId:number;deskCode:string;floorId:number;zoneName?:string;staffId?:number;staffName?:string;employeeCode?:string;departmentName?:string;positionTitle?:string;telephoneExtension?:string;availability:DeskAvailability;matchedOn:string}
export interface WorkplaceSummary{totalDesks:number;assignedDesks:number;availableDesks:number;unavailableDesks:number;staffWithoutDesks:number;utilizationPercent:number}
export type BookingType='RESERVATION'|'DROP_IN';
export type BookingStatus='SCHEDULED'|'CHECKED_IN'|'COMPLETED'|'CANCELLED'|'NO_SHOW';
export interface DeskBooking{id:number;version:number;deskId:number;deskCode:string;floorId:number;floorName:string;buildingName:string;officeName:string;staffId:number;staffName?:string;employeeCode?:string;bookingDate:string;startTime:string;endTime:string;timeZone:string;bookingType:BookingType;status:BookingStatus;checkInTime?:string;checkOutTime?:string;cancellationReason?:string}
@Injectable({providedIn:'root'})export class WorkplaceService{private http=inject(HttpClient);private url=`${environment.apiUrl}/workplaces`;
 offices(companyId?:number|null,includeDeleted=false){let p=new HttpParams();if(companyId!=null)p=p.set('companyId',companyId);if(includeDeleted)p=p.set('includeDeleted',true);return this.get<Office[]>('/offices',p)}buildings(officeId?:number|null,includeDeleted=false){let p=new HttpParams();if(officeId!=null)p=p.set('officeId',officeId);if(includeDeleted)p=p.set('includeDeleted',true);return this.get<Building[]>('/buildings',p)}floors(buildingId?:number|null,includeDeleted=false){let p=new HttpParams();if(buildingId!=null)p=p.set('buildingId',buildingId);if(includeDeleted)p=p.set('includeDeleted',true);return this.get<Floor[]>('/floors',p)}zones(floorId?:number|null,includeDeleted=false){let p=new HttpParams();if(floorId!=null)p=p.set('floorId',floorId);if(includeDeleted)p=p.set('includeDeleted',true);return this.get<Zone[]>('/zones',p)}desks(floorId?:number|null,includeDeleted=false){let p=new HttpParams();if(floorId!=null)p=p.set('floorId',floorId);if(includeDeleted)p=p.set('includeDeleted',true);return this.get<Desk[]>('/desks',p)}
 map(id:number){return this.get<FloorMap>(`/floors/${id}/map`)}
 // plan() reports its own failure, so the generic error toast is suppressed.
 plan(id:number){return this.http.get(`${this.url}/floors/${id}/plan`,{responseType:'blob',context:skipErrorToast()})}summary(companyId?:number|null){let p=new HttpParams();if(companyId!=null)p=p.set('companyId',companyId);return this.get<WorkplaceSummary>('/summary',p)}
 // ---- floor plan recognition ----
 detectedObjects(floorId:number){return this.get<DetectedObject[]>(`/floors/${floorId}/objects`)}
 // Reports its own failure by falling back to "nothing readable", so the
 // generic error toast is suppressed.
 detectionStatus(){return this.http.get<ApiResponse<DetectionStatus>>(`${this.url}/detection/status`,{context:skipErrorToast()}).pipe(map(r=>r.data))}
 detectObjects(floorId:number){return this.post<DetectionRun>(`/floors/${floorId}/detect`,{})}
 cleanRescan(floorId:number){return this.post<DetectionRun>(`/floors/${floorId}/rescan`,{})}
 clearDetectedObjects(floorId:number){return this.http.delete<ApiResponse<void>>(`${this.url}/floors/${floorId}/objects`).pipe(map(r=>r.data))}
 clearMapContents(floorId:number){return this.http.delete<ApiResponse<MapContentsClearResult>>(`${this.url}/floors/${floorId}/contents`).pipe(map(r=>r.data))}
 saveDetectedObjects(floorId:number,objects:DetectedObjectEdit[],removedIds:number[]=[]){return this.http.put<ApiResponse<DetectedObject[]>>(`${this.url}/floors/${floorId}/objects`,{objects,removedIds}).pipe(map(r=>r.data))}
 promoteDetectedDesks(floorId:number){return this.post<DeskPromotion>(`/floors/${floorId}/objects/promote-desks`,{})}
 promoteDetectedRooms(floorId:number){return this.post<RoomPromotion>(`/floors/${floorId}/objects/promote-rooms`,{})}
 searchFloor(floorId:number,q:string){return this.get<WorkplaceSearchResult[]>(`/floors/${floorId}/search`,new HttpParams().set('q',q))}
 spaces(floorId?:number|null,includeDeleted=false){let p=new HttpParams();if(floorId!=null)p=p.set('floorId',floorId);if(includeDeleted)p=p.set('includeDeleted',true);return this.get<WorkplaceSpace[]>('/spaces',p)}
 createOffice(v:any){return this.post<Office>('/offices',v)}createBuilding(v:any){return this.post<Building>('/buildings',v)}createFloor(v:any){return this.post<Floor>('/floors',v)}createZone(v:any){return this.post<Zone>('/zones',v)}createSpace(v:any){return this.post<WorkplaceSpace>('/spaces',v)}createDesk(v:any){return this.post<Desk>('/desks',v)}
 updateOffice(id:number,v:any){return this.put<Office>(`/offices/${id}`,v)}updateBuilding(id:number,v:any){return this.put<Building>(`/buildings/${id}`,v)}updateFloor(id:number,v:any){return this.put<Floor>(`/floors/${id}`,v)}updateZone(id:number,v:any){return this.put<Zone>(`/zones/${id}`,v)}updateSpace(id:number,v:any){return this.put<WorkplaceSpace>(`/spaces/${id}`,v)}updateDesk(id:number,v:any){return this.put<Desk>(`/desks/${id}`,v)}
 transfer(assignmentId:number,targetDeskId:number,effectiveDate:string,reason:string){return this.post<Assignment>(`/assignments/${assignmentId}/transfer`,{targetDeskId,effectiveDate,reason})}history(staffId:number){return this.get<Assignment[]>(`/assignments/staff/${staffId}/history`)}
 /**
  * Batch floor-map save. Existing desks carry their real id and version so the
  * server matches on id (renaming updates the same row); a desk placed in this
  * editing session has a temporary negative id, sent as null so the server
  * creates it. `mapRevision` is the revision the map was opened at — the server
  * rejects the save with 409 if another administrator has changed the map since.
  * The generic error toast is suppressed so the component can raise the conflict
  * dialog instead.
  */
 saveDesks(floorId:number,desks:Desk[],removedDeskIds:number[],mapRevision:number){
  const items=desks.map(d=>({id:d.id>0?d.id:null,version:d.id>0?d.version:null,floorId:d.floorId,zoneId:d.zoneId??null,spaceId:d.spaceId??null,code:d.code,displayName:d.displayName??null,mode:d.mode,availability:d.availability,x:d.x,y:d.y,width:d.width,height:d.height,rotation:d.rotation,capacity:d.capacity,telephoneExtension:d.telephoneExtension??null,accessible:d.accessible,equipmentTags:d.equipmentTags??null,notes:d.notes??null,status:d.status}));
  return this.http.put<ApiResponse<Desk[]>>(`${this.url}/floors/${floorId}/desks/batch`,{desks:items,removedDeskIds,mapRevision},{context:skipErrorToast()}).pipe(map(r=>r.data))}
 uploadPlan(floorId:number,file:File){const form=new FormData();form.append('file',file);return this.http.post<ApiResponse<Floor>>(`${this.url}/floors/${floorId}/plan`,form).pipe(map(r=>r.data))}
 removePlan(floorId:number){return this.http.delete<ApiResponse<void>>(`${this.url}/floors/${floorId}/plan`).pipe(map(r=>r.data))}
 assign(deskId:number,staffId:number,effectiveFrom:string,reason:string){return this.post<Assignment>('/assignments',{deskId,staffId,effectiveFrom,primaryAssignment:true,reason})}release(a:Assignment,effectiveTo:string,reason:string){return this.post<Assignment>(`/assignments/${a.id}/release`,{effectiveTo,reason,version:a.version})}current(staffId:number){return this.get<Assignment|null>(`/assignments/staff/${staffId}/current`)}
 assignSpace(spaceId:number,staffId:number,effectiveFrom:string,reason:string){return this.post<SpaceAssignment>('/space-assignments',{spaceId,staffId,effectiveFrom,primaryAssignment:true,reason})}releaseSpace(a:SpaceAssignment,effectiveTo:string,reason:string){return this.post<SpaceAssignment>(`/space-assignments/${a.id}/release`,{effectiveTo,reason,version:a.version})}
 archive(kind:string,id:number){return this.http.delete<ApiResponse<void>>(`${this.url}/${kind}/${id}`)}restore(kind:string,id:number){return this.http.patch<ApiResponse<void>>(`${this.url}/${kind}/${id}/restore`,{})}
 // ---- desk bookings (Phase 3) ----
 book(v:{deskId:number;staffId:number;bookingDate:string;startTime:string;endTime:string;bookingType?:BookingType;timeZone?:string;dates?:string[]}){return this.post<DeskBooking[]>('/bookings',v)}
 bookingCheckIn(id:number){return this.post<DeskBooking>(`/bookings/${id}/check-in`,{})}
 bookingCheckOut(id:number){return this.post<DeskBooking>(`/bookings/${id}/check-out`,{})}
 cancelBooking(id:number,version:number,reason?:string){return this.post<DeskBooking>(`/bookings/${id}/cancel`,{version,reason})}
 bookingHistory(staffId:number){return this.get<DeskBooking[]>(`/bookings/staff/${staffId}/history`)}
 private get<T>(path:string,params?:HttpParams){return this.http.get<ApiResponse<T>>(`${this.url}${path}`,{params}).pipe(map(r=>r.data))}private post<T>(path:string,v:any){return this.http.post<ApiResponse<T>>(`${this.url}${path}`,v).pipe(map(r=>r.data))}private put<T>(path:string,v:any){return this.http.put<ApiResponse<T>>(`${this.url}${path}`,v).pipe(map(r=>r.data))}}
