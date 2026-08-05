import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Editor } from './editor';
import { RealtimeService } from '../../services/realtime.service';
import { DocumentService } from '../../services/document.service';
import { PackageManagerService } from '../../services/package-manager.service';
import { AuthService } from '../../services/auth.service';

describe('Editor', () => {
  let component: Editor;
  let fixture: ComponentFixture<Editor>;

  beforeEach(async () => {
    const realtimeStub = {
      contentUpdate: signal(''),
      cursorUpdate: signal(null),
      activeCollaborators: signal([]),
      followedUserId: signal(null),
      comments: signal([]),
      userJoined: signal(''),
      userLeft: signal(''),
      connectionState: signal('disconnected'),
      activeUserCount: signal(0),
      startConnection: jasmine.createSpy().and.resolveTo(),
      joinDocument: jasmine.createSpy().and.resolveTo(),
      leaveDocument: jasmine.createSpy().and.resolveTo(),
      sendUpdate: jasmine.createSpy().and.resolveTo(),
      addContentUpdateListener: jasmine.createSpy(),
      addUserJoinedListener: jasmine.createSpy(),
      addUserLeftListener: jasmine.createSpy(),
    };

    const packageManagerStub = {
      packageLanguageSupport: signal(null),
      packageLanguageSupportLoading: signal(false),
      activeTab: signal('discover'),
      searchPackagesReactive: jasmine.createSpy(),
      fetchLanguageSupport: jasmine.createSpy().and.resolveTo({ supported: true, package_language: 'python' }),
      fetchInstalledPackages: jasmine.createSpy().and.resolveTo([]),
      fetchPopularPackages: jasmine.createSpy().and.resolveTo([]),
      installingPackages: signal(new Set()),
      uninstallingPackages: signal(new Set()),
      installedPackages: signal([]),
      searchResults: signal([]),
      popularPackages: signal([]),
      lastInstallOutput: signal(''),
      installError: signal(''),
      selectedCategory: signal('All'),
      toastNotice: signal(null),
    };

    const authStub = {
      token: signal('test-token'),
    };

    await TestBed.configureTestingModule({
      imports: [Editor],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { params: of({}) } },
        { provide: RealtimeService, useValue: realtimeStub },
        { provide: DocumentService, useValue: {} },
        { provide: PackageManagerService, useValue: packageManagerStub },
        { provide: AuthService, useValue: authStub },
      ],
    });
    fixture = TestBed.createComponent(Editor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

