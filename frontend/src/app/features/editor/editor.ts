import {
  Component,
  OnInit,
  effect,
  signal,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { SignalRService } from '../../services/signalr.service';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
} from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { sql } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';

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
export class Editor implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editorContainer') editorContainer!: ElementRef<HTMLDivElement>;
  private editorView?: EditorView;
  private languageCompartment = new Compartment();
  private themeCompartment = new Compartment();

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
    // Use effect to handle remote content updates - update CodeMirror directly
    effect(() => {
      const newContent = this.signalRService.contentUpdate();
      // Update whenever contentUpdate signal changes, regardless of value
      // This ensures empty strings and deletions are properly sync'd
      if (newContent !== undefined && newContent !== null) {
        this.isUpdatingFromRemote = true;
        this.codeSignal.set(newContent);

        // Update CodeMirror directly
        if (this.editorView) {
          const currentContent = this.editorView.state.doc.toString();
          if (currentContent !== newContent) {
            this.editorView.dispatch({
              changes: {
                from: 0,
                to: this.editorView.state.doc.length,
                insert: newContent,
              },
            });
          }
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
    if (this.editorView) {
      this.editorView.dispatch({
        effects: this.languageCompartment.reconfigure(this.getLanguageExtension(newLanguage)),
      });
    }
  }

  private getLanguageExtension(lang: string) {
    switch (lang) {
      case 'javascript':
        return javascript();
      case 'typescript':
        return javascript({ typescript: true });
      case 'python':
        return python();
      case 'java':
        return java();
      case 'csharp':
        return cpp(); // Using cpp for C# as approximation
      case 'html':
        return html();
      case 'css':
        return css();
      case 'sql':
        return sql();
      case 'json':
        return json();
      default:
        return javascript();
    }
  }

  ngAfterViewInit() {
    // Initialize CodeMirror 6
    if (this.editorContainer?.nativeElement) {
      const startState = EditorState.create({
        doc: this.codeSignal(),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          crosshairCursor(),
          bracketMatching(),
          foldGutter(),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle),
          this.languageCompartment.of(this.getLanguageExtension(this.language())),
          this.themeCompartment.of(this.isDarkMode() ? oneDark : []),
          history(),
          keymap.of([
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            {
              key: 'Mod-s',
              run: () => {
                this.downloadCode();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !this.isUpdatingFromRemote) {
              const newValue = update.state.doc.toString();
              this.codeSignal.set(newValue);
              this.pendingUpdateSignal.set(newValue);
              this.scheduleDebounce(newValue);
            }
          }),
        ],
      });

      this.editorView = new EditorView({
        state: startState,
        parent: this.editorContainer.nativeElement,
      });
    }
  }

  ngOnDestroy() {
    if (this.editorView) {
      this.editorView.destroy();
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
    const newDarkMode = !this.isDarkMode();
    this.isDarkMode.set(newDarkMode);

    if (this.editorView) {
      this.editorView.dispatch({
        effects: this.themeCompartment.reconfigure(newDarkMode ? oneDark : []),
      });
    }
  }

  copyCode() {
    navigator.clipboard.writeText(this.codeSignal()).then(() => {
      console.log('Code copied to clipboard!');
    });
  }

  downloadCode() {
    const blob = new Blob([this.codeSignal()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const extension = this.getFileExtension(this.language());
    a.download = `code-${Date.now()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      typescript: 'ts',
      javascript: 'js',
      python: 'py',
      java: 'java',
      csharp: 'cs',
      html: 'html',
      css: 'css',
      sql: 'sql',
      json: 'json',
    };
    return extensions[language] || 'txt';
  }

  clearCode() {
    this.codeSignal.set('');
    if (this.editorView) {
      this.editorView.dispatch({
        changes: {
          from: 0,
          to: this.editorView.state.doc.length,
          insert: '',
        },
      });
    }
    this.scheduleDebounce('');
  }
}
