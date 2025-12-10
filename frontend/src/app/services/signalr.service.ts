import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SignalRService implements OnDestroy {
  private hubConnection: signalR.HubConnection;

  // RxJS Subject to stream content updates to components
  public contentUpdate$ = new BehaviorSubject<string>('');
  public connectionState$ = new BehaviorSubject<string>('disconnected');
  public userJoined$ = new BehaviorSubject<string>('');
  public userLeft$ = new BehaviorSubject<string>('');

  private currentDocumentId: string | null = null;

  constructor() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7153/hubs/editor') // .NET API URL
      .withAutomaticReconnect()
      .build();

    // Track connection state changes
    this.hubConnection.onreconnecting(() => {
      this.connectionState$.next('reconnecting');
    });

    this.hubConnection.onreconnected(() => {
      this.connectionState$.next('connected');
    });

    this.hubConnection.onclose(() => {
      this.connectionState$.next('disconnected');
    });
  }

  public startConnection = () => {
    this.hubConnection
      .start()
      .then(() => {
        this.connectionState$.next('connected');
        console.log('Connection started');
      })
      .catch((err: string) => {
        this.connectionState$.next('error');
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
      this.contentUpdate$.next(content);
    });
  };

  public addUserJoinedListener = () => {
    this.hubConnection.on('UserJoined', (connectionId: string) => {
      this.userJoined$.next(connectionId);
    });
  };

  public addUserLeftListener = () => {
    this.hubConnection.on('UserLeft', (connectionId: string) => {
      this.userLeft$.next(connectionId);
    });
  };

  ngOnDestroy() {
    if (this.currentDocumentId) {
      this.leaveDocument(this.currentDocumentId);
    }
    this.hubConnection.stop();
  }
}
