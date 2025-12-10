import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SignalRService implements OnDestroy {
  private hubConnection: signalR.HubConnection;

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

  ngOnInit() {
    // This is no longer needed - moved to constructor
  }

  public startConnection = () => {
    this.hubConnection
      .start()
      .then(() => {
        this.connectionState.set('connected');
        console.log('Connection started');
      })
      .catch((err: string) => {
        this.connectionState.set('error');
        console.log('Error while starting connection: ' + err);
      });
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
