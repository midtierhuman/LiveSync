import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WorkspaceSearchService } from './workspace-search.service';
import { AuthService } from './auth.service';
import { signal } from '@angular/core';

describe('WorkspaceSearchService', () => {
  let service: WorkspaceSearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    const authStub = {
      token: signal('test-token'),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        WorkspaceSearchService,
        { provide: AuthService, useValue: authStub },
      ],
    });

    service = TestBed.inject(WorkspaceSearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should perform workspace search and populate signals', async () => {
    service.query.set('testQuery');
    const searchPromise = service.search('proj-123');

    const req = httpMock.expectOne((r) => r.url.includes('/api/workspaces/proj-123/search'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('query')).toBe('testQuery');

    req.flush({
      status: 'ok',
      projectId: 'proj-123',
      query: 'testQuery',
      totalMatches: 3,
      totalFiles: 2,
      durationMs: 12,
      results: [
        {
          file: 'src/main.ts',
          matchCount: 2,
          matches: [
            {
              lineNumber: 10,
              lineContent: 'const testQuery = true;',
              preview: 'const testQuery = true;',
              startColumn: 6,
              endColumn: 15,
              matchText: 'testQuery',
            },
          ],
        },
      ],
    });

    const res = await searchPromise;
    expect(res.totalMatches).toBe(3);
    expect(service.totalMatches()).toBe(3);
    expect(service.totalFiles()).toBe(2);
    expect(service.searchResults().length).toBe(1);
  });

  it('should toggle collapse states correctly', () => {
    service.toggleFileCollapse('src/index.ts');
    expect(service.collapsedFiles().has('src/index.ts')).toBeTrue();

    service.toggleFileCollapse('src/index.ts');
    expect(service.collapsedFiles().has('src/index.ts')).toBeFalse();
  });

  it('should clear search results and reset signals', () => {
    service.query.set('hello');
    service.totalMatches.set(5);
    service.clearSearch();

    expect(service.query()).toBe('');
    expect(service.totalMatches()).toBe(0);
    expect(service.searchResults().length).toBe(0);
  });
});
