import {
  Component,
  OnInit,
  effect,
  signal,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { SignalRService } from '../../services/signalr.service';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [
    CommonModule,
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
export class Editor implements OnInit, AfterViewInit {
  @ViewChild('codeTextarea') codeTextarea!: ElementRef<HTMLTextAreaElement>;

  docId = 'doc-123';
  codeSignal = signal<string>('// Start typing to collaborate...\n');
  pendingUpdateSignal = signal<string>('');
  language = signal<string>('typescript');
  theme = signal<string>('vs-dark');
  isDarkMode = signal<boolean>(true);

  private isUpdatingFromRemote = false;
  private debounceTimer: any = null;

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
    // Use effect to handle remote content updates - update textarea directly
    effect(() => {
      const newContent = this.signalRService.contentUpdate();
      // Update whenever contentUpdate signal changes, regardless of value
      // This ensures empty strings and deletions are properly sync'd
      if (newContent !== undefined && newContent !== null) {
        this.isUpdatingFromRemote = true;
        this.codeSignal.set(newContent);

        // Update textarea directly, not through Angular
        if (this.codeTextarea?.nativeElement) {
          this.codeTextarea.nativeElement.value = newContent;
        }

        this.isUpdatingFromRemote = false;
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

  ngAfterViewInit() {
    // Set initial value
    if (this.codeTextarea?.nativeElement) {
      this.codeTextarea.nativeElement.value = this.codeSignal();

      // Listen to textarea input events directly - bypasses Angular change detection
      this.codeTextarea.nativeElement.addEventListener('input', (event: Event) => {
        if (!this.isUpdatingFromRemote) {
          const newValue = (event.target as HTMLTextAreaElement).value;
          this.codeSignal.set(newValue);
          this.pendingUpdateSignal.set(newValue);
          this.scheduleDebounce(newValue);
        }
      });
    }
  }

  private scheduleDebounce(value: string) {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer for 300ms debounce
    this.debounceTimer = setTimeout(() => {
      if (this.signalRService.connectionState() === 'connected') {
        this.signalRService.sendUpdate(this.docId, value);
      } else {
        console.warn('Not connected, buffering update...');
      }
      this.debounceTimer = null;
    }, 300);
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
    navigator.clipboard.writeText(this.codeSignal()).then(() => {
      console.log('Code copied to clipboard!');
    });
  }

  clearCode() {
    this.codeSignal.set('');
    if (this.codeTextarea?.nativeElement) {
      this.codeTextarea.nativeElement.value = '';
    }
    this.scheduleDebounce('');
  }
}
