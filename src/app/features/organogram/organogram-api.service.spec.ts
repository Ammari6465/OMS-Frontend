import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OrganogramApiService } from './organogram-api.service';
describe('OrganogramApiService', () => {
  let api: OrganogramApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OrganogramApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(OrganogramApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('loads one minimal company-scoped hierarchy payload', async () => {
    const result = firstValueFrom(api.get(4, 'POSITION', false));
    const req = http.expectOne((r) => r.url === `${environment.apiUrl}/organogram`);
    expect(req.request.params.get('companyId')).toBe('4');
    expect(req.request.params.get('view')).toBe('POSITION');
    expect(req.request.params.get('includeVacancies')).toBe('false');
    req.flush({
      success: true,
      data: {
        company: { id: 4, name: 'A' },
        view: 'POSITION',
        nodes: [],
        rootIds: [],
        orphanIds: [],
        departments: [],
        vacancies: [],
        dataVersion: 1,
        generatedAt: '',
        capabilities: { canEditHierarchy: false, canViewContactDetails: false },
        warnings: [],
      },
      timestamp: '',
    });
    expect((await result).company.id).toBe(4);
  });
  it('uses the dedicated optimistic manager patch', async () => {
    const result = firstValueFrom(api.changeManager(9, 3, 7));
    const req = http.expectOne(`${environment.apiUrl}/staff/9/manager`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ managerId: 3, version: 7 });
    req.flush({
      success: true,
      data: {
        id: 9,
        parentId: 3,
        companyId: 1,
        departmentId: 2,
        name: 'A',
        version: 8,
        vacant: false,
      },
      timestamp: '',
    });
    expect((await result).version).toBe(8);
  });
});
