import { Injectable, signal, DestroyRef, inject } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class SignalRService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private hubConnection: signalR.HubConnection;
  private isStarting = false;

  // Signals for reactive state (no RxJS needed!)
  readonly contentUpdate = signal<string>('');
  readonly connectionState = signal<string>('disconnected');
  readonly userJoined = signal<string>('');
  readonly userLeft = signal<string>('');
  readonly activeUserCount = signal<number>(0);
  readonly cursorUpdate = signal<{ userId: string; position: number; color: string } | null>(null);
  readonly activeUsers = signal<Array<{ id: string; color: string }>>([]);

  private currentDocumentId: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.currentDocumentId) {
        this.leaveDocument(this.currentDocumentId);
      }
      this.hubConnection.stop();
    });
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7000/hubs/editor', {
        accessTokenFactory: () => this.authService.token() || '',
      }) // .NET API URL with JWT token
      .withAutomaticReconnect()
      .build();

    // Track connection state changes
    this.hubConnection.onreconnecting(() => {
      this.connectionState.set('reconnecting');
    });

    this.hubConnection.onreconnected(() => {
      this.connectionState.set('connected');
    });

    this.hubConnection.onclose(() => {
      this.connectionState.set('disconnected');
    });
  }

  async startConnection(): Promise<void> {
    // Prevent multiple simultaneous start attempts
    if (this.isStarting) {
      return;
    }

    // If already connected, return immediately
    if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.connectionState.set('connected');
      console.log('Already connected');
      return Promise.resolve();
    }

    // If disconnected but was previously connected (e.g., after HMR), reset it
    if (this.hubConnection.state !== signalR.HubConnectionState.Disconnected) {
      console.log('Resetting connection state...');
      try {
        await this.hubConnection.stop();
      } catch (err) {
        console.warn('Error stopping connection:', err);
      }
    }

    this.isStarting = true;

    try {
      await this.hubConnection.start();
      this.connectionState.set('connected');
      this.isStarting = false;
      console.log('SignalR Connection started successfully');
    } catch (err: unknown) {
      this.connectionState.set('error');
      this.isStarting = false;
      console.error('Error while starting SignalR connection:', err);
      throw err;
    }
  }

  joinDocument(docId: string) {
    this.currentDocumentId = docId;
    this.hubConnection.invoke('JoinDocument', docId);
  }

  leaveDocument(docId: string) {
    this.hubConnection.invoke('LeaveDocument', docId);
    this.currentDocumentId = null;
  }

  sendUpdate(docId: string, content: string) {
    this.hubConnection.invoke('SendContentUpdate', docId, content);
  }

  addContentUpdateListener() {
    this.hubConnection.on('ReceiveContentUpdate', (content: string) => {
      this.contentUpdate.set(content);
    });
  }

  addUserJoinedListener() {
    this.hubConnection.on('UserJoined', (connectionId: string, count: number) => {
      this.userJoined.set(connectionId);
      this.activeUserCount.set(count);
      console.log(`User joined: ${connectionId}, Active users: ${count}`);
    });
  }

  addUserLeftListener() {
    this.hubConnection.on('UserLeft', (connectionId: string, count: number) => {
      this.userLeft.set(connectionId);
      this.activeUserCount.set(count);
      console.log(`User left: ${connectionId}, Active users: ${count}`);
    });
  }

  sendCursorPosition(docId: string, position: number) {
    this.hubConnection.invoke('SendCursorPosition', docId, position);
  }

  addCursorUpdateListener() {
    this.hubConnection.on(
      'ReceiveCursorUpdate',
      (userId: string, position: number, color: string) => {
        this.cursorUpdate.set({ userId, position, color });
      }
    );
  }
}
