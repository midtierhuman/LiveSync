import {
  Component,
  effect,
  signal,
  viewChild,
  afterNextRender,
  inject,
  ElementRef,
  OnInit,
  DestroyRef,
  input,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SignalRService } from '../../services/signalr.service';
import { DocumentDto, DocumentService } from '../../services/document.service';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  // Input signals for modal mode
  readonly documentId = input<string>('');
  readonly isModal = input<boolean>(false);

  // Angular 20 signal-based queries
  readonly codeTextarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('codeTextarea');
  readonly lineNumbers = viewChild.required<ElementRef<HTMLPreElement>>('lineNumbers');

  // Inject services using Angular 20 inject() function
  readonly signalRService = inject(SignalRService);
  private readonly documentService = inject(DocumentService);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // Signals for reactive state
  readonly docId = signal<string>('');
  readonly document = signal<DocumentDto | null>(null);
  readonly lineNumbersArray = signal<number[]>([1]);
  readonly codeSignal = signal('// Start typing to collaborate...\n');
  readonly theme = signal('vs-dark');
  readonly isDarkMode = signal(true);
  readonly isLoading = signal(false);
  readonly error = signal('');
  readonly docTitle = signal('');

  // Private state
  private isUpdatingFromRemote = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly undoStack = signal<string[]>([]);
  private readonly redoStack = signal<string[]>([]);
  private readonly maxUndoSteps = 50;
  readonly lastSaved = signal<Date | null>(null);
  readonly isSaving = signal(false);

  ngOnInit() {
    // Get document ID from input (modal mode) or route (standalone mode)
    const inputDocId = this.documentId();
    if (inputDocId) {
      // Modal mode - use provided document ID
      this.docId.set(inputDocId);
      this.loadDocument(inputDocId);
    } else {
      // Standalone mode - get from route params
      const subscription = this.activatedRoute.params.subscribe(async (params) => {
        const id = params['id'];
        if (id) {
          this.docId.set(id);
          await this.loadDocument(id);
        }
      });

      this.destroyRef.onDestroy(() => {
        subscription.unsubscribe();
      });
    }

    // Cleanup on destroy
    this.destroyRef.onDestroy(async () => {
      const docId = this.docId();
      if (docId) {
        await this.signalRService.leaveDocument(docId);
      }
    });
  }

  async loadDocument(id: string) {
    this.isLoading.set(true);
    this.error.set('');
    try {
      const doc = await this.documentService.getDocument(id);
      this.document.set(doc);
      this.docTitle.set(doc.title);
      const content = doc.content || '// Start typing to collaborate...\n';
      console.log('Loading document content:', content);
      this.codeSignal.set(content);

      // Join the document for real-time collaboration
      await this.signalRService.startConnection();
      await this.signalRService.joinDocument(id);
    } catch (error) {
      console.error('Error loading document:', error);
      this.error.set('Failed to load document. Redirecting...');
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 2000);
    } finally {
      this.isLoading.set(false);
    }
  }

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

    // Effect to update textarea when code signal changes (from loadDocument)
    effect(() => {
      const code = this.codeSignal();
      const textarea = this.codeTextarea()?.nativeElement;
      if (textarea && !this.isUpdatingFromRemote && textarea.value !== code) {
        textarea.value = code;
        this.updateLineNumbers(code);
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

    // Keyboard shortcuts and code-friendly features
    textarea.addEventListener('keydown', (event: KeyboardEvent) => {
      // Tab key - insert 2 spaces
      if (event.key === 'Tab') {
        event.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        if (event.shiftKey) {
          // Shift+Tab: Outdent
          this.handleOutdent(textarea, start, end);
        } else {
          // Tab: Indent
          this.handleIndent(textarea, start, end);
        }
        return;
      }

      // Enter key - auto-indent
      if (event.key === 'Enter') {
        event.preventDefault();
        this.handleEnter(textarea);
        return;
      }

      // Auto-close brackets, quotes, etc.
      const pairs: Record<string, string> = {
        '(': ')',
        '[': ']',
        '{': '}',
        '"': '"',
        "'": "'",
        '`': '`',
      };

      if (pairs[event.key] && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        if (start !== end) {
          // Wrap selection
          event.preventDefault();
          this.wrapSelection(textarea, event.key, pairs[event.key]);
          return;
        } else {
          // Auto-close
          event.preventDefault();
          this.autoClose(textarea, event.key, pairs[event.key]);
          return;
        }
      }

      // Undo/Redo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        this.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        this.redo();
        return;
      }

      // Save
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        this.downloadCode();
        return;
      }

      // Duplicate line (Ctrl/Cmd + D)
      if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
        event.preventDefault();
        this.duplicateLine(textarea);
        return;
      }

      // Comment/Uncomment (Ctrl/Cmd + /)
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        this.toggleComment(textarea);
        return;
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
    // Clear existing timer for SignalR real-time sync
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer for 150ms debounce (real-time)
    this.debounceTimer = setTimeout(() => {
      if (this.signalRService.connectionState() === 'connected') {
        this.signalRService.sendUpdate(this.docId(), value);
      } else {
        console.warn('Not connected, buffering update...');
      }
      this.debounceTimer = null;
    }, 150);

    // Clear existing save timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    // Set new timer for 300ms debounce (backend persistence)
    this.saveDebounceTimer = setTimeout(async () => {
      await this.saveToBackend(value);
      this.saveDebounceTimer = null;
    }, 300);
  }

  private async saveToBackend(content: string): Promise<void> {
    const docId = this.docId();
    if (!docId) return;

    try {
      this.isSaving.set(true);
      await this.documentService.updateDocument(docId, {
        content: content,
        lastEditedBy:
          this.signalRService.connectionState() === 'connected' ? 'Real-time user' : 'Offline user',
      });
      this.lastSaved.set(new Date());
      console.log('Document saved to backend at', this.lastSaved());
    } catch (error) {
      console.error('Error saving document to backend:', error);
    } finally {
      this.isSaving.set(false);
    }
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

  // Code-friendly editor features
  private handleIndent(textarea: HTMLTextAreaElement, start: number, end: number) {
    const value = textarea.value;

    if (start === end) {
      // Insert 2 spaces at cursor
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      textarea.value = newValue;
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    } else {
      // Indent selected lines
      const lines = value.split('\n');
      let currentPos = 0;
      let startLine = 0;
      let endLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const lineEnd = currentPos + lines[i].length;
        if (currentPos <= start && start <= lineEnd) startLine = i;
        if (currentPos <= end && end <= lineEnd) endLine = i;
        currentPos = lineEnd + 1;
      }

      for (let i = startLine; i <= endLine; i++) {
        lines[i] = '  ' + lines[i];
      }

      textarea.value = lines.join('\n');
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = end + (endLine - startLine + 1) * 2;
    }

    this.updateFromTextarea(textarea);
  }

  private handleOutdent(textarea: HTMLTextAreaElement, start: number, end: number) {
    const value = textarea.value;
    const lines = value.split('\n');
    let currentPos = 0;
    let startLine = 0;
    let endLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineEnd = currentPos + lines[i].length;
      if (currentPos <= start && start <= lineEnd) startLine = i;
      if (currentPos <= end && end <= lineEnd) endLine = i;
      currentPos = lineEnd + 1;
    }

    let removed = 0;
    for (let i = startLine; i <= endLine; i++) {
      if (lines[i].startsWith('  ')) {
        lines[i] = lines[i].substring(2);
        removed += 2;
      } else if (lines[i].startsWith(' ')) {
        lines[i] = lines[i].substring(1);
        removed += 1;
      }
    }

    textarea.value = lines.join('\n');
    textarea.selectionStart = Math.max(0, start - 2);
    textarea.selectionEnd = Math.max(0, end - removed);

    this.updateFromTextarea(textarea);
  }

  private handleEnter(textarea: HTMLTextAreaElement) {
    const start = textarea.selectionStart;
    const value = textarea.value;
    const beforeCursor = value.substring(0, start);
    const afterCursor = value.substring(start);

    // Get current line
    const lines = beforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];

    // Calculate indentation
    const indent = currentLine.match(/^\s*/)?.[0] || '';

    // Check if current line ends with opening bracket
    const endsWithOpening = /[{[(]\s*$/.test(currentLine);
    const startsWithClosing = /^\s*[}\])]/.test(afterCursor);

    let newValue: string;
    let newCursorPos: number;

    if (endsWithOpening && startsWithClosing) {
      // Add extra line with indent between brackets
      newValue = beforeCursor + '\n' + indent + '  ' + '\n' + indent + afterCursor;
      newCursorPos = start + indent.length + 3;
    } else if (endsWithOpening) {
      // Increase indent
      newValue = beforeCursor + '\n' + indent + '  ' + afterCursor;
      newCursorPos = start + indent.length + 3;
    } else {
      // Keep same indent
      newValue = beforeCursor + '\n' + indent + afterCursor;
      newCursorPos = start + indent.length + 1;
    }

    textarea.value = newValue;
    textarea.selectionStart = textarea.selectionEnd = newCursorPos;

    this.updateFromTextarea(textarea);
  }

  private autoClose(textarea: HTMLTextAreaElement, open: string, close: string) {
    const start = textarea.selectionStart;
    const value = textarea.value;

    // For quotes, only auto-close if not already followed by the same quote
    if (open === close) {
      const nextChar = value[start];
      if (nextChar === open) {
        // Move cursor past the existing quote
        textarea.selectionStart = textarea.selectionEnd = start + 1;
        return;
      }
    }

    const newValue = value.substring(0, start) + open + close + value.substring(start);
    textarea.value = newValue;
    textarea.selectionStart = textarea.selectionEnd = start + 1;

    this.updateFromTextarea(textarea);
  }

  private wrapSelection(textarea: HTMLTextAreaElement, open: string, close: string) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selection = value.substring(start, end);

    const newValue = value.substring(0, start) + open + selection + close + value.substring(end);
    textarea.value = newValue;
    textarea.selectionStart = start + 1;
    textarea.selectionEnd = end + 1;

    this.updateFromTextarea(textarea);
  }

  private duplicateLine(textarea: HTMLTextAreaElement) {
    const start = textarea.selectionStart;
    const value = textarea.value;
    const beforeCursor = value.substring(0, start);
    const afterCursor = value.substring(start);

    const lines = beforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    const afterLines = afterCursor.split('\n');
    const restOfLine = afterLines[0];
    const fullLine = currentLine + restOfLine;

    const newValue =
      value.substring(0, start) +
      restOfLine +
      '\n' +
      fullLine +
      afterCursor.substring(restOfLine.length);
    textarea.value = newValue;
    textarea.selectionStart = textarea.selectionEnd = start + restOfLine.length + 1;

    this.updateFromTextarea(textarea);
  }

  private toggleComment(textarea: HTMLTextAreaElement) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const lines = value.split('\n');

    let currentPos = 0;
    let startLine = 0;
    let endLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineEnd = currentPos + lines[i].length;
      if (currentPos <= start && start <= lineEnd) startLine = i;
      if (currentPos <= end && end <= lineEnd) endLine = i;
      currentPos = lineEnd + 1;
    }

    // Check if all lines are commented
    let allCommented = true;
    for (let i = startLine; i <= endLine; i++) {
      if (!lines[i].trim().startsWith('//')) {
        allCommented = false;
        break;
      }
    }

    if (allCommented) {
      // Uncomment
      for (let i = startLine; i <= endLine; i++) {
        lines[i] = lines[i].replace(/^(\s*)\/\/\s?/, '$1');
      }
    } else {
      // Comment
      for (let i = startLine; i <= endLine; i++) {
        const indent = lines[i].match(/^\s*/)?.[0] || '';
        lines[i] = indent + '// ' + lines[i].substring(indent.length);
      }
    }

    textarea.value = lines.join('\n');
    this.updateFromTextarea(textarea);
  }

  private updateFromTextarea(textarea: HTMLTextAreaElement) {
    const newValue = textarea.value;
    this.pushToUndoStack(this.codeSignal());
    this.codeSignal.set(newValue);
    this.updateLineNumbers(newValue);
    this.scheduleDebounce(newValue);
  }
}
