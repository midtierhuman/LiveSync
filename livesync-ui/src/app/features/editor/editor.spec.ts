import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Editor } from './editor';
import { RealtimeService } from '../../services/realtime.service';
import { DocumentService } from '../../services/document.service';

describe('Editor', () => {
  let component: Editor;
  let fixture: ComponentFixture<Editor>;

  beforeEach(async () => {
    const realtimeStub = {
      contentUpdate: signal(''),
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

    await TestBed.configureTestingModule({
      imports: [Editor],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { params: of({}) } },
        { provide: RealtimeService, useValue: realtimeStub },
        { provide: DocumentService, useValue: {} },
      ],
    })
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
