import { Injectable, signal, DestroyRef, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth.service';
import { appEndpoints } from '../app-endpoints';

@Injectable({
  providedIn: 'root',
})
export class RealtimeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private socket!: Socket;
  private isStarting = false;

  // Signals for reactive state
  readonly contentUpdate = signal<string>('');
  readonly connectionState = signal<string>('disconnected');
  readonly userJoined = signal<string>('');
  readonly userLeft = signal<string>('');
  readonly activeUserCount = signal<number>(0);
  readonly cursorUpdate = signal<{ userId: string; position: number; color: string } | null>(null);
  readonly activeUsers = signal<Array<{ id: string; color: string }>>([]);

  private currentDocumentId: string | null = null;
  private isJoined = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.currentDocumentId) {
        this.leaveDocument(this.currentDocumentId);
      }
      if (this.socket) {
        this.socket.disconnect();
      }
    });

    const serverUrl = appEndpoints.realtimeBaseUrl || appEndpoints.signalRBaseUrl || 'http://localhost:5038';
    this.socket = io(serverUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      query: {
        access_token: this.authService.token() || '',
      },
    });

    this.socket.on('connect', () => {
      this.connectionState.set('connected');
      console.log('Realtime Socket Connected successfully:', this.socket.id);
      if (this.currentDocumentId) {
        this.socket.emit('JoinDocument', this.currentDocumentId);
        this.isJoined = true;
      }
    });

    this.socket.on('disconnect', () => {
      this.connectionState.set('disconnected');
      console.log('Realtime Socket Disconnected');
    });

    this.socket.on('connect_error', (err) => {
      this.connectionState.set('error');
      console.error('Realtime Socket Connection error:', err);
    });

    // Wire listeners
    this.socket.on('ReceiveContentUpdate', (content: string) => {
      this.contentUpdate.set(content);
    });

    this.socket.on('UserJoined', (connectionId: string, count: number) => {
      this.userJoined.set(connectionId);
      this.activeUserCount.set(count);
    });

    this.socket.on('UserLeft', (connectionId: string, count: number) => {
      this.userLeft.set(connectionId);
      this.activeUserCount.set(count);
    });

    this.socket.on('ReceiveCursorUpdate', (userId: string, position: number, color: string) => {
      this.cursorUpdate.set({ userId, position, color });
    });
  }

  async startConnection(): Promise<void> {
    if (this.socket.connected) {
      this.connectionState.set('connected');
      return;
    }

    if (this.isStarting) return;
    this.isStarting = true;

    try {
      const token = this.authService.token() || '';
      (this.socket as any).io.opts.query = { access_token: token };

      this.socket.connect();
      this.isStarting = false;
    } catch (err) {
      this.connectionState.set('error');
      this.isStarting = false;
      console.error('Error starting Realtime Socket connection:', err);
      throw err;
    }
  }

  async joinDocument(docId: string): Promise<void> {
    if (this.currentDocumentId === docId && this.isJoined) {
      return;
    }

    if (this.currentDocumentId && this.isJoined && this.currentDocumentId !== docId) {
      await this.leaveDocument(this.currentDocumentId);
    }

    this.socket.emit('JoinDocument', docId);
    this.currentDocumentId = docId;
    this.isJoined = true;
  }

  async leaveDocument(docId: string): Promise<void> {
    if (!this.isJoined || this.currentDocumentId !== docId) {
      return;
    }

    this.socket.emit('LeaveDocument', docId);
    this.currentDocumentId = null;
    this.isJoined = false;
    this.activeUserCount.set(0);
  }

  sendUpdate(docId: string, content: string): Promise<void> {
    this.socket.emit('SendContentUpdate', docId, content);
    return Promise.resolve();
  }

  sendCursorPosition(docId: string, position: number): Promise<void> {
    this.socket.emit('SendCursorPosition', docId, position);
    return Promise.resolve();
  }

  addContentUpdateListener() {}
  addUserJoinedListener() {}
  addUserLeftListener() {}
  addCursorUpdateListener() {}
}
