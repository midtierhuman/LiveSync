import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PackageManagerService } from './package-manager.service';
import { AuthService } from './auth.service';

describe('PackageManagerService', () => {
  let service: PackageManagerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PackageManagerService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            token: () => 'test-token',
          },
        },
      ],
    });

    service = TestBed.inject(PackageManagerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('showToast compares toast by object identity and auto-dismisses after timeout', () => {
    jasmine.clock().install();
    try {
      service.showToast('First toast', 'info');
      expect(service.toastNotice()?.text).toBe('First toast');

      // Show a second toast before the first toast timer expires
      jasmine.clock().tick(2000);
      service.showToast('Second toast', 'success');
      expect(service.toastNotice()?.text).toBe('Second toast');

      // Fast-forward to when the first toast timer expires (4000ms total)
      jasmine.clock().tick(2000);
      // Second toast should still be active because the first timer checks object identity
      expect(service.toastNotice()?.text).toBe('Second toast');

      // Fast-forward remaining 2000ms for second toast to expire
      jasmine.clock().tick(2000);
      expect(service.toastNotice()).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('fetchLanguageSupport returns response from sandbox API', async () => {
    const promise = service.fetchLanguageSupport('python');

    const req = httpMock.expectOne((r) => r.url.includes('/api/packages/support'));
    expect(req.request.method).toBe('GET');
    req.flush({
      requested_language: 'python',
      supported: true,
      package_language: 'python',
      package_display_name: 'Python / pip',
      message: 'Python / pip',
    });

    const res = await promise;
    expect(res.supported).toBeTrue();
    expect(service.packageLanguageSupport()?.package_language).toBe('python');
  });

  it('installPackage sets lastInstallOutput and clears installError on success', async () => {
    service.installError.set('Previous error');

    const promise = service.installPackage('requests', 'python');

    const req = httpMock.expectOne((r) => r.url.includes('/api/packages/install'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ language: 'python', package_name: 'requests' });

    req.flush({
      success: true,
      language: 'python',
      package_name: 'requests',
      message: 'Successfully installed requests.',
      output: 'Successfully installed requests.',
    });

    // Allow microtasks to run so fetchInstalledPackages emits HTTP request
    await Promise.resolve();

    const listReq = httpMock.expectOne((r) => r.url.includes('/api/packages/list'));
    listReq.flush({ language: 'python', packages: [{ name: 'requests', version: '2.31.0' }] });

    const res = await promise;
    expect(res.success).toBeTrue();
    expect(res.package_name).toBe('requests');
    expect(service.installError()).toBe('');
  });

  it('uninstallPackage handles failure and updates installError signal', async () => {
    const promise = service.uninstallPackage('invalid-pkg', 'python');

    const req = httpMock.expectOne((r) => r.url.includes('/api/packages/uninstall'));
    expect(req.request.method).toBe('POST');

    req.flush({
      success: false,
      language: 'python',
      package_name: 'invalid-pkg',
      message: 'Package not found.',
      output: 'Package not found.',
    });

    const res = await promise;
    expect(res.success).toBeFalse();
    expect(service.installError()).toBe('Package not found.');
  });
});
