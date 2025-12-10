import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SignalRService implements OnDestroy {
  private hubConnection: signalR.HubConnection;
  private isStarting = false;

  // Replace BehaviorSubject with signal
  public contentUpdate = signal<string>('');
  public connectionState = signal<string>('disconnected');
  public userJoined = signal<string>('');
  public userLeft = signal<string>('');

  private currentDocumentId: string | null = null;

  constructor() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7153/hubs/editor') // .NET API URL
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

  public startConnection = async (): Promise<void> => {
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
  };

  public joinDocument = (docId: string) => {
    this.currentDocumentId = docId;
    this.hubConnection.invoke('JoinDocument', docId);
  };

  public leaveDocument = (docId: string) => {
    this.hubConnection.invoke('LeaveDocument', docId);
    this.currentDocumentId = null;
  };

  public sendUpdate = (docId: string, content: string) => {
    this.hubConnection.invoke('SendContentUpdate', docId, content);
  };

  public addContentUpdateListener = () => {
    this.hubConnection.on('ReceiveContentUpdate', (content: string) => {
      this.contentUpdate.set(content); // <-- Use signal.set()
    });
  };

  public addUserJoinedListener = () => {
    this.hubConnection.on('UserJoined', (connectionId: string) => {
      this.userJoined.set(connectionId);
    });
  };

  public addUserLeftListener = () => {
    this.hubConnection.on('UserLeft', (connectionId: string) => {
      this.userLeft.set(connectionId);
    });
  };

  ngOnDestroy() {
    if (this.currentDocumentId) {
      this.leaveDocument(this.currentDocumentId);
    }
    this.hubConnection.stop();
  }
}
