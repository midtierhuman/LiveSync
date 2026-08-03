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
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  dropCursor,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
} from '@codemirror/view';
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
} from '@codemirror/language';
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete';
import { foldKeymap } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
import { css } from '@codemirror/lang-css';
import { RealtimeService } from '../../services/realtime.service';
import { DecimalPipe } from '@angular/common';
import {
  DocumentDto,
  DocumentExecutionResponse,
  DocumentService,
} from '../../services/document.service';
import { AuthService } from '../../services/auth.service';
import { ExecutionStreamService } from '../../services/execution-stream.service';
import { TimeTravelService } from '../../services/time-travel.service';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatTooltipModule, DecimalPipe],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  readonly documentId = input<string>('');
  readonly isModal = input<boolean>(false);

  readonly editorHost = viewChild.required<ElementRef<HTMLDivElement>>('editorHost');

  readonly realtimeService = inject(RealtimeService);
  readonly signalRService = this.realtimeService;
  public readonly streamService = inject(ExecutionStreamService);
  public readonly timeTravelService = inject(TimeTravelService);
  private readonly documentService = inject(DocumentService);
  private readonly authService = inject(AuthService);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly docId = signal<string>('');
  readonly document = signal<DocumentDto | null>(null);
  readonly codeSignal = signal('// Start typing to collaborate...\n');
  readonly isDarkMode = signal(true);
  readonly isLoading = signal(false);
  readonly error = signal('');
  readonly docTitle = signal('');
  readonly isEditable = signal(true);
  readonly accessLevel = signal<string>('Edit');
  readonly permissionRevokedMessage = signal<string>('');
  readonly showPermissionBanner = signal(false);
  readonly currentLanguage = signal('plaintext');
  readonly cursorPosition = signal('Ln 1, Col 1');
  readonly isWordWrapEnabled = signal(false);
  readonly lastSaved = signal<Date | null>(null);
  readonly isSaving = signal(false);
  readonly isExecuting = signal(false);
  readonly executionResult = signal<DocumentExecutionResponse | null>(null);
  readonly executionError = signal('');
  readonly standardInput = signal('');
  readonly executionLanguages = signal<string[]>([]);
  readonly selectedExecutionLanguage = signal('');
  readonly isLoadingExecutionLanguages = signal(false);

  private isUpdatingFromRemote = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private editorView: EditorView | null = null;
  private languageCompartment = new Compartment();
  private readOnlyCompartment = new Compartment();
  private wrapCompartment = new Compartment();
  private themeCompartment = new Compartment();

  ngOnInit() {
    const inputDocId = this.documentId();
    if (inputDocId) {
      this.docId.set(inputDocId);
      void this.loadDocument(inputDocId);
    } else {
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

    this.destroyRef.onDestroy(async () => {
      const currentDocId = this.docId();
      if (currentDocId) {
        await this.signalRService.leaveDocument(currentDocId);
      }

      this.editorView?.destroy();
      this.editorView = null;
    });
  }

  constructor() {
    effect(() => {
      const newContent = this.signalRService.contentUpdate();
      if (newContent !== undefined && newContent !== null) {
        this.codeSignal.set(newContent);
        this.updateEditorDocument(newContent);
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

    effect(() => {
      const update = this.realtimeService.cursorUpdate();
      const followedId = this.realtimeService.followedUserId();

      if (update && followedId && update.userId === followedId && this.editorView) {
        const targetLineNumber = update.lineNumber || 1;
        const doc = this.editorView.state.doc;
        if (targetLineNumber <= doc.lines) {
          const line = doc.line(targetLineNumber);
          this.editorView.dispatch({
            selection: { anchor: line.from, head: line.from },
            scrollIntoView: true,
          });
        }
      }
    });

    effect(() => {
      const snapContent = this.timeTravelService.currentSnapshotContent();
      const isActive = this.timeTravelService.isTimeTravelActive();
      if (isActive && snapContent !== undefined && this.editorView) {
        this.updateEditorDocument(snapContent);
      }
    });

    afterNextRender(() => {
      this.initializeEditor();
      void this.setupSignalR();
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
      this.codeSignal.set(content);

      const language = this.detectLanguage(doc.title || id, content);
      this.currentLanguage.set(language);
      this.updateEditorDocument(content, language);

      const accessLevel = await this.documentService.getAccessLevel(id);
      this.accessLevel.set(accessLevel);
      this.isEditable.set(accessLevel === 'Edit');

      await this.loadExecutionLanguages();

      await this.signalRService.startConnection();
      await this.signalRService.joinDocument(id);
    } catch (loadError) {
      console.error('Error loading document:', loadError);
      this.error.set('Failed to load document. Redirecting...');
      setTimeout(() => {
        void this.router.navigate(['/dashboard']);
      }, 2000);
    } finally {
      this.isLoading.set(false);
    }
  }

  private initializeEditor() {
    const host = this.editorHost()?.nativeElement;
    if (!host) {
      return;
    }

    const language = this.detectLanguage(this.docTitle() || this.docId(), this.codeSignal());
    this.currentLanguage.set(language);

    const state = EditorState.create({
      doc: this.codeSignal(),
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        this.languageCompartment.of(this.getLanguageExtension(language)),
        this.readOnlyCompartment.of(EditorState.readOnly.of(!this.isEditable())),
        this.wrapCompartment.of([]),
        this.themeCompartment.of(oneDark),
        this.editorThemeExtension(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
          {
            key: 'Mod-s',
            run: () => {
              const value = this.editorView?.state.doc.toString() ?? this.codeSignal();
              this.scheduleDebounce(value);
              return true;
            },
          },
          {
            key: 'Alt-Shift-f',
            run: () => {
              void this.formatCode();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !this.isUpdatingFromRemote && this.isEditable()) {
            const newValue = update.state.doc.toString();
            this.codeSignal.set(newValue);
            this.scheduleDebounce(newValue);
          }

          if (update.selectionSet || update.docChanged) {
            this.updateCursorLabel(update.state);
          }
        }),
      ],
    });

    this.editorView = new EditorView({
      state,
      parent: host,
    });

    this.updateCursorLabel(state);
  }

  private editorThemeExtension() {
    return EditorView.theme({
      '&': {
        height: '100%',
      },
      '.cm-scroller': {
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: '14px',
        lineHeight: '1.7',
      },
      '.cm-content': {
        caretColor: '#ffffff',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: '#ffffff',
      },
    });
  }

  readonly showCommentsSidebar = signal<boolean>(false);
  readonly selectedLineForComment = signal<number>(1);
  readonly newCommentText = signal<string>('');
  readonly replyDrafts = signal<{ [commentId: string]: string }>({});

  private updateCursorLabel(state: EditorState) {
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const col = pos - line.from + 1;
    this.cursorPosition.set(`Ln ${line.number}, Col ${col}`);
    this.selectedLineForComment.set(line.number);

    const currentDocId = this.docId();
    if (currentDocId) {
      void this.realtimeService.sendCursorPosition(
        currentDocId,
        pos,
        line.number,
        line.number,
        this.authService.user()?.userName || 'Collaborator',
      );
    }
  }

  toggleCommentsSidebar(): void {
    this.showCommentsSidebar.update((v) => !v);
  }

  toggleFollowUser(userId: string): void {
    if (this.realtimeService.followedUserId() === userId) {
      this.realtimeService.unfollowUser();
    } else {
      this.realtimeService.followUser(userId);
    }
  }

  followedUserName(): string {
    const id = this.realtimeService.followedUserId();
    if (!id) return '';
    const collaborator = this.realtimeService.activeCollaborators().find((c) => c.userId === id);
    return collaborator?.userName || collaborator?.userId || id;
  }

  followedLineNumber(): number {
    const id = this.realtimeService.followedUserId();
    if (!id) return 1;
    const collaborator = this.realtimeService.activeCollaborators().find((c) => c.userId === id);
    return collaborator?.lineNumber || 1;
  }

  addCommentOnCurrentLine(): void {
    const text = this.newCommentText().trim();
    const docId = this.docId();
    if (!text || !docId) return;

    this.realtimeService.addComment(
      docId,
      this.selectedLineForComment(),
      text,
      this.authService.user()?.userName || 'Anonymous',
    );
    this.newCommentText.set('');
  }

  addReplyToComment(commentId: string): void {
    const text = (this.replyDrafts()[commentId] || '').trim();
    const docId = this.docId();
    if (!text || !docId) return;

    this.realtimeService.addCommentReply(
      docId,
      commentId,
      text,
      this.authService.user()?.userName || 'Anonymous',
    );

    this.replyDrafts.update((prev) => ({ ...prev, [commentId]: '' }));
  }

  updateReplyDraft(commentId: string, text: string): void {
    this.replyDrafts.update((prev) => ({ ...prev, [commentId]: text }));
  }

  toggleResolveComment(commentId: string): void {
    const docId = this.docId();
    if (docId) {
      this.realtimeService.resolveComment(docId, commentId);
    }
  }

  deleteComment(commentId: string): void {
    const docId = this.docId();
    if (docId) {
      this.realtimeService.deleteComment(docId, commentId);
    }
  }

  scrollToCommentLine(lineNumber: number): void {
    if (this.editorView && lineNumber > 0 && lineNumber <= this.editorView.state.doc.lines) {
      const line = this.editorView.state.doc.line(lineNumber);
      this.editorView.dispatch({
        selection: { anchor: line.from, head: line.from },
        scrollIntoView: true,
      });
    }
  }

  private getLanguageExtension(language: string) {
    switch (language) {
      case 'typescript':
        return javascript({ typescript: true });
      case 'javascript':
        return javascript();
      case 'json':
        return json();
      case 'html':
        return html();
      case 'scss':
      case 'css':
        return css();
      case 'markdown':
        return markdown();
      default:
        return [];
    }
  }

  private async setupSignalR() {
    // Socket.IO event handlers are automatically managed by RealtimeService signals
  }

  private scheduleDebounce(value: string) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (this.signalRService.connectionState() === 'connected') {
        void this.signalRService.sendUpdate(this.docId(), value).catch((sendError) => {
          console.error('Error sending real-time update:', sendError);

          const message = sendError?.message?.toLowerCase?.() ?? '';
          if (message.includes('edit access') || message.includes('forbidden')) {
            this.handlePermissionRevoked();
          }
        });
      }

      this.debounceTimer = null;
    }, 150);

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      await this.saveToBackend(value);
      this.saveDebounceTimer = null;
    }, 300);
  }

  private async saveToBackend(content: string): Promise<void> {
    const currentDocId = this.docId();
    if (!currentDocId) {
      return;
    }

    if (!this.isEditable()) {
      return;
    }

    try {
      this.isSaving.set(true);
      await this.documentService.updateContent(currentDocId, {
        content,
        lastEditedBy:
          this.signalRService.connectionState() === 'connected' ? 'Real-time user' : 'Offline user',
      });
      this.lastSaved.set(new Date());
    } catch (saveError: any) {
      console.error('Error saving document to backend:', saveError);
      if (saveError.isPermissionError || saveError.status === 401 || saveError.status === 403) {
        this.handlePermissionRevoked();
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  dismissPermissionBanner(): void {
    this.showPermissionBanner.set(false);
  }

  private handlePermissionRevoked(): void {
    this.isEditable.set(false);
    this.accessLevel.set('View');
    this.permissionRevokedMessage.set(
      'Your edit access has been revoked. You can still view real-time updates but cannot make changes.',
    );
    this.showPermissionBanner.set(true);
  }

  toggleTheme() {
    const shouldBeDark = !this.isDarkMode();
    this.isDarkMode.set(shouldBeDark);

    if (!this.editorView) {
      return;
    }

    this.editorView.dispatch({
      effects: this.themeCompartment.reconfigure(
        shouldBeDark ? oneDark : this.editorThemeExtension(),
      ),
    });
  }

  async formatCode() {
    if (!this.editorView) {
      return;
    }

    if (!this.isEditable()) {
      if (!this.permissionRevokedMessage()) {
        this.permissionRevokedMessage.set('This document is read-only.');
      }
      this.showPermissionBanner.set(true);
      return;
    }

    const source = this.editorView.state.doc.toString();
    const formatter = await this.getFormatterConfig(this.currentLanguage());
    if (!formatter) {
      return;
    }

    const prettier = await import('prettier/standalone');
    const formatted = await prettier.format(source, {
      parser: formatter.parser,
      plugins: formatter.plugins,
      printWidth: 100,
      tabWidth: 2,
      singleQuote: true,
    });

    if (formatted !== source) {
      this.codeSignal.set(formatted);
      this.updateEditorDocument(formatted);
      this.scheduleDebounce(formatted);
    }
  }

  toggleWordWrap() {
    const next = !this.isWordWrapEnabled();
    this.isWordWrapEnabled.set(next);

    if (this.editorView) {
      this.editorView.dispatch({
        effects: this.wrapCompartment.reconfigure(next ? EditorView.lineWrapping : []),
      });
    }
  }

  copyCode() {
    void navigator.clipboard.writeText(this.codeSignal());
  }

  async runCode(): Promise<void> {
    const currentDocId = this.docId();
    if (!currentDocId || !this.isEditable()) {
      return;
    }

    if (!this.selectedExecutionLanguage()) {
      this.executionError.set('No execution language available for this document.');
      return;
    }

    this.isExecuting.set(true);
    this.executionError.set('');
    this.executionResult.set(null);

    try {
      await this.documentService.updateContent(currentDocId, {
        content: this.codeSignal(),
        lastEditedBy: 'Code execution',
      });
      this.lastSaved.set(new Date());

      const standardInput = this.standardInput();
      const result = await this.documentService.executeDocument(currentDocId, {
        language: this.selectedExecutionLanguage(),
        ...(standardInput ? { standardInput } : {}),
      });
      this.executionResult.set(result);
    } catch (error: unknown) {
      this.executionError.set(this.getErrorMessage(error, 'Code execution failed.'));
    } finally {
      this.isExecuting.set(false);
    }
  }

  readonly interactiveInput = signal<string>('');

  async runCodeStream(): Promise<void> {
    const currentDocId = this.docId();
    if (!currentDocId || !this.isEditable()) {
      return;
    }

    if (!this.selectedExecutionLanguage()) {
      this.executionError.set('No execution language available for this document.');
      return;
    }

    this.executionError.set('');
    this.executionResult.set(null);

    try {
      await this.documentService.updateContent(currentDocId, {
        content: this.codeSignal(),
        lastEditedBy: 'Live REPL stream',
      });
      this.lastSaved.set(new Date());

      this.streamService.startExecution(
        this.selectedExecutionLanguage(),
        this.codeSignal(),
      );
    } catch (error: unknown) {
      this.executionError.set(this.getErrorMessage(error, 'Streaming execution setup failed.'));
    }
  }

  sendInteractiveInput(): void {
    const text = this.interactiveInput();
    if (text) {
      this.streamService.sendStdin(text);
      this.interactiveInput.set('');
    }
  }

  stopStream(): void {
    this.streamService.stopExecution();
  }

  setStandardInput(event: Event): void {
    this.standardInput.set((event.target as HTMLTextAreaElement).value);
  }

  setExecutionLanguage(event: Event): void {
    this.selectedExecutionLanguage.set((event.target as HTMLSelectElement).value);
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

  saveStatus(): string {
    if (this.isSaving()) {
      return 'Saving...';
    }

    const savedAt = this.lastSaved();
    if (!savedAt) {
      return 'Not saved yet';
    }

    return `Saved ${savedAt.toLocaleTimeString()}`;
  }

  private updateEditorDocument(content: string, language?: string) {
    const view = this.editorView;
    if (!view) {
      return;
    }

    if (typeof language === 'string') {
      view.dispatch({
        effects: this.languageCompartment.reconfigure(this.getLanguageExtension(language)),
      });
      this.currentLanguage.set(language);
    }

    const current = view.state.doc.toString();
    if (current === content) {
      return;
    }

    this.isUpdatingFromRemote = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    });
    this.isUpdatingFromRemote = false;
  }

  private async getFormatterConfig(
    language: string,
  ): Promise<{ parser: string; plugins: any[] } | null> {
    if (language === 'typescript') {
      const ts = await import('prettier/plugins/typescript');
      const estree = await import('prettier/plugins/estree');
      return { parser: 'typescript', plugins: [ts.default ?? ts, estree.default ?? estree] };
    }

    if (language === 'javascript') {
      const babel = await import('prettier/plugins/babel');
      const estree = await import('prettier/plugins/estree');
      return { parser: 'babel', plugins: [babel.default ?? babel, estree.default ?? estree] };
    }

    if (language === 'json') {
      const babel = await import('prettier/plugins/babel');
      const estree = await import('prettier/plugins/estree');
      return { parser: 'json', plugins: [babel.default ?? babel, estree.default ?? estree] };
    }

    if (language === 'html') {
      const htmlPlugin = await import('prettier/plugins/html');
      return { parser: 'html', plugins: [htmlPlugin.default ?? htmlPlugin] };
    }

    if (language === 'scss' || language === 'css') {
      const postcss = await import('prettier/plugins/postcss');
      return {
        parser: language === 'scss' ? 'scss' : 'css',
        plugins: [postcss.default ?? postcss],
      };
    }

    if (language === 'markdown') {
      const markdownPlugin = await import('prettier/plugins/markdown');
      return { parser: 'markdown', plugins: [markdownPlugin.default ?? markdownPlugin] };
    }

    return null;
  }

  private detectLanguage(name: string, content: string): string {
    const loweredName = (name || '').toLowerCase();

    if (loweredName.endsWith('.ts') || loweredName.endsWith('.tsx')) {
      return 'typescript';
    }

    if (loweredName.endsWith('.cs')) {
      return 'csharp';
    }

    if (
      loweredName.endsWith('.js') ||
      loweredName.endsWith('.mjs') ||
      loweredName.endsWith('.cjs')
    ) {
      return 'javascript';
    }

    if (loweredName.endsWith('.json')) {
      return 'json';
    }

    if (loweredName.endsWith('.html')) {
      return 'html';
    }

    if (loweredName.endsWith('.scss')) {
      return 'scss';
    }

    if (loweredName.endsWith('.css')) {
      return 'css';
    }

    if (loweredName.endsWith('.md')) {
      return 'markdown';
    }

    const trimmed = content.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return 'json';
    }

    if (trimmed.startsWith('<')) {
      return 'html';
    }

    return 'plaintext';
  }

  private async loadExecutionLanguages(): Promise<void> {
    this.isLoadingExecutionLanguages.set(true);

    try {
      const languages = await this.documentService.getExecutionLanguages();
      const normalized = languages.filter((language) => typeof language === 'string' && language);
      const fallback = normalized.length > 0 ? normalized : ['csharp'];
      this.executionLanguages.set(fallback);

      const currentSelection = this.selectedExecutionLanguage();
      if (!currentSelection || !fallback.includes(currentSelection)) {
        this.selectedExecutionLanguage.set(fallback[0]);
      }
    } catch {
      const fallback = ['csharp'];
      this.executionLanguages.set(fallback);
      if (!this.selectedExecutionLanguage()) {
        this.selectedExecutionLanguage.set(fallback[0]);
      }
    } finally {
      this.isLoadingExecutionLanguages.set(false);
    }
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null) {
      const payload = (error as { error?: unknown }).error;
      if (payload && typeof payload === 'object') {
        const message = (payload as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }
    }

    return fallback;
  }

  readonly showVisualDiff = signal<boolean>(false);

  startTimeTravelSession(): void {
    if (this.timeTravelService.isTimeTravelActive()) {
      this.exitTimeTravelSession();
    } else {
      this.timeTravelService.startSession(this.codeSignal());
    }
  }

  exitTimeTravelSession(): void {
    this.timeTravelService.exitSession();
    this.updateEditorDocument(this.codeSignal());
  }

  seekRevision(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.timeTravelService.seekTo(val);
  }

  toggleVisualDiff(): void {
    this.showVisualDiff.update((v) => !v);
  }

  readonly showAiDrawer = signal<boolean>(false);
  readonly aiAction = signal<string>('explain');
  readonly isAiLoading = signal<boolean>(false);
  readonly aiResult = signal<import('../../services/document.service').AiAnalysisResponse | null>(null);
  readonly aiError = signal<string>('');

  toggleAiDrawer(): void {
    this.showAiDrawer.update((v) => !v);
    if (this.showAiDrawer() && !this.aiResult()) {
      void this.runAiAnalysis('explain');
    }
  }

  async runAiAnalysis(action: string): Promise<void> {
    const docId = this.docId();
    if (!docId) return;

    this.aiAction.set(action);
    this.isAiLoading.set(true);
    this.aiError.set('');

    try {
      const language = this.selectedExecutionLanguage() || 'python';
      const result = await this.documentService.aiAssistant(docId, action, language);
      this.aiResult.set(result);
    } catch (error: unknown) {
      this.aiError.set('AI assistant request failed. Please try again.');
    } finally {
      this.isAiLoading.set(false);
    }
  }

  applyAiGeneratedCode(): void {
    const code = this.aiResult()?.generatedCode;
    if (!code) return;

    const currentDocId = this.docId();
    if (!currentDocId || !this.isEditable()) return;

    let updatedCode = this.codeSignal();
    if (this.aiAction() === 'generate-tests' || this.aiAction() === 'suggest') {
      updatedCode += `\n\n${code}`;
    } else {
      updatedCode = code;
    }

    this.codeSignal.set(updatedCode);
    this.updateEditorDocument(updatedCode);
    this.scheduleDebounce(updatedCode);
  }
}
