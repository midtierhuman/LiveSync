import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { WorkspaceSyncService } from './workspace-sync.service';
import { AuthService } from './auth.service';
import { appEndpoints } from '../app-endpoints';

describe('WorkspaceSyncService', () => {
  let service: WorkspaceSyncService;
  let httpMock: HttpTestingController;
  const mockAuthService = {
    token: () => 'mock-jwt-token',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        WorkspaceSyncService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    service = TestBed.inject(WorkspaceSyncService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should post sync payload to /api/workspaces/:id/sync atomically', async () => {
    const files = { 'src/index.ts': 'console.log("hello")' };
    const syncPromise = service.syncWorkspace('proj-123', files, ['locked.ts']);

    const baseUrl = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || window.location.origin;
    const req = httpMock.expectOne(`${baseUrl}/api/workspaces/proj-123/sync`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer mock-jwt-token');
    expect(req.request.body).toEqual({
      projectId: 'proj-123',
      files,
      lockedFiles: ['locked.ts'],
    });

    req.flush({
      status: 'ok',
      projectId: 'proj-123',
      syncedCount: 1,
      hashes: { 'src/index.ts': 'hash123' },
      timestamp: 123456789,
    });

    const res = await syncPromise;
    expect(res.status).toBe('ok');
    expect(res.syncedCount).toBe(1);
    expect(service.lastSyncTime()).toBe(123456789);
    expect(service.syncedHashes()['src/index.ts']).toBe('hash123');
  });

  it('should fetch workspace file hashes via GET /api/workspaces/:id/sync', async () => {
    const getPromise = service.getWorkspaceFiles('proj-123');

    const baseUrl = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || window.location.origin;
    const req = httpMock.expectOne(`${baseUrl}/api/workspaces/proj-123/sync`);
    expect(req.request.method).toBe('GET');

    req.flush({
      status: 'ok',
      projectId: 'proj-123',
      files: { 'src/index.ts': 'hash123' },
      timestamp: 123456789,
    });

    const files = await getPromise;
    expect(files['src/index.ts']).toBe('hash123');
  });
});
