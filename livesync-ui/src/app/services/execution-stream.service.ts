import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { appEndpoints } from '../app-endpoints';
import { DocumentExecutionResponse } from './document.service';
import { AuthService } from './auth.service';

export interface StreamEvent {
  type: 'status' | 'stdout' | 'stderr' | 'waiting_input' | 'exit' | 'error' | 'clear';
  data?: string;
  message?: string;
  status?: string;
  requiresInput?: boolean;
  prompt?: string;
  exitCode?: number;
  isSuccess?: boolean;
  sessionId?: string;
  executionDurationMs?: number;
  peakMemoryBytes?: number;
  cpuTimeMs?: number;
  timeComplexity?: string;
  spaceComplexity?: string;
  complexityExplanation?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ExecutionStreamService {
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private socket: WebSocket | null = null;
  private currentLanguage: string = 'python';
  private currentDocumentId: string = '';
  private activeSessionId: string = 'default';
  private isClosedManually: boolean = false;
  private pendingConnectedCallbacks: (() => void)[] = [];

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.close();
    });
  }

  readonly isStreaming = signal<boolean>(false);
  readonly streamOutput = signal<string>('');
  readonly streamErrorOutput = signal<string>('');
  readonly streamStatus = signal<string>('Idle');
  readonly requiresInput = signal<boolean>(false);
  readonly inputPrompt = signal<string>('');
  readonly finalExecutionResult = signal<DocumentExecutionResponse | null>(null);

  ensureConnection(onConnected: () => void) {
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        onConnected();
        return;
      }
      if (this.socket.readyState === WebSocket.CONNECTING) {
        this.pendingConnectedCallbacks.push(onConnected);
        return;
      }
      // If socket is in CLOSING or CLOSED state, close and nullify it first
      this.close();
    }

    this.pendingConnectedCallbacks.push(onConnected);

    const httpBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || window.location.origin;
    const wsUrl = httpBase
      .replace(/^http:\/\//, 'ws://')
      .replace(/^https:\/\//, 'wss://')
      .replace(/\/$/, '') + '/api/execution/stream';

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.streamStatus.set('Connected');
        const callbacks = [...this.pendingConnectedCallbacks];
        this.pendingConnectedCallbacks = [];
        callbacks.forEach((cb) => cb());
      };

      this.socket.onmessage = (event) => {
        try {
          const payload: StreamEvent = JSON.parse(event.data);
          this.handlePayload(payload, this.currentLanguage);
        } catch {
          if (!this.isClosedManually) {
            this.streamOutput.update((prev) => prev + event.data);
          }
        }
      };

      this.socket.onerror = () => {
        if (this.streamStatus() !== 'Finished' && this.streamStatus() !== 'Completed' && !this.isClosedManually) {
          this.streamStatus.set('Error');
        }
        this.isStreaming.set(false);
      };

      this.socket.onclose = () => {
        this.socket = null;
        this.pendingConnectedCallbacks = [];
        this.isStreaming.set(false);
        if ((this.streamStatus() === 'Running' || this.streamStatus() === 'Connected') && !this.isClosedManually) {
          this.streamStatus.set('Finished');
        }
      };
    } catch (err: any) {
      this.streamStatus.set('Failed to connect');
      this.isStreaming.set(false);
      this.pendingConnectedCallbacks = [];
    }
  }

  startExecution(
    language: string,
    code: string,
    timeoutMs: number = 120000,
    cols: number = 80,
    rows: number = 24,
    sessionId?: string,
    documentId?: string,
  ) {
    this.currentLanguage = language;
    this.currentDocumentId = documentId || '';
    this.activeSessionId = sessionId || `term_${Date.now()}`;
    this.isClosedManually = false;
    this.isStreaming.set(true);
    this.streamOutput.set('');
    this.streamErrorOutput.set('');
    this.requiresInput.set(false);
    this.inputPrompt.set('');
    this.streamStatus.set('Connecting...');
    this.finalExecutionResult.set(null);

    this.ensureConnection(() => {
      this.streamStatus.set('Running');
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(
          JSON.stringify({
            action: 'start',
            language,
            code,
            timeoutMs,
            cols,
            rows,
            sessionId: this.activeSessionId,
            token: this.authService.token() || '',
          }),
        );
      }
    });
  }

  sendStdin(input: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const dataWithNewline = input.endsWith('\n') ? input : input + '\n';
      this.socket.send(
        JSON.stringify({
          action: 'stdin',
          data: dataWithNewline,
          sessionId: this.activeSessionId,
        }),
      );
    }
  }

  sendInput(data: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          action: 'input',
          data,
          sessionId: this.activeSessionId,
        }),
      );
    }
  }

  sendResize(cols: number, rows: number) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          action: 'resize',
          cols,
          rows,
          sessionId: this.activeSessionId,
        }),
      );
    }
  }

  stopExecution() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(
          JSON.stringify({
            action: 'kill',
            sessionId: this.activeSessionId,
          }),
        );
      } catch {}
    }
    this.isStreaming.set(false);
  }

  clearOutput() {
    this.streamOutput.set('');
    this.streamErrorOutput.set('');
  }

  closeTerminal() {
    this.isClosedManually = true;
    this.stopExecution();
    this.close();
    this.streamOutput.set('');
    this.streamErrorOutput.set('');
    this.streamStatus.set('Idle');
    this.finalExecutionResult.set(null);
    this.requiresInput.set(false);
    this.isStreaming.set(false);
  }

  close() {
    if (this.socket) {
      try {
        if (
          this.socket.readyState === WebSocket.OPEN ||
          this.socket.readyState === WebSocket.CONNECTING
        ) {
          this.socket.close();
        }
      } catch {}
      this.socket = null;
    }
    this.pendingConnectedCallbacks = [];
    this.isStreaming.set(false);
  }

  private handlePayload(payload: StreamEvent, language: string) {
    if (this.isClosedManually) {
      return;
    }

    switch (payload.type) {
      case 'clear':
        this.streamOutput.set('');
        this.streamErrorOutput.set('');
        break;
      case 'status':
        this.streamStatus.set(payload.status || 'Running');
        break;
      case 'stdout':
        if (payload.data) {
          this.streamOutput.update((prev) => prev + payload.data);
        }
        break;
      case 'stderr':
        if (payload.data) {
          this.streamErrorOutput.update((prev) => prev + payload.data);
        }
        break;
      case 'waiting_input':
        this.requiresInput.set(true);
        this.inputPrompt.set(payload.prompt || 'Input required');
        this.streamStatus.set('Waiting for Input');
        break;
      case 'exit':
        if (payload.status === 'Killed') {
          this.finalExecutionResult.set(null);
          this.streamOutput.set('');
          this.streamErrorOutput.set('');
          this.streamStatus.set('Idle');
          this.isStreaming.set(false);
          this.requiresInput.set(false);
          break;
        }

        this.streamStatus.set(payload.status || 'Finished');
        this.isStreaming.set(false);
        this.finalExecutionResult.set({
          documentId: this.currentDocumentId,
          language,
          status: payload.status || 'Finished',
          isSuccess: payload.isSuccess ?? (payload.exitCode === 0),
          message: payload.isSuccess ? 'Execution completed.' : `Exited with code ${payload.exitCode}`,
          standardOutput: this.streamOutput(),
          standardError: this.streamErrorOutput(),
          executionDurationMs: payload.executionDurationMs,
          peakMemoryBytes: payload.peakMemoryBytes,
          cpuTimeMs: payload.cpuTimeMs,
          timeComplexity: payload.timeComplexity,
          spaceComplexity: payload.spaceComplexity,
          complexityExplanation: payload.complexityExplanation,
          requestedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
        break;
      case 'error':
        this.streamStatus.set('Error');
        this.streamErrorOutput.update((prev) => prev + `\n${payload.message || 'Stream error'}`);
        this.isStreaming.set(false);
        break;
    }
  }
}
