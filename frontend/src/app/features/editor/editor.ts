import {
  Component,
  effect,
  signal,
  viewChild,
  afterNextRender,
  inject,
  ElementRef,
} from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SignalRService } from '../../services/signalr.service';

@Component({
  selector: 'app-editor',
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor {
  // Angular 20 signal-based queries
  readonly codeTextarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('codeTextarea');
  readonly lineNumbers = viewChild.required<ElementRef<HTMLPreElement>>('lineNumbers');

  // Inject service using Angular 20 inject() function
  readonly signalRService = inject(SignalRService);

  // Signals for reactive state
  readonly docId = signal('doc-123');
  readonly lineNumbersArray = signal<number[]>([1]);
  readonly codeSignal = signal('// Start typing to collaborate...\n');
  readonly theme = signal('vs-dark');
  readonly isDarkMode = signal(true);

  // Private state
  private isUpdatingFromRemote = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly undoStack = signal<string[]>([]);
  private readonly redoStack = signal<string[]>([]);
  private readonly maxUndoSteps = 50;

  constructor() {
    // Effects for SignalR events
    effect(() => {
      const newContent = this.signalRService.contentUpdate();
      if (newContent !== undefined && newContent !== null) {
        this.isUpdatingFromRemote = true;
        this.codeSignal.set(newContent);

        // Update textarea using signal query
        const textarea = this.codeTextarea()?.nativeElement;
        if (textarea) {
          textarea.value = newContent;
        }

        this.updateLineNumbers(newContent);

        // Clear undo/redo stacks
        this.undoStack.set([]);
        this.redoStack.set([]);

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

    // Initialize view after render
    afterNextRender(() => {
      this.initializeEditor();
      this.setupSignalR();
    });
  }

  private initializeEditor() {
    const textarea = this.codeTextarea()?.nativeElement;
    const lineNumbersEl = this.lineNumbers()?.nativeElement;

    if (!textarea) return;

    textarea.value = this.codeSignal();
    this.updateLineNumbers(this.codeSignal());

    // Input event listener
    textarea.addEventListener('input', (event: Event) => {
      if (!this.isUpdatingFromRemote) {
        const newValue = (event.target as HTMLTextAreaElement).value;
        this.pushToUndoStack(this.codeSignal());
        this.codeSignal.set(newValue);
        this.updateLineNumbers(newValue);
        this.scheduleDebounce(newValue);
      }
    });

    // Scroll sync
    textarea.addEventListener('scroll', () => {
      if (lineNumbersEl) {
        lineNumbersEl.scrollTop = textarea.scrollTop;
        lineNumbersEl.scrollLeft = 0;
      }
    });

    // Keyboard shortcuts
    textarea.addEventListener('keydown', (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        this.undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        this.redo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        this.downloadCode();
      }
    });
  }

  private pushToUndoStack(value: string) {
    const stack = this.undoStack();
    if (stack.length >= this.maxUndoSteps) {
      stack.shift();
    }
    this.undoStack.set([...stack, value]);
    this.redoStack.set([]);
  }

  private undo() {
    const stack = this.undoStack();
    if (stack.length > 0) {
      const current = this.codeSignal();
      this.redoStack.set([...this.redoStack(), current]);

      const previous = stack[stack.length - 1];
      this.undoStack.set(stack.slice(0, -1));

      this.isUpdatingFromRemote = true;
      this.codeSignal.set(previous);

      const textarea = this.codeTextarea()?.nativeElement;
      if (textarea) {
        textarea.value = previous;
      }
      this.updateLineNumbers(previous);
      this.scheduleDebounce(previous);
      this.isUpdatingFromRemote = false;
    }
  }

  private redo() {
    const stack = this.redoStack();
    if (stack.length > 0) {
      const current = this.codeSignal();
      this.undoStack.set([...this.undoStack(), current]);

      const next = stack[stack.length - 1];
      this.redoStack.set(stack.slice(0, -1));

      this.isUpdatingFromRemote = true;
      this.codeSignal.set(next);

      const textarea = this.codeTextarea()?.nativeElement;
      if (textarea) {
        textarea.value = next;
      }
      this.updateLineNumbers(next);
      this.scheduleDebounce(next);
      this.isUpdatingFromRemote = false;
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
        this.signalRService.sendUpdate(this.docId(), value);
      } else {
        console.warn('Not connected, buffering update...');
      }
      this.debounceTimer = null;
    }, 300);
  }

  private async setupSignalR() {
    // Set up listeners before connection
    this.signalRService.addContentUpdateListener();
    this.signalRService.addUserJoinedListener();
    this.signalRService.addUserLeftListener();

    try {
      await this.signalRService.startConnection();

      // Wait for connection to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (this.signalRService.connectionState() === 'connected') {
        this.signalRService.joinDocument(this.docId());
        console.log(`Joined document: ${this.docId()}`);
      } else {
        console.warn('Connection not fully established, retrying...');
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (this.signalRService.connectionState() === 'connected') {
          this.signalRService.joinDocument(this.docId());
        }
      }
    } catch (err) {
      console.error('Failed to establish connection:', err);
    }
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

  downloadCode() {
    const blob = new Blob([this.codeSignal()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  clearCode() {
    this.codeSignal.set('');
    const textarea = this.codeTextarea()?.nativeElement;
    if (textarea) {
      textarea.value = '';
    }
    this.updateLineNumbers('');
    this.scheduleDebounce('');
  }

  private updateLineNumbers(content: string) {
    // Count lines based on newline characters
    const lines = content.split('\n');
    const lineCount = lines.length;
    this.lineNumbersArray.set(Array.from({ length: lineCount }, (_, i) => i + 1));
  }

  getLineNumbers(): string {
    return this.lineNumbersArray().join('\n');
  }
}
