import { TestBed } from '@angular/core/testing';
import { ExecutionStreamService } from './execution-stream.service';
import { AuthService } from './auth.service';

describe('ExecutionStreamService', () => {
  let service: ExecutionStreamService;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = window.WebSocket;

    TestBed.configureTestingModule({
      providers: [
        ExecutionStreamService,
        {
          provide: AuthService,
          useValue: {
            token: () => 'test-token',
          },
        },
      ],
    });

    service = TestBed.inject(ExecutionStreamService);
  });

  afterEach(() => {
    window.WebSocket = originalWebSocket;
  });

  it('uses /api/execution/stream and sends auth token in start payload', (done: DoneFn) => {
    const sentMessages: string[] = [];
    let openedSocket: any;

    class MockWebSocket {
      static readonly OPEN = 1;
      readonly OPEN = 1;
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
            expect(openedSocket.url).toContain('/api/execution/stream');
            expect(sentMessages.length).toBe(1);

            const payload = JSON.parse(sentMessages[0]);
            expect(payload.action).toBe('start');
            expect(payload.token).toBe('test-token');
            done();
          } catch (err) {
            done.fail(err as Error);
          }
        }, 0);
      }

      send(payload: string) {
        sentMessages.push(payload);
      }

      close() {}
    }

    (window as any).WebSocket = MockWebSocket;

    service.startExecution('python', 'print("ok")');
  });
});
