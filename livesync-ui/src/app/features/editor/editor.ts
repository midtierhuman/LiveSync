import {
  Component,
  computed,
  effect,
  signal,
  viewChild,
  afterNextRender,
  inject,
  ElementRef,
  OnInit,
  DestroyRef,
  HostListener,
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
  completeAnyWord,
  CompletionContext,
  CompletionSource,
} from '@codemirror/autocomplete';
import { foldKeymap } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
import { css } from '@codemirror/lang-css';
import { FormsModule } from '@angular/forms';
import { RealtimeService } from '../../services/realtime.service';
import {
  DocumentDto,
  DocumentService,
} from '../../services/document.service';
import { FolderService } from '../../services/folder.service';
import { AuthService } from '../../services/auth.service';
import { LiveTerminalService } from '../../services/live-terminal.service';
import { PackageManagerService, PackageItem } from '../../services/package-manager.service';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';

export interface ExecutionLanguageOption {
  name: string;
  displayName: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  action?: string;
  suggestions?: string[];
  generatedCode?: string;
  provider?: string;
  timestamp: string;
}

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatTooltipModule, MatMenuModule, MatDividerModule, FormsModule],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  readonly documentId = input<string>('');
  readonly isModal = input<boolean>(false);
  readonly isActive = input<boolean>(true);

  readonly editorHost = viewChild.required<ElementRef<HTMLDivElement>>('editorHost');
  readonly xtermContainer = viewChild<ElementRef<HTMLDivElement>>('xtermContainer');

  readonly realtimeService = inject(RealtimeService);
  public readonly liveTerminalService = inject(LiveTerminalService);
  public readonly packageManagerService = inject(PackageManagerService);
  private readonly documentService = inject(DocumentService);
  private readonly folderService = inject(FolderService);
  private readonly authService = inject(AuthService);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private activeCleanupResizer?: (() => void) | null;

  readonly isTerminalOpen = signal<boolean>(false);
  readonly packageSearchInput = signal('');
  readonly installedFilterInput = signal('');

  onSearchPackageInput(query: string): void {
    this.packageSearchInput.set(query);
    const support = this.packageManagerService.packageLanguageSupport();
    if (support?.supported && support.package_language) {
      this.packageManagerService.searchPackagesReactive(query, support.package_language);
    }
  }

  async installTargetPackage(pkgName?: string): Promise<void> {
    const target = (pkgName || this.packageSearchInput()).trim();
    if (!target) return;
    const support = this.packageManagerService.packageLanguageSupport();
    if (!support?.supported || !support.package_language) return;
    await this.packageManagerService.installPackage(target, support.package_language);
  }

  async uninstallTargetPackage(pkgName: string): Promise<void> {
    if (!pkgName) return;
    const support = this.packageManagerService.packageLanguageSupport();
    if (!support?.supported || !support.package_language) return;
    await this.packageManagerService.uninstallPackage(pkgName, support.package_language);
  }

  isPackageManagerSupported(): boolean {
    return this.packageManagerService.packageLanguageSupport()?.supported ?? false;
  }

  getPackageManagerLanguageLabel(): string {
    return this.packageManagerService.packageLanguageSupport()?.message || 'Checking package support...';
  }

  private async refreshPackageManagerForCurrentLanguage(): Promise<void> {
    const selectedLanguage = this.selectedExecutionLanguage();
    this.packageManagerService.activeTab.set('discover');
    this.packageManagerService.selectedCategory.set('All');

    const support = await this.packageManagerService.fetchLanguageSupport(selectedLanguage);
    this.packageSearchInput.set('');
    this.installedFilterInput.set('');

    if (!support.supported || !support.package_language) {
      this.packageManagerService.popularPackages.set([]);
      this.packageManagerService.searchResults.set([]);
      this.packageManagerService.installedPackages.set([]);
      return;
    }

    await Promise.all([
      this.packageManagerService.fetchPopularPackages(support.package_language),
      this.packageManagerService.fetchInstalledPackages(support.package_language),
    ]);
    this.packageManagerService.searchPackagesReactive('', support.package_language);
  }

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
  readonly currentLanguageDisplayName = computed(() => {
    const lang = (this.currentLanguage() || '').toLowerCase();
    const title = (this.docTitle() || '').toLowerCase();

    if (lang === 'typescript' || title.endsWith('.ts') || title.endsWith('.tsx')) return 'TypeScript';
    if (lang === 'javascript' || title.endsWith('.js') || title.endsWith('.jsx') || title.endsWith('.mjs')) return 'JavaScript';
    if (lang === 'python' || title.endsWith('.py')) return 'Python';
    if (lang === 'go' || title.endsWith('.go')) return 'Go';
    if (lang === 'json' || title.endsWith('.json')) return 'JSON';
    if (lang === 'html' || title.endsWith('.html') || title.endsWith('.htm')) return 'HTML';
    if (lang === 'css' || title.endsWith('.css') || title.endsWith('.scss')) return 'CSS';
    if (lang === 'markdown' || title.endsWith('.md')) return 'Markdown';
    if (lang === 'rust' || title.endsWith('.rs')) return 'Rust';
    if (lang === 'c' || lang === 'cpp' || title.endsWith('.c') || title.endsWith('.cpp') || title.endsWith('.h')) return 'C++';
    if (lang === 'java' || title.endsWith('.java')) return 'Java';
    if (lang === 'sql' || title.endsWith('.sql')) return 'SQL';
    if (lang === 'yaml' || title.endsWith('.yaml') || title.endsWith('.yml')) return 'YAML';
    if (lang === 'xml' || title.endsWith('.xml')) return 'XML';
    if (lang === 'shell' || title.endsWith('.sh') || title.endsWith('.bash')) return 'Shell Script';
    return lang && lang !== 'plaintext' ? lang.charAt(0).toUpperCase() + lang.slice(1) : 'Plain Text';
  });
  readonly cursorPosition = signal('Ln 1, Col 1');
  readonly isWordWrapEnabled = signal(false);
  readonly lastSaved = signal<Date | null>(null);

  readonly isSaving = signal(false);
  readonly executionLanguages = signal<ExecutionLanguageOption[]>([]);
  readonly selectedExecutionLanguage = signal('');
  readonly isLoadingExecutionLanguages = signal(false);
  readonly terminalHeight = signal<number>(280);

  private isUpdatingFromRemote = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastJoinedDocumentId: string | null = null;

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

    this.destroyRef.onDestroy(() => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      if (this.saveDebounceTimer) {
        clearTimeout(this.saveDebounceTimer);
        this.saveDebounceTimer = null;
        const currentDocId = this.docId();
        if (currentDocId && this.isEditable()) {
          void this.saveToBackend(this.codeSignal());
        }
      }
      if (this.cursorThrottleTimer) {
        clearTimeout(this.cursorThrottleTimer);
        this.cursorThrottleTimer = null;
      }
      if (this.activeCleanupResizer) {
        this.activeCleanupResizer();
      }

      if (this.lastJoinedDocumentId) {
        void this.realtimeService.leaveDocument(this.lastJoinedDocumentId);
        this.lastJoinedDocumentId = null;
      } else {
        const currentDocId = this.docId();
        if (currentDocId) {
          void this.realtimeService.leaveDocument(currentDocId);
        }
      }

      this.editorView?.destroy();
      this.editorView = null;
    });
  }

  readonly activeCollaborators = computed(() => {
    const id = this.docId();
    return id ? this.realtimeService.getOrCreateDocumentState(id).activeCollaborators() : [];
  });

  readonly comments = computed(() => {
    const id = this.docId();
    return id ? this.realtimeService.getOrCreateDocumentState(id).comments() : [];
  });

  readonly activeUserCount = computed(() => {
    const id = this.docId();
    return id ? this.realtimeService.getOrCreateDocumentState(id).activeUserCount() : 0;
  });

  constructor() {
    effect(() => {
      const currentDocId = this.docId();
      if (!currentDocId) return;
      const state = this.realtimeService.getOrCreateDocumentState(currentDocId);
      const newContent = state.contentUpdate();
      if (newContent) {
        this.codeSignal.set(newContent);
        this.updateEditorDocument(newContent);
      }
    });

    effect(() => {
      const currentDocId = this.docId();
      if (!currentDocId) return;
      const state = this.realtimeService.getOrCreateDocumentState(currentDocId);
      const update = state.cursorUpdate();
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
      const selectedLanguage = this.selectedExecutionLanguage();
      if (selectedLanguage) {
        void this.refreshPackageManagerForCurrentLanguage();
      }
    });

    effect(() => {
      const currentDocId = this.docId();
      const loadedDocId = this.document()?.id;
      const isLoading = this.isLoading();

      if (!currentDocId || loadedDocId !== currentDocId || isLoading) {
        return;
      }

      // Join realtime document once when loaded; stay joined while tab exists in openTabs
      if (this.lastJoinedDocumentId !== currentDocId) {
        if (this.lastJoinedDocumentId) {
          void this.realtimeService.leaveDocument(this.lastJoinedDocumentId);
        }
        this.lastJoinedDocumentId = currentDocId;
        void this.joinRealtimeDocument(currentDocId);
      }
    });

    effect(() => {
      const active = this.isActive();
      const currentDocId = this.docId();

      if (active && currentDocId) {
        this.realtimeService.setCurrentDocumentId(currentDocId);
        setTimeout(() => {
          this.editorView?.requestMeasure();
          if (this.isTerminalOpen()) {
            this.liveTerminalService.fit();
          }
        }, 30);
      }
    });

    afterNextRender(() => {
      this.initializeEditor();
    });
  }

  private async joinRealtimeDocument(id: string): Promise<void> {
    try {
      await this.realtimeService.startConnection();
      await this.realtimeService.joinDocument(id);
    } catch (err) {
      console.error('Error joining realtime document:', err);
    }
  }

  private async leaveRealtimeDocument(id: string): Promise<void> {
    try {
      await this.realtimeService.leaveDocument(id);
    } catch (err) {
      console.error('Error leaving realtime document:', err);
    }
  }

  async loadDocument(id: string) {
    this.isLoading.set(true);
    this.error.set('');

    try {
      const doc = await this.documentService.getDocument(id);
      this.document.set(doc);
      this.docTitle.set(doc.title);

      let content = doc.content || '// Start typing to collaborate...\n';

      // Restore unsaved local draft if available from a previous network disruption
      try {
        const localDraft = localStorage.getItem(`livesync_draft_${id}`);
        if (localDraft && localDraft.trim() !== '' && localDraft !== content) {
          content = localDraft;
        }
      } catch {}

      this.codeSignal.set(content);

      const language = this.detectLanguage(doc.title || id, content);
      this.currentLanguage.set(language);
      this.updateEditorDocument(content, language);

      const execLang = language === 'typescript' ? 'javascript' : language;
      if (['python', 'javascript'].includes(execLang)) {
        this.selectedExecutionLanguage.set(execLang);
      }

      const accessLevel = await this.documentService.getAccessLevel(id);
      this.accessLevel.set(accessLevel);
      const isEditable = (accessLevel === 'Edit' || accessLevel === 'Owner') && doc.permission !== 'View';
      this.updateReadOnlyState(isEditable);

      if (doc.title) {
        this.liveTerminalService.syncFiles({ [doc.title]: content });
      }

      await this.loadExecutionLanguages();
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

  private readonly declaredWordsAndLanguageCompletions: CompletionSource = async (
    context: CompletionContext,
  ) => {
    const word = context.matchBefore(/[\w$]+/);
    if (!word || (word.from === word.to && !context.explicit)) {
      return null;
    }

    if (word.text.length < 2 && !context.explicit) {
      return null;
    }

    const anyWordResult = await completeAnyWord(context);
    const wordOptions = anyWordResult && 'options' in anyWordResult ? anyWordResult.options : [];

    const languageData = context.state.languageDataAt<CompletionSource>('autocomplete', context.pos);
    const langOptions: any[] = [];
    for (const source of languageData) {
      try {
        const res = await source(context);
        if (res && 'options' in res && res.options) {
          langOptions.push(...res.options);
        }
      } catch {
        // ignore
      }
    }

    const combinedMap = new Map<string, any>();

    for (const opt of langOptions) {
      const label = typeof opt === 'string' ? opt : opt.label;
      if (label && !combinedMap.has(label)) {
        combinedMap.set(label, typeof opt === 'string' ? { label, type: 'keyword' } : opt);
      }
    }

    for (const opt of wordOptions) {
      const label = typeof opt === 'string' ? opt : opt.label;
      if (label && label.length > 1 && !combinedMap.has(label)) {
        combinedMap.set(label, {
          label,
          type: 'variable',
          boost: 1,
        });
      }
    }

    return {
      from: word.from,
      options: Array.from(combinedMap.values()),
      validFor: /^[\w$]*$/,
    };
  };

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
        autocompletion({
          override: [this.declaredWordsAndLanguageCompletions],
          defaultKeymap: true,
        }),
        this.languageCompartment.of(this.getLanguageExtension(language)),
        this.readOnlyCompartment.of([
          EditorState.readOnly.of(!this.isEditable()),
          EditorView.editable.of(this.isEditable()),
        ]),
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

  readonly selectedLineForComment = signal<number>(1);
  readonly newCommentText = signal<string>('');
  readonly replyDrafts = signal<{ [commentId: string]: string }>({});

  private cursorThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCursorArgs: { pos: number; lineNumber: number; userName: string } | null = null;

  private updateCursorLabel(state: EditorState) {
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const col = pos - line.from + 1;
    this.cursorPosition.set(`Ln ${line.number}, Col ${col}`);
    this.selectedLineForComment.set(line.number);

    const currentDocId = this.docId();
    if (currentDocId) {
      this.pendingCursorArgs = {
        pos,
        lineNumber: line.number,
        userName: this.authService.user()?.userName || 'Collaborator',
      };

      if (!this.cursorThrottleTimer) {
        this.cursorThrottleTimer = setTimeout(() => {
          if (this.pendingCursorArgs && this.docId()) {
            void this.realtimeService.sendCursorPosition(
              this.docId(),
              this.pendingCursorArgs.pos,
              this.pendingCursorArgs.lineNumber,
              this.pendingCursorArgs.lineNumber,
              this.pendingCursorArgs.userName,
            );
          }
          this.cursorThrottleTimer = null;
        }, 100);
      }
    }
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
    const collaborator = this.activeCollaborators().find((c) => c.userId === id);
    return collaborator?.userName || collaborator?.userId || id;
  }

  followedLineNumber(): number {
    const id = this.realtimeService.followedUserId();
    if (!id) return 1;
    const collaborator = this.activeCollaborators().find((c) => c.userId === id);
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
    switch ((language || '').toLowerCase()) {
      case 'java':
        return java();
      case 'csharp':
      case 'cs':
        return [];
      case 'python':
      case 'py':
        return python();
      case 'typescript':
        return javascript({ typescript: true });
      case 'javascript':
      case 'js':
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

  private scheduleDebounce(value: string) {
    const currentDocId = this.docId();
    if (currentDocId) {
      try {
        localStorage.setItem(`livesync_draft_${currentDocId}`, value);
      } catch {}
    }

    // Proactively sync live buffer to workspace terminal disk
    const docTitle = this.document()?.title || this.docTitle();
    if (docTitle) {
      this.liveTerminalService.syncFiles({ [docTitle]: value });
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (this.realtimeService.connectionState() === 'connected') {
        void this.realtimeService.sendUpdate(this.docId(), value).catch((sendError) => {
          console.error('Error sending real-time update:', sendError);
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
    }, 2000);
  }

  public async triggerManualSave(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    await this.saveToBackend(this.codeSignal());
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
          this.realtimeService.connectionState() === 'connected' ? 'Real-time user' : 'Offline user',
      });
      this.lastSaved.set(new Date());

      // Save acknowledged by server: clear local draft item
      try {
        localStorage.removeItem(`livesync_draft_${currentDocId}`);
      } catch {}

      // Silently sync saved file to live workspace terminal on disk
      const docTitle = this.document()?.title || this.docTitle();
      if (docTitle) {
        this.liveTerminalService.syncFiles({ [docTitle]: content });
      }
    } catch (saveError: any) {
      console.error('Error saving document to backend:', saveError);
      const errorMessage = this.getErrorMessage(saveError, '').toLowerCase();
      const isExplicitPermissionRevocation =
        errorMessage.includes('access') ||
        errorMessage.includes('edit') ||
        errorMessage.includes('permission') ||
        Boolean(saveError?.isPermissionError);

      if (saveError.status === 403 && isExplicitPermissionRevocation) {
        // 403 = explicitly forbidden — access was revoked
        this.handlePermissionRevoked();
      } else if (saveError.status === 403) {
        console.warn('Document update rejected by server:', saveError);
      } else if (saveError.status === 401) {
        // 401 = unauthenticated (session expired) — NOT a permission revocation
        this.permissionRevokedMessage.set(
          'Your session has expired. Please save your work and log in again.',
        );
        this.showPermissionBanner.set(true);
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  updateReadOnlyState(isEditable: boolean): void {
    this.isEditable.set(isEditable);
    if (this.editorView) {
      this.editorView.dispatch({
        effects: this.readOnlyCompartment.reconfigure([
          EditorState.readOnly.of(!isEditable),
          EditorView.editable.of(isEditable),
        ]),
      });
    }
  }

  dismissPermissionBanner(): void {
    this.showPermissionBanner.set(false);
  }

  private handlePermissionRevoked(): void {
    this.updateReadOnlyState(false);
    this.accessLevel.set('View');
    this.permissionRevokedMessage.set(
      'Your edit access has been revoked. You can still view real-time updates but cannot make changes.',
    );
    this.showPermissionBanner.set(true);
  }

  toggleTheme() {
    const shouldBeDark = !this.isDarkMode();
    this.isDarkMode.set(shouldBeDark);
    this.liveTerminalService.setTheme(shouldBeDark);

    if (!this.editorView) {
      return;
    }

    this.editorView.dispatch({
      effects: this.themeCompartment.reconfigure(
        shouldBeDark ? oneDark : this.editorThemeExtension(),
      ),
    });
  }

  private formatPythonCode(code: string): string {
    const lines = code.split(/\r?\n/);
    const formattedLines: string[] = [];
    let indentLevel = 0;

    const blockStartRegex = /:\s*(#.*)?$/;
    const dedentBlockRegex = /^\s*(elif\b|else\b|except\b|finally\b)/;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trimEnd();
      const trimmed = line.trim();

      if (!trimmed) {
        formattedLines.push('');
        continue;
      }

      if (dedentBlockRegex.test(trimmed) && indentLevel > 0) {
        indentLevel--;
      }

      const indent = '    '.repeat(Math.max(0, indentLevel));
      formattedLines.push(indent + trimmed);

      if (blockStartRegex.test(trimmed) && !trimmed.startsWith('#')) {
        indentLevel++;
      }
    }

    return formattedLines.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  private formatCSharpCode(code: string): string {
    const lines = code.split(/\r?\n/);
    const formattedLines: string[] = [];
    let indentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) {
        formattedLines.push('');
        continue;
      }

      if (trimmed.startsWith('}') || trimmed.startsWith('})')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      const indent = '    '.repeat(indentLevel);
      formattedLines.push(indent + trimmed);

      if (trimmed.endsWith('{') && !trimmed.startsWith('//')) {
        indentLevel++;
      }
    }

    return formattedLines.join('\n').replace(/\n{3,}/g, '\n\n');
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
    const lang = (this.currentLanguage() || '').toLowerCase();

    if (lang === 'python' || lang === 'py') {
      const formatted = this.formatPythonCode(source);
      if (formatted !== source) {
        this.codeSignal.set(formatted);
        this.updateEditorDocument(formatted);
        this.scheduleDebounce(formatted);
      }
      return;
    }

    if (lang === 'csharp' || lang === 'cs' || lang === 'java') {
      const formatted = this.formatCSharpCode(source);
      if (formatted !== source) {
        this.codeSignal.set(formatted);
        this.updateEditorDocument(formatted);
        this.scheduleDebounce(formatted);
      }
      return;
    }

    const formatter = await this.getFormatterConfig(lang);
    if (!formatter) {
      return;
    }

    try {
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
    } catch (e) {
      console.warn('Prettier formatting warning:', e);
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

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    if (event.ctrlKey && (event.key === '`' || event.key === '~')) {
      event.preventDefault();
      this.toggleTerminalPanel();
    }
  }

  toggleTerminalPanel(): void {
    const next = !this.isTerminalOpen();
    this.isTerminalOpen.set(next);
    if (next) {
      this.initLiveTerminal();
    }
  }

  openTerminalPanel(): void {
    this.isTerminalOpen.set(true);
    this.initLiveTerminal();
  }

  initLiveTerminal(): void {
    setTimeout(async () => {
      const el = this.xtermContainer()?.nativeElement;
      if (el) {
        const doc = this.document();
        const projectId = doc?.folderId || this.docId() || 'default';
        let projectName = '';
        if (doc?.folderId) {
          try {
            const folder = await this.folderService.getFolder(doc.folderId);
            projectName = folder?.name || '';
          } catch {
            // Safe fallback
          }
        }
        this.liveTerminalService.attachToElement(el, projectId, this.isDarkMode(), projectName);

        try {
          const snapshot = await this.getWorkspaceFilesSnapshot();
          if (Object.keys(snapshot.files).length > 0) {
            this.liveTerminalService.syncFiles(snapshot.files, snapshot.lockedFiles);
          }
        } catch {
          // Non-blocking file snapshot sync
        }
      }
    }, 50);
  }

  async getWorkspaceFilesSnapshot(): Promise<{ files: Record<string, string>; lockedFiles: string[] }> {
    const currentDoc = this.document();
    const filesSnapshot: Record<string, string> = {};
    const lockedFiles: string[] = [];
    const activeDocTitle = currentDoc?.title || this.docTitle() || 'main.py';

    if (currentDoc?.folderId) {
      try {
        const folderData = await this.folderService.getFolder(currentDoc.folderId);
        if (folderData?.documents && folderData.documents.length > 0) {
          for (const d of folderData.documents) {
            const isDocReadOnly =
              d.permission === 'View' ||
              d.defaultAccessLevel === 'View' ||
              (d.id === currentDoc.id && !this.isEditable());

            filesSnapshot[d.title] = d.id === currentDoc.id ? this.codeSignal() : (d.content || '');
            if (isDocReadOnly) {
              lockedFiles.push(d.title);
            }
          }
        }
      } catch (err) {
        console.warn('Could not snapshot project folder files for workspace:', err);
      }
    }

    // Always ensure the active editor document is present in the files snapshot
    filesSnapshot[activeDocTitle] = this.codeSignal();
    if (!this.isEditable() && !lockedFiles.includes(activeDocTitle)) {
      lockedFiles.push(activeDocTitle);
    }

    return { files: filesSnapshot, lockedFiles };
  }

  restartTerminal(): void {
    this.liveTerminalService.restart();
  }

  clearTerminal(): void {
    this.liveTerminalService.clear();
  }

  focusTerminal(): void {
    this.liveTerminalService.focus();
  }

  readonly isTerminalMaximized = signal<boolean>(false);

  closeAllTerminals(): void {
    this.isTerminalOpen.set(false);
  }

  toggleMaximizeTerminal(): void {
    const isMax = this.isTerminalMaximized();
    if (isMax) {
      this.terminalHeight.set(280);
      this.isTerminalMaximized.set(false);
    } else {
      const maxHeight = Math.max(window.innerHeight - 140, 450);
      this.terminalHeight.set(maxHeight);
      this.isTerminalMaximized.set(true);
    }
    setTimeout(() => this.liveTerminalService.fit(), 50);
  }

  private isResizingTerminal = false;
  private startY = 0;
  private startHeight = 280;

  startResizingTerminal(event: MouseEvent | TouchEvent): void {
    const clientY = 'touches' in event ? event.touches[0].clientY : (event as MouseEvent).clientY;
    this.isResizingTerminal = true;
    this.startY = clientY;
    this.startHeight = this.terminalHeight();

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!this.isResizingTerminal) return;
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : (moveEvent as MouseEvent).clientY;
      const deltaY = this.startY - currentY;
      const maxHeight = Math.max(window.innerHeight - 160, 300);
      const newHeight = Math.min(Math.max(this.startHeight + deltaY, 120), maxHeight);
      this.terminalHeight.set(newHeight);
    };

    const onEnd = () => {
      this.isResizingTerminal = false;
      this.activeCleanupResizer = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    this.activeCleanupResizer = onEnd;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
  }

  resetTerminalHeight(): void {
    this.terminalHeight.set(280);
  }

  setExecutionLanguage(val: string): void {
    this.selectedExecutionLanguage.set(val);
    this.currentLanguage.set(val);
    if (this.editorView) {
      this.editorView.dispatch({
        effects: this.languageCompartment.reconfigure(this.getLanguageExtension(val)),
      });
    }
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

    let start = 0;
    while (start < current.length && start < content.length && current[start] === content[start]) {
      start++;
    }

    let endCurrent = current.length;
    let endContent = content.length;
    while (endCurrent > start && endContent > start && current[endCurrent - 1] === content[endContent - 1]) {
      endCurrent--;
      endContent--;
    }

    const replacement = content.slice(start, endContent);

    this.isUpdatingFromRemote = true;
    try {
      view.dispatch({
        changes: { from: start, to: endCurrent, insert: replacement },
      });
    } finally {
      this.isUpdatingFromRemote = false;
    }
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

    if (loweredName.endsWith('.py')) {
      return 'python';
    }

    if (loweredName.endsWith('.ts') || loweredName.endsWith('.tsx')) {
      return 'typescript';
    }

    if (loweredName.endsWith('.cs')) {
      return 'csharp';
    }

    if (loweredName.endsWith('.java')) {
      return 'java';
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

    if (/\bdef\s+\w+|\bimport\s+\w+|\bfrom\s+\w+\s+import|\bprint\s*\(|\binput\s*\(|\bif\s+__name__\s*==|\bself\.\w+/i.test(trimmed)) {
      return 'python';
    }

    if (/\bpublic\s+(class|interface|enum|record)\b|\bimport\s+java\.\w+|\bSystem\.out\.print|\bpublic\s+static\s+void\s+main\b/i.test(trimmed)) {
      return 'java';
    }

    if (/\busing\s+System\b|\bnamespace\s+\w+|\bConsole\.(Write|ReadLine)/i.test(trimmed)) {
      return 'csharp';
    }

    if (/\bconst\s+|\blet\s+|\bvar\s+|\bfunction\s+|\bconsole\.(log|error|warn)|\bdocument\.|\bwindow\.|\bexport\s+(default|const|function|class)/i.test(trimmed)) {
      return 'javascript';
    }

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

    const defaultFallback: ExecutionLanguageOption[] = [
      { name: 'python', displayName: 'Python' },
      { name: 'javascript', displayName: 'JavaScript (Node.js)' },
    ];

    try {
      const rawLanguages = await this.documentService.getExecutionLanguages();
      const parsed: ExecutionLanguageOption[] = (rawLanguages || [])
        .map((lang: any) => {
          if (typeof lang === 'string') {
            return { name: lang, displayName: lang.toUpperCase() };
          }
          if (lang && (lang.name || lang.id)) {
            const name = lang.name || lang.id;
            const displayName = lang.displayName || lang.name || lang.id;
            return { name, displayName };
          }
          return null;
        })
        .filter((item): item is ExecutionLanguageOption => item !== null);

      const finalLanguages = parsed.length > 0 ? parsed : defaultFallback;
      this.executionLanguages.set(finalLanguages);

      const detected = this.detectLanguage(this.docTitle() || this.docId(), this.codeSignal());
      const targetLang = detected === 'typescript' ? 'javascript' : detected;

      const matchingLang = finalLanguages.find((l) => l.name === targetLang);
      if (matchingLang) {
        this.selectedExecutionLanguage.set(matchingLang.name);
      } else if (!finalLanguages.some((l) => l.name === this.selectedExecutionLanguage())) {
        this.selectedExecutionLanguage.set(finalLanguages[0].name);
      }
    } catch {
      this.executionLanguages.set(defaultFallback);
      const detected = this.detectLanguage(this.docTitle() || this.docId(), this.codeSignal());
      const targetLang = detected === 'typescript' ? 'javascript' : detected;
      const matchingLang = defaultFallback.find((l) => l.name === targetLang);
      this.selectedExecutionLanguage.set(matchingLang ? matchingLang.name : defaultFallback[0].name);
    } finally {
      this.isLoadingExecutionLanguages.set(false);
    }
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null) {
      const errObj = error as any;
      if (typeof errObj.error === 'string' && errObj.error.trim()) {
        return errObj.error;
      }
      if (errObj.error && typeof errObj.error === 'object') {
        if (typeof errObj.error.message === 'string' && errObj.error.message.trim()) {
          return errObj.error.message;
        }
        if (typeof errObj.error.error === 'string' && errObj.error.error.trim()) {
          return errObj.error.error;
        }
      }
      if (typeof errObj.message === 'string' && errObj.message.trim()) {
        return errObj.message;
      }
    }
    return fallback;
  }

  readonly aiAction = signal<string>('explain');
  readonly isAiLoading = signal<boolean>(false);
  readonly aiResult = signal<import('../../services/document.service').AiAnalysisResponse | null>(null);
  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly aiError = signal<string>('');
  readonly userCustomPrompt = signal<string>('');
  readonly aiCopiedMessageId = signal<string>('');

  clearChatHistory(): void {
    this.chatMessages.set([]);
    this.aiResult.set(null);
  }

  refreshAiAnalysis(): void {
    void this.runAiAnalysis(this.aiAction());
  }

  handleChatKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.sendCustomAiPrompt();
    }
  }

  async sendCustomAiPrompt(): Promise<void> {
    const customPrompt = this.userCustomPrompt().trim();
    if (!customPrompt || this.isAiLoading()) return;

    this.userCustomPrompt.set('');
    await this.runAiAnalysis('chat', customPrompt);
  }

  async runAiAnalysis(action: string, customPrompt?: string): Promise<void> {
    const docId = this.docId();
    if (!docId) return;

    this.aiAction.set(action);
    this.isAiLoading.set(true);
    this.aiError.set('');

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let userMessageText = customPrompt;
    if (!userMessageText) {
      if (action === 'explain') userMessageText = 'Explain code snippet';
      else if (action === 'refactor') userMessageText = 'Refactor & optimize code';
      else if (action === 'generate-tests') userMessageText = 'Generate unit test suite';
      else if (action === 'complexity') userMessageText = 'Analyze Big-O complexity';
      else if (action === 'suggest') userMessageText = 'Suggest code completion';
      else userMessageText = `Run action: ${action}`;
    }

    this.chatMessages.update((msgs) => [
      ...msgs,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: userMessageText,
        timestamp: timeStr,
      },
    ]);

    try {
      const language = this.selectedExecutionLanguage() || this.currentLanguage() || 'python';
      const code = this.codeSignal();
      const result = await this.documentService.aiAssistant(docId, action, language, code, customPrompt);
      this.aiResult.set(result);

      this.chatMessages.update((msgs) => [
        ...msgs,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: result.explanation,
          action: result.action,
          suggestions: result.suggestions,
          generatedCode: result.generatedCode || undefined,
          provider: result.provider || 'Local LLM (llama.cpp)',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (error: unknown) {
      this.aiError.set('AI assistant request failed. Please verify endpoint connectivity.');
    } finally {
      this.isAiLoading.set(false);
    }
  }

  copyMessageText(msgId: string, text: string): void {
    if (text) {
      navigator.clipboard.writeText(text);
      this.aiCopiedMessageId.set(msgId);
      setTimeout(() => this.aiCopiedMessageId.set(''), 2000);
    }
  }

  applyMessageCode(code?: string, action?: string): void {
    if (!code) return;

    const currentDocId = this.docId();
    if (!currentDocId || !this.isEditable()) return;

    let updatedCode = this.codeSignal();
    if (action === 'generate-tests' || action === 'suggest') {
      updatedCode += `\n\n${code}`;
    } else {
      updatedCode = code;
    }

    this.codeSignal.set(updatedCode);
    this.updateEditorDocument(updatedCode);
    this.scheduleDebounce(updatedCode);
  }
}
