import { Component, OnInit, effect, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
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
    MonacoEditorModule,
  ],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  @ViewChild('monacoEditor') monacoEditor: any;

  docId = 'doc-123';
  code = '// Start typing to collaborate...\n';
  language = signal<string>('typescript');
  theme = signal<string>('vs-dark');
  isDarkMode = signal<boolean>(true);

  // Subject to handle debouncing (prevent sending every single keystroke)
  private codeUpdateSubject = new Subject<string>();

  editorOptions = {
    theme: 'vs-dark',
    language: 'typescript',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    fontFamily: 'Fira Code, Courier New',
    wordWrap: 'on',
    lineNumbers: 'on',
  };

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

  ngOnInit() {
    this.signalRService.startConnection();

    // Listen for updates and user presence events
    this.signalRService.addContentUpdateListener();
    this.signalRService.addUserJoinedListener();
    this.signalRService.addUserLeftListener();

    // Wait for connection to be established before joining the document
    const checkConnectionInterval = setInterval(() => {
      if (this.signalRService.connectionState() === 'connected') {
        clearInterval(checkConnectionInterval);
        this.signalRService.joinDocument(this.docId);
      }
    }, 100);

    // Debounce logic: Wait 300ms after user stops typing to send to server
    this.codeUpdateSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe((value) => {
      this.signalRService.sendUpdate(this.docId, value);
    });
  }

  onEditorInit(editor: any) {
    // Initialize editor instance for change tracking
  }

  onCodeChange(newValue: string) {
    // Push to the subject, not the server directly
    this.code = newValue;
    this.codeUpdateSubject.next(newValue);
  }

  onLanguageChange(newLanguage: string) {
    this.language.set(newLanguage);
    this.editorOptions = {
      ...this.editorOptions,
      language: newLanguage,
    };
  }

  toggleTheme() {
    const newTheme = this.isDarkMode() ? 'vs' : 'vs-dark';
    this.theme.set(newTheme);
    this.isDarkMode.set(!this.isDarkMode());
    this.editorOptions = {
      ...this.editorOptions,
      theme: newTheme,
    };
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
