import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { SignalRService } from '../../services/signalr.service';

@Component({
  selector: 'app-editor',
  imports: [FormsModule],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  docId = 'doc-123';
  content = '';

  // Subject to handle debouncing (prevent sending every single keystroke)
  private contentUpdateSubject = new Subject<string>();

  constructor(public signalRService: SignalRService) {}

  ngOnInit() {
    this.signalRService.startConnection();

    // Listen for updates from other users
    this.signalRService.addTransferChartDataListener();
    this.signalRService.contentUpdate$.subscribe((newContent) => {
      // Only update if content is different to avoid cursor jumping
      if (newContent !== this.content) {
        this.content = newContent;
      }
    });

    // Join the room after a slight delay to ensure connection is ready
    setTimeout(() => this.signalRService.joinDocument(this.docId), 1000);

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
