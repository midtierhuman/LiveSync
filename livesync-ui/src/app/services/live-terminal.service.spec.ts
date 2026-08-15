import { TestBed } from '@angular/core/testing';
import { LiveTerminalService } from './live-terminal.service';
import { AuthService } from './auth.service';

describe('LiveTerminalService', () => {
  let service: LiveTerminalService;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = window.WebSocket;

    TestBed.configureTestingModule({
      providers: [
        LiveTerminalService,
        {
          provide: AuthService,
          useValue: {
            token: () => 'test-terminal-token',
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

  it('connects to /api/terminal/ws with projectId and token', (done: DoneFn) => {
    const sentMessages: string[] = [];
    let openedSocket: any;

    class MockWebSocket {
      static readonly OPEN = 1;
      static readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CONNECTING = 0;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;

      constructor(public readonly url: string) {
        openedSocket = this;
        setTimeout(() => {
          if (this.onopen) this.onopen();
          try {
            expect(openedSocket.url).toContain('/api/terminal/ws');
            expect(openedSocket.url).toContain('projectId=proj-123');
            expect(openedSocket.url).toContain('token=test-terminal-token');
            expect(service.isConnected()).toBe(true);
            done();
          } catch (err) {
            done.fail(err as Error);
          }
        }, 0);
      }

      send(payload: string) {
        sentMessages.push(payload);
      }

      close() {
        this.readyState = 3;
        if (this.onclose) this.onclose();
      }
    }

    (window as any).WebSocket = MockWebSocket;

    service.connect('proj-123');
  });

  it('syncs workspace files over websocket', () => {
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

    service.connect('proj-abc');
    (service as any).socket = new MockWebSocket('ws://test');

    service.syncFiles({ 'main.py': 'print("hello")' });

    expect(sentMessages.length).toBe(1);
    const parsed = JSON.parse(sentMessages[0]);
    expect(parsed.action).toBe('sync_files');
    expect(parsed.files['main.py']).toBe('print("hello")');
  });
});
