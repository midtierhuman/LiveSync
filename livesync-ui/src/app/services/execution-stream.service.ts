import { Injectable, inject, signal } from '@angular/core';
import { appEndpoints } from '../app-endpoints';
import { DocumentExecutionResponse } from './document.service';
import { AuthService } from './auth.service';

export interface StreamEvent {
  type: 'status' | 'stdout' | 'stderr' | 'exit' | 'error';
  data?: string;
  message?: string;
  status?: string;
  exitCode?: number;
  isSuccess?: boolean;
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
  private socket: WebSocket | null = null;

  readonly isStreaming = signal<boolean>(false);
  readonly streamOutput = signal<string>('');
  readonly streamErrorOutput = signal<string>('');
  readonly streamStatus = signal<string>('Idle');
  readonly finalExecutionResult = signal<DocumentExecutionResponse | null>(null);

  startExecution(language: string, code: string, timeoutMs: number = 120000) {
    this.close();

    this.isStreaming.set(true);
    this.streamOutput.set('');
    this.streamErrorOutput.set('');
    this.streamStatus.set('Connecting...');
    this.finalExecutionResult.set(null);

    const httpBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || window.location.origin;
    const wsUrl = httpBase
      .replace(/^http:\/\//, 'ws://')
      .replace(/^https:\/\//, 'wss://')
      .replace(/\/$/, '') + '/api/execution/stream';

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.streamStatus.set('Connected');
        this.socket?.send(
          JSON.stringify({
            action: 'start',
            language,
            code,
            timeoutMs,
            token: this.authService.token() || '',
          }),
        );
      };

      this.socket.onmessage = (event) => {
        try {
          const payload: StreamEvent = JSON.parse(event.data);
          this.handlePayload(payload, language);
        } catch {
          this.streamOutput.update((prev) => prev + event.data);
        }
      };

      this.socket.onerror = () => {
        this.streamStatus.set('Error');
        this.isStreaming.set(false);
      };

      this.socket.onclose = () => {
        this.isStreaming.set(false);
        if (this.streamStatus() === 'Running' || this.streamStatus() === 'Connected') {
          this.streamStatus.set('Finished');
        }
      };
    } catch (err: any) {
      this.streamStatus.set('Failed to connect');
      this.isStreaming.set(false);
    }
  }

  sendStdin(input: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const dataWithNewline = input.endsWith('\n') ? input : input + '\n';
      this.socket.send(JSON.stringify({ action: 'stdin', data: dataWithNewline }));
      this.streamOutput.update((prev) => prev + dataWithNewline);
    }
  }

  stopExecution() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: 'kill' }));
    }
    this.close();
  }

  clearOutput() {
    this.streamOutput.set('');
    this.streamErrorOutput.set('');
  }

  closeTerminal() {
    this.stopExecution();
    this.streamOutput.set('');
    this.streamErrorOutput.set('');
    this.streamStatus.set('Idle');
    this.finalExecutionResult.set(null);
    this.isStreaming.set(false);
  }

  close() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
    this.isStreaming.set(false);
  }

  private handlePayload(payload: StreamEvent, language: string) {
    switch (payload.type) {
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
      case 'exit':
        this.streamStatus.set(payload.status || 'Finished');
        this.isStreaming.set(false);
        this.finalExecutionResult.set({
          documentId: '',
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
