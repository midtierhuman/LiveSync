import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SignalRService {
  private hubConnection: signalR.HubConnection;

  // RxJS Subject to stream content updates to components
  public contentUpdate$ = new BehaviorSubject<string>('');

  constructor() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7153/hubs/editor') // .NET API URL
      .withAutomaticReconnect()
      .build();
  }

  public startConnection = () => {
    this.hubConnection
      .start()
      .then(() => console.log('Connection started'))
      .catch((err: string) => console.log('Error while starting connection: ' + err));
  };

  public joinDocument = (docId: string) => {
    this.hubConnection.invoke('JoinDocument', docId);
  };

  public sendUpdate = (docId: string, content: string) => {
    this.hubConnection.invoke('SendContentUpdate', docId, content);
  };

  public addTransferChartDataListener = () => {
    this.hubConnection.on('ReceiveContentUpdate', (content: string) => {
      this.contentUpdate$.next(content);
    });
  };
}
