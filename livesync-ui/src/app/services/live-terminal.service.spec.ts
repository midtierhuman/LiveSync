import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { LiveTerminalService } from './live-terminal.service';
import { AuthService } from './auth.service';
import { WorkspaceSyncService } from './workspace-sync.service';

describe('LiveTerminalService (Multi-Terminal Tabs)', () => {
  let service: LiveTerminalService;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = window.WebSocket;

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        LiveTerminalService,
        {
          provide: AuthService,
          useValue: {
            token: () => 'test-terminal-token',
          },
        },
        {
          provide: WorkspaceSyncService,
          useValue: {
            syncWorkspace: jasmine.createSpy('syncWorkspace').and.returnValue(Promise.resolve({ status: 'ok' })),
          },
        },
      ],
    });

    service = TestBed.inject(LiveTerminalService);
  });

  afterEach(() => {
    window.WebSocket = originalWebSocket;
    service.destroy();
  });

  it('creates and attaches multi-terminal tabs with distinct session IDs', () => {
    const sentUrls: string[] = [];

    class MockWebSocket {
      static readonly OPEN = 1;
      readonly OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;

      constructor(public readonly url: string) {
        sentUrls.push(url);
        setTimeout(() => {
          if (this.onopen) this.onopen();
        }, 0);
      }

      send() {}
      close() {}
    }

    (window as any).WebSocket = MockWebSocket;

    const dummyHost = document.createElement('div');
    service.attachToElement(dummyHost, 'proj-123', true, 'my-project');

    expect(service.terminalTabs().length).toBe(1);
    expect(service.terminalTabs()[0].name).toBe('Terminal 1');

    const tab2Id = service.createTab('npm run dev');
    expect(service.terminalTabs().length).toBe(2);
    expect(service.activeTabId()).toBe(tab2Id);

    // Switch tab
    const tab1Id = service.terminalTabs()[0].id;
    service.switchTab(tab1Id);
    expect(service.activeTabId()).toBe(tab1Id);

    // Find tab by name
    expect(service.findTabByName('npm run dev')).toBe(tab2Id);
    expect(service.findTabByName('NPM RUN DEV')).toBe(tab2Id);
    expect(service.findTabByName('Nonexistent Tab')).toBeNull();

    // Close tab 2
    service.closeTab(tab2Id);
    expect(service.terminalTabs().length).toBe(1);
    expect(service.activeTabId()).toBe(tab1Id);
  });

  it('syncs workspace files over active websocket', () => {
    const sentMessages: string[] = [];

    class MockWebSocket {
      static readonly OPEN = 1;
      readonly OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;

      constructor(public readonly url: string) {}

      send(payload: string) {
        sentMessages.push(payload);
      }

      close() {}
    }

    (window as any).WebSocket = MockWebSocket;

    const dummyHost = document.createElement('div');
    service.attachToElement(dummyHost, 'proj-abc');

    service.syncFiles({ 'main.py': 'print("hello")' });

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const syncMsg = sentMessages.find((m) => {
      try {
        return JSON.parse(m).action === 'sync_files';
      } catch {
        return false;
      }
    });
    expect(syncMsg).toBeDefined();
  });
});
