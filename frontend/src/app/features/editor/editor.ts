import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { SignalRService } from '../../services/signalr.service';

@Component({
  selector: 'app-editor',
  imports: [CommonModule, FormsModule],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  docId = 'doc-123';
  content = '';

  // Subject to handle debouncing (prevent sending every single keystroke)
  private contentUpdateSubject = new Subject<string>();

  constructor(public signalRService: SignalRService) {}

  get connectionState$() {
    return this.signalRService.connectionState$;
  }

  ngOnInit() {
    this.signalRService.startConnection();

    // Listen for updates and user presence events
    this.signalRService.addContentUpdateListener();
    this.signalRService.addUserJoinedListener();
    this.signalRService.addUserLeftListener();

    this.signalRService.contentUpdate$.subscribe((newContent) => {
      // Only update if content is different to avoid cursor jumping
      if (newContent !== this.content) {
        this.content = newContent;
      }
    });

    this.signalRService.userJoined$.subscribe((connectionId) => {
      console.log('User joined:', connectionId);
    });

    this.signalRService.userLeft$.subscribe((connectionId) => {
      console.log('User left:', connectionId);
    });

    // Wait for connection to be established before joining the document
    const checkConnectionInterval = setInterval(() => {
      if (this.signalRService.connectionState$.value === 'connected') {
        clearInterval(checkConnectionInterval);
        this.signalRService.joinDocument(this.docId);
      }
    }, 100);

    // Debounce logic: Wait 300ms after user stops typing to send to server
    this.contentUpdateSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe((value) => {
      this.signalRService.sendUpdate(this.docId, value);
    });
  }

  onContentChange(newValue: string) {
    // Push to the subject, not the server directly
    this.contentUpdateSubject.next(newValue);
  }
}
