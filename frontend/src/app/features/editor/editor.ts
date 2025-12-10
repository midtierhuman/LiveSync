import { Component, OnInit, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { SignalRService } from '../../services/signalr.service';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatTooltipModule,
    MatCardModule,
  ],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  docId = 'doc-123';
  code = '// Start typing to collaborate...\n';
  language = signal<string>('typescript');
  theme = signal<string>('vs-dark');
  isDarkMode = signal<boolean>(true);

  // Subject to handle debouncing (prevent sending every single keystroke)
  private codeUpdateSubject = new Subject<string>();

  languages = [
    { name: 'TypeScript', value: 'typescript' },
    { name: 'JavaScript', value: 'javascript' },
    { name: 'Python', value: 'python' },
    { name: 'Java', value: 'java' },
    { name: 'C#', value: 'csharp' },
    { name: 'HTML', value: 'html' },
    { name: 'CSS', value: 'css' },
    { name: 'SQL', value: 'sql' },
    { name: 'JSON', value: 'json' },
  ];

  constructor(public signalRService: SignalRService) {
    // Use effect to handle signal changes (zoneless compatible)
    effect(() => {
      const newContent = this.signalRService.contentUpdate();
      if (newContent && newContent !== this.code) {
        this.code = newContent;
      }
    });

    effect(() => {
      const connectionId = this.signalRService.userJoined();
      if (connectionId) {
        console.log('User joined:', connectionId);
      }
    });

    effect(() => {
      const connectionId = this.signalRService.userLeft();
      if (connectionId) {
        console.log('User left:', connectionId);
      }
    });
  }

  onLanguageChange(newLanguage: string) {
    this.language.set(newLanguage);
  }

  onCodeChange() {
    // Called when editor content changes via ngModel
    this.codeUpdateSubject.next(this.code);
  }

  ngOnInit() {
    // Set up listeners first before starting connection
    this.signalRService.addContentUpdateListener();
    this.signalRService.addUserJoinedListener();
    this.signalRService.addUserLeftListener();

    // Start connection and wait for it to complete
    this.signalRService
      .startConnection()
      .then(() => {
        // Add a small delay to ensure WebSocket is fully ready
        setTimeout(() => {
          if (this.signalRService.connectionState() === 'connected') {
            this.signalRService.joinDocument(this.docId);
            console.log(`Joined document: ${this.docId}`);
          } else {
            console.warn('Connection not fully established, will retry...');
            // Retry after a longer delay
            setTimeout(() => {
              if (this.signalRService.connectionState() === 'connected') {
                this.signalRService.joinDocument(this.docId);
              }
            }, 500);
          }
        }, 100);
      })
      .catch((err) => {
        console.error('Failed to establish connection:', err);
      });

    // Debounce logic: Wait 300ms after user stops typing to send to server
    this.codeUpdateSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe((value) => {
      if (this.signalRService.connectionState() === 'connected') {
        this.signalRService.sendUpdate(this.docId, value);
      } else {
        console.warn('Not connected, buffering update...');
      }
    });
  }

  toggleTheme() {
    const newTheme = this.isDarkMode() ? 'vs' : 'vs-dark';
    this.theme.set(newTheme);
    this.isDarkMode.set(!this.isDarkMode());

    // Update via Monaco API if available
    const monaco = (window as any).monaco;
    if (monaco) {
      monaco.editor.setTheme(newTheme);
    }
  }

  copyCode() {
    navigator.clipboard.writeText(this.code).then(() => {
      console.log('Code copied to clipboard!');
    });
  }

  clearCode() {
    this.code = '';
    this.codeUpdateSubject.next('');
  }
}
