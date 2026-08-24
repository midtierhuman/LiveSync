import { Component, HostListener, inject, signal, computed, OnInit, DestroyRef, viewChildren, viewChild, ElementRef, effect, untracked } from '@angular/core';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet, DatePipe } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../services/auth.service';
import { DocumentService, DocumentDto, SharedDocumentDto, FolderPathNode } from '../../services/document.service';
import { FolderService, FolderDto, SharedFolderDto, AuditLogDto } from '../../services/folder.service';
import { LiveTerminalService } from '../../services/live-terminal.service';
import { VFSService } from '../../services/vfs.service';
import { RealtimeService } from '../../services/realtime.service';
import { PackageManagerService } from '../../services/package-manager.service';
import { WorkspaceSearchService, SearchMatch } from '../../services/workspace-search.service';
import { RunConfigService } from '../../services/run-config.service';
import { AiAgentService } from '../../services/ai-agent.service';
import JSZip from 'jszip';
import { Editor, ChatMessage } from '../editor/editor';
import {
  ShareModalComponent,
  SharedCollaborator,
  ConfirmDeleteModalComponent,
  MoveModalComponent,
  CreateFileModalComponent,
  RenameModalComponent,
  RenameItemType,
  TargetFolderOption,
  CreateFileSubmitPayload,
} from '../../shared/components/modals';

const EXPLORER_WIDTH_STORAGE_KEY = 'livesync.explorerWidth';
const EXPLORER_MIN_WIDTH = 180;
const EXPLORER_MAX_WIDTH = 600;
const EXPLORER_DEFAULT_WIDTH = 260;

const AI_DOCK_POSITION_KEY = 'livesync.aiDockPosition';
const AI_DOCK_OPEN_KEY = 'livesync.aiDockOpen';
const AI_DOCK_WIDTH_KEY = 'livesync.aiDockWidth';
const AI_DOCK_MIN_WIDTH = 280;
const AI_DOCK_MAX_WIDTH = 750;
const AI_DOCK_DEFAULT_WIDTH = 380;

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    RouterModule,
    FormsModule,
    DatePipe,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    MatCardModule,
    MatInputModule,
    MatDialogModule,
    MatListModule,
    MatTooltipModule,
    Editor,
    NgTemplateOutlet,
    ShareModalComponent,
    ConfirmDeleteModalComponent,
    MoveModalComponent,
    CreateFileModalComponent,
    RenameModalComponent,
  ],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
})
export class Workspace implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly documentService = inject(DocumentService);
  private readonly folderService = inject(FolderService);
  public readonly liveTerminalService = inject(LiveTerminalService);
  public readonly searchService = inject(WorkspaceSearchService);
  public readonly runConfigService = inject(RunConfigService);
  public readonly aiAgentService = inject(AiAgentService);
  private readonly realtimeService = inject(RealtimeService);
  public readonly vfsService = inject(VFSService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private activeCleanupResizer?: (() => void) | null;
  private activeCleanupTerminalResizer?: (() => void) | null;
  private lastHandledPermTimestamp = 0;
  private lastJoinedWorkspaceId: string | null = null;
  private loadWorkspaceSeq = 0;
  private workspaceChangeDebounceTimer: any = null;

  readonly antigravityKeyInput = signal<string>('');
  readonly aiKeySaveFeedback = signal<string>('');

  onOpenAiConnectModal(providerId?: string): void {
    const pid = providerId || this.aiAgentService.activeProviderId();
    if (pid === 'antigravity') {
      this.antigravityKeyInput.set(this.aiAgentService.antigravityKey());
    } else if (pid === 'codex') {
      this.antigravityKeyInput.set(this.aiAgentService.codexKey());
    } else if (pid === 'claude') {
      this.antigravityKeyInput.set(this.aiAgentService.claudeKey());
    }
    this.aiKeySaveFeedback.set('');
    this.aiAgentService.openConnectModal();
  }

  saveActiveAiKey(): void {
    const key = this.antigravityKeyInput().trim();
    const pid = this.aiAgentService.activeProviderId();
    this.aiAgentService.setProviderKey(pid, key);
    this.aiKeySaveFeedback.set(key ? 'Connected successfully!' : 'Key removed.');
    setTimeout(() => {
      this.aiKeySaveFeedback.set('');
      this.aiAgentService.closeConnectModal();
    }, 1000);
  }

  disconnectActiveAiKey(): void {
    const pid = this.aiAgentService.activeProviderId();
    this.aiAgentService.disconnectProvider(pid);
    this.antigravityKeyInput.set('');
    this.aiKeySaveFeedback.set('Account disconnected.');
    setTimeout(() => {
      this.aiKeySaveFeedback.set('');
      this.aiAgentService.closeConnectModal();
    }, 800);
  }

  constructor() {
    effect(() => {
      const fsChange = this.liveTerminalService.onFileSystemChange();
      if (fsChange) {
        untracked(() => {
          void this.loadWorkspace(true);
        });
      }
    });

    effect(() => {
      const wsChange = this.realtimeService.onWorkspaceChange();
      if (wsChange) {
        untracked(() => {
          // 1. Optimistic VFS and open tabs update to eliminate race conditions
          if (wsChange.action === 'rename' && wsChange.itemId && wsChange.name) {
            const itemType = wsChange.itemType === 'folder' ? 'folder' : 'file';
            this.vfsService.renameItem(itemType, wsChange.itemId, wsChange.name);
            if (itemType === 'file') {
              this.openTabs.update((tabs) =>
                tabs.map((t) => (t.id === wsChange.itemId ? { ...t, title: wsChange.name! } : t))
              );
            }
          } else if (wsChange.action === 'move' && wsChange.itemId) {
            const itemType = wsChange.itemType === 'folder' ? 'folder' : 'file';
            this.vfsService.moveItem(itemType, wsChange.itemId, wsChange.newParentFolderId || wsChange.parentFolderId);
          } else if (wsChange.action === 'delete' && wsChange.itemId) {
            const itemType = wsChange.itemType === 'folder' ? 'folder' : 'file';
            this.vfsService.deleteItem(itemType, wsChange.itemId);
          }

          // 2. Debounced authoritative background synchronization
          if (this.workspaceChangeDebounceTimer) {
            clearTimeout(this.workspaceChangeDebounceTimer);
          }
          this.workspaceChangeDebounceTimer = setTimeout(() => {
            void this.loadWorkspace(true);
          }, 150);
        });
      }
    });

    effect(() => {
      const perm = this.realtimeService.onPermissionUpdated();
      if (!perm) return;
      untracked(() => {
        if (perm.timestamp && perm.timestamp === this.lastHandledPermTimestamp) {
          return;
        }
        this.lastHandledPermTimestamp = perm.timestamp || Date.now();
        const myId = this.authService.user()?.id;
        if (perm.targetUserId === myId) {
          const scoped = this.scopedProject();
          if (scoped && (!perm.workspaceId || perm.workspaceId === scoped.id)) {
            if (scoped.permission !== perm.accessLevel) {
              this.scopedProject.set({ ...scoped, permission: perm.accessLevel });
            }
          }
          void this.loadWorkspace(true);
        }
      });
    });

    effect(() => {
      const projId = this.scopedProject()?.id;
      if (projId && projId !== this.lastJoinedWorkspaceId) {
        this.lastJoinedWorkspaceId = projId;
        untracked(() => {
          void this.realtimeService.joinWorkspace(projId);
        });
      }
    });

    effect(() => {
      const view = this.activeSidebarView();
      if (view === 'packages') {
        untracked(() => {
          const lang = this.getCurrentWorkspaceLanguage();
          void this.packageManagerService.fetchPopularPackages(lang);
          void this.packageManagerService.fetchInstalledPackages(lang);
        });
      } else if (view === 'search') {
        untracked(() => {
          const projId = this.scopedProject()?.id || '';
          if (projId && this.searchService.query()) {
            void this.searchService.search(projId);
          }
        });
      }
    });
  }

  private notifyWorkspaceChange(
    action: 'create' | 'rename' | 'move' | 'delete' | 'refresh',
    itemType?: 'file' | 'folder',
    itemId?: string,
    name?: string,
    parentFolderId?: string | null,
  ) {
    const workspaceId = this.scopedProject()?.id || parentFolderId || 'global';
    this.realtimeService.notifyWorkspaceChange({
      workspaceId,
      action,
      itemType,
      itemId,
      name,
      parentFolderId,
    });
  }

  // Activity Bar & Sidebar View State
  activeSidebarView = signal<'explorer' | 'search' | 'run' | 'packages' | 'ai' | 'comments' | 'timeline'>('explorer');
  isSidebarOpen = signal<boolean>(true);
  isDarkMode = signal<boolean>(true);

  // Activity Timeline State (FEAT-18)
  auditLogs = signal<AuditLogDto[]>([]);
  isLoadingAuditLogs = signal<boolean>(false);
  timelineFilter = signal<'all' | 'collaborators' | 'saves'>('all');

  readonly filteredAuditLogs = computed(() => {
    const logs = this.auditLogs();
    const filter = this.timelineFilter();
    if (filter === 'collaborators') {
      return logs.filter(l => l.actionType.includes('COLLABORATOR') || l.actionType.includes('PERMISSION'));
    }
    if (filter === 'saves') {
      return logs.filter(l => l.actionType.includes('DOCUMENT') || l.actionType.includes('SAVE'));
    }
    return logs;
  });

  // Editor instances access
  readonly editorInstances = viewChildren(Editor);

  readonly activeEditorInstance = computed(() => {
    const tabs = this.openTabs();
    const activeId = this.activeTabId();
    const instances = this.editorInstances();
    return instances.find(inst => inst.documentId() === activeId) || instances[0] || null;
  });

  // Explorer resize state
  explorerWidth = signal<number>(this.getSavedExplorerWidth());
  private isResizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  // Flexible AI Dock State (FEAT-15)
  aiDockPosition = signal<'right' | 'left' | 'bottom'>(this.getSavedAiDockPosition());
  isAiDockOpen = signal<boolean>(this.getSavedAiDockOpen());
  aiDockWidth = signal<number>(this.getSavedAiDockWidth());
  bottomPanelActiveTab = signal<'terminal' | 'ai'>('terminal');
  private isResizingAiDock = false;
  private resizeAiDockStartX = 0;
  private resizeAiDockStartWidth = 0;

  // Tabs state & Drag-Drop Reordering (FEAT-17)
  openTabs = signal<Array<{ id: string; title: string }>>([]);
  activeTabId = signal<string>('');
  draggedTabIndex = signal<number | null>(null);
  dragOverTabIndex = signal<number | null>(null);

  // Active Project Scope
  scopedProject = signal<FolderDto | null>(null);

  // Folder & Documents signals
  myFolders = signal<FolderDto[]>([]);
  myDocuments = signal<DocumentDto[]>([]);
  sharedDocuments = signal<SharedDocumentDto[]>([]);
  sharedFolders = signal<SharedFolderDto[]>([]);
  sharedFolderTree = signal<FolderDto[]>([]);

  folderChildDocs = signal<Record<string, DocumentDto[]>>({});
  folderChildSubfolders = signal<Record<string, FolderDto[]>>({});
  expandedFolderIds = signal<Set<string>>(new Set());

  // Navigation & Breadcrumbs
  currentFolder = signal<FolderDto | null>(null);
  currentFolderId = signal<string | null>(null);
  targetParentFolderId = signal<string | null>(null);

  isLoading = signal(false);

  // Inline Creation State (VS Code-style inline file/folder creation)
  inlineCreation = signal<{
    parentFolderId: string | null;
    type: 'file' | 'folder';
    depth: number;
  } | null>(null);
  inlineCreationName = signal<string>('');

  // Folder & File Creation Modals
  showCreateFolderModal = signal(false);
  newFolderName = signal('');
  showCreateFilePrompt = signal(false);
  targetFolderForNewFile = signal<string | null>(null);

  showMoveModal = signal(false);
  selectedDocForMove = signal<DocumentDto | null>(null);

  showShareFolderModal = signal(false);
  selectedFolderForShare = signal<FolderDto | null>(null);
  folderShareCode = signal('');

  // Share Document Modal
  showShareModal = signal(false);
  selectedDocForShare = signal<DocumentDto | null>(null);
  shareCode = signal('');
  showDeleteConfirm = signal(false);
  deleteDocId = signal('');
  defaultAccessLevel = signal<string>('View');

  // Rename Modal State
  showRenameModal = signal(false);
  renameTarget = signal<{ id: string; name: string; type: RenameItemType } | null>(null);

  // AI Chat & Quick Actions State
  showAiQuickMenu = signal(false);
  readonly workspaceChatMessages = signal<ChatMessage[]>([]);
  readonly workspaceCustomPrompt = signal<string>('');
  readonly isWorkspaceAiLoading = signal<boolean>(false);
  readonly workspaceAiError = signal<string>('');

  readonly effectiveChatMessages = computed(() => {
    const editor = this.activeEditorInstance();
    if (editor && editor.chatMessages().length > 0) {
      return editor.chatMessages();
    }
    return this.workspaceChatMessages();
  });

  readonly isAiLoading = computed(() => {
    const editor = this.activeEditorInstance();
    if (editor) return editor.isAiLoading();
    return this.isWorkspaceAiLoading();
  });

  readonly userPromptValue = computed(() => {
    const editor = this.activeEditorInstance();
    if (editor) return editor.userCustomPrompt();
    return this.workspaceCustomPrompt();
  });

  setUserPrompt(val: string): void {
    const editor = this.activeEditorInstance();
    if (editor) {
      editor.userCustomPrompt.set(val);
    } else {
      this.workspaceCustomPrompt.set(val);
    }
  }

  handleChatKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.sendCustomAiPrompt();
    }
  }

  async sendCustomAiPrompt(): Promise<void> {
    const editor = this.activeEditorInstance();
    if (editor) {
      await editor.sendCustomAiPrompt();
      return;
    }

    const customPrompt = this.workspaceCustomPrompt().trim();
    if (!customPrompt || this.isWorkspaceAiLoading()) return;

    this.workspaceCustomPrompt.set('');
    await this.runWorkspaceAiAnalysis('chat', customPrompt);
  }

  toggleAiQuickMenu() {
    this.showAiQuickMenu.update((v) => !v);
  }

  runAiQuickAction(action: string) {
    this.showAiQuickMenu.set(false);
    const editor = this.activeEditorInstance();
    if (editor) {
      void editor.runAiAnalysis(action);
    } else {
      void this.runWorkspaceAiAnalysis(action);
    }
  }

  clearChatHistory(): void {
    const editor = this.activeEditorInstance();
    if (editor) {
      editor.clearChatHistory();
    }
    this.workspaceChatMessages.set([]);
  }

  copyMessageText(msgId: string, text?: string): void {
    if (text) {
      navigator.clipboard.writeText(text);
    }
  }

  applyMessageCode(code?: string, action?: string): void {
    const editor = this.activeEditorInstance();
    if (editor) {
      editor.applyMessageCode(code, action);
    }
  }

  async runWorkspaceAiAnalysis(action: string, customPrompt?: string): Promise<void> {
    this.isWorkspaceAiLoading.set(true);
    this.workspaceAiError.set('');

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let userMessageText = customPrompt;
    if (!userMessageText) {
      if (action === 'explain') userMessageText = 'Explain workspace code';
      else if (action === 'refactor') userMessageText = 'Refactor & optimize code';
      else if (action === 'generate-tests') userMessageText = 'Generate unit test suite';
      else if (action === 'complexity') userMessageText = 'Analyze Big-O complexity';
      else userMessageText = `Run action: ${action}`;
    }

    this.workspaceChatMessages.update((msgs) => [
      ...msgs,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: userMessageText,
        timestamp: timeStr,
      },
    ]);

    const aiMsgId = `ai-${Date.now()}`;
    this.workspaceChatMessages.update((msgs) => [
      ...msgs,
      {
        id: aiMsgId,
        sender: 'ai',
        text: '',
        action,
        suggestions: [],
        generatedCode: undefined,
        provider: 'AI Assistant (Synthesizing...)',
        timestamp: timeStr,
      },
    ]);

    try {
      const language = this.getCurrentWorkspaceLanguage();
      const apiKey = this.aiAgentService.getActiveApiKey();
      const provider = this.aiAgentService.activeProviderId();
      const includeContext = this.aiAgentService.includeProjectContext();
      const projectFiles = includeContext ? this.vfsService.getProjectFilesSnapshot() : undefined;
      const aiOptions = {
        apiKey,
        provider,
        projectFiles,
        projectId: this.scopedProject()?.id || undefined,
      };

      let accumulatedText = '';
      let currentProvider = this.aiAgentService.activeProvider().name;
      let currentSuggestions: string[] = [];
      let currentCode: string | undefined = undefined;

      const result = await this.documentService.streamAiAssistant(
        action,
        language,
        '',
        customPrompt,
        (chunk) => {
          if (chunk.delta) accumulatedText += chunk.delta;
          if (chunk.provider) currentProvider = chunk.provider;
          if (chunk.suggestions && chunk.suggestions.length > 0) currentSuggestions = chunk.suggestions;
          if (chunk.generatedCode) currentCode = chunk.generatedCode;

          this.workspaceChatMessages.update((msgs) =>
            msgs.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    text: accumulatedText,
                    provider: currentProvider,
                    suggestions: currentSuggestions,
                    generatedCode: currentCode,
                  }
                : m
            )
          );
        },
        undefined,
        aiOptions,
      );

      this.workspaceChatMessages.update((msgs) =>
        msgs.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                text: result.explanation || accumulatedText,
                action: result.action,
                suggestions: result.suggestions?.length ? result.suggestions : currentSuggestions,
                generatedCode: result.generatedCode || currentCode || undefined,
                provider: result.provider || currentProvider,
              }
            : m
        )
      );
    } catch {
      this.workspaceChatMessages.update((msgs) =>
        msgs.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                text: '⚠️ AI assistant request failed. Please check network connectivity or API key configuration.',
                provider: 'System Error',
              }
            : m
        )
      );
    } finally {
      this.isWorkspaceAiLoading.set(false);
    }
  }

  // Package Hub State & Methods
  readonly packageManagerService = inject(PackageManagerService);
  readonly packageSearchInput = signal('');

  onSearchPackageInput(query: string) {
    this.packageSearchInput.set(query);
    const lang = this.getCurrentWorkspaceLanguage();
    this.packageManagerService.searchPackagesReactive(query, lang);
  }

  async installTargetPackage(pkgName?: string) {
    const target = (pkgName || this.packageSearchInput()).trim();
    if (!target) return;
    const lang = this.getCurrentWorkspaceLanguage();
    await this.packageManagerService.installPackage(target, lang);
  }

  async uninstallTargetPackage(pkgName: string) {
    if (!pkgName) return;
    const lang = this.getCurrentWorkspaceLanguage();
    await this.packageManagerService.uninstallPackage(pkgName, lang);
  }

  getCurrentWorkspaceLanguage(): string {
    const activeTab = this.openTabs().find((t) => t.id === this.activeTabId());
    if (activeTab) {
      const ext = activeTab.title.split('.').pop()?.toLowerCase();
      if (['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'json'].includes(ext || '')) {
        return 'javascript';
      }
    }
    return 'python';
  }

  // Quick Open / Command Palette (Ctrl+P & Ctrl+Shift+P - FEAT-16)
  showQuickOpen = signal(false);
  quickOpenQuery = signal('');
  quickOpenSelectedIndex = signal(0);

  readonly isCommandMode = computed(() => this.quickOpenQuery().startsWith('>'));

  readonly commandList = computed<Array<{ id: string; title: string; category: string; icon: string; shortcut?: string; action: () => void }>>(() => [
    {
      id: 'ai.toggle',
      title: 'LiveSync AI: Toggle AI Assistant Dock',
      category: 'AI Assistant',
      icon: 'auto_awesome',
      shortcut: 'Ctrl+Alt+A',
      action: () => this.toggleAiDock(),
    },
    {
      id: 'ai.dock.right',
      title: 'LiveSync AI: Dock to Right (Secondary Sidebar)',
      category: 'AI Assistant',
      icon: 'vertical_split',
      action: () => this.setAiDockPosition('right'),
    },
    {
      id: 'ai.dock.left',
      title: 'LiveSync AI: Dock to Left Sidebar',
      category: 'AI Assistant',
      icon: 'view_sidebar',
      action: () => this.setAiDockPosition('left'),
    },
    {
      id: 'ai.dock.bottom',
      title: 'LiveSync AI: Dock to Bottom Panel',
      category: 'AI Assistant',
      icon: 'vertical_align_bottom',
      action: () => this.setAiDockPosition('bottom'),
    },
    {
      id: 'ai.connect',
      title: 'LiveSync AI: Configure API Keys & Agent Providers',
      category: 'AI Assistant',
      icon: 'key',
      action: () => this.onOpenAiConnectModal(),
    },
    {
      id: 'ai.explain',
      title: 'LiveSync AI: Explain Active Code',
      category: 'AI Assistant',
      icon: 'lightbulb',
      action: () => this.runAiQuickAction('explain'),
    },
    {
      id: 'ai.refactor',
      title: 'LiveSync AI: Refactor & Optimize Code',
      category: 'AI Assistant',
      icon: 'bolt',
      action: () => this.runAiQuickAction('refactor'),
    },
    {
      id: 'ai.tests',
      title: 'LiveSync AI: Generate Unit Tests',
      category: 'AI Assistant',
      icon: 'build',
      action: () => this.runAiQuickAction('generate-tests'),
    },
    {
      id: 'ai.complexity',
      title: 'LiveSync AI: Analyze Big-O Complexity',
      category: 'AI Assistant',
      icon: 'timer',
      action: () => this.runAiQuickAction('complexity'),
    },
    {
      id: 'terminal.toggle',
      title: 'Terminal: Toggle Integrated Terminal Dock',
      category: 'Terminal',
      icon: 'terminal',
      shortcut: 'Ctrl+`',
      action: () => this.toggleTerminalInActiveEditor(),
    },
    {
      id: 'terminal.new',
      title: 'Terminal: Create New Terminal Tab',
      category: 'Terminal',
      icon: 'add',
      action: () => this.liveTerminalService.createTab(),
    },
    {
      id: 'terminal.clear',
      title: 'Terminal: Clear Terminal Output',
      category: 'Terminal',
      icon: 'delete_sweep',
      action: () => this.clearTerminal(),
    },
    {
      id: 'terminal.restart',
      title: 'Terminal: Restart Active Terminal',
      category: 'Terminal',
      icon: 'restart_alt',
      action: () => this.restartTerminal(),
    },
    {
      id: 'view.sidebar',
      title: 'View: Toggle Primary Sidebar',
      category: 'View',
      icon: 'view_sidebar',
      shortcut: 'Ctrl+B',
      action: () => this.isSidebarOpen.update((open) => !open),
    },
    {
      id: 'view.explorer',
      title: 'View: Show File Explorer',
      category: 'View',
      icon: 'folder',
      action: () => this.toggleSidebarView('explorer'),
    },
    {
      id: 'view.search',
      title: 'View: Workspace Search & Replace',
      category: 'View',
      icon: 'search',
      shortcut: 'Ctrl+Shift+F',
      action: () => this.openWorkspaceSearch(),
    },
    {
      id: 'view.packages',
      title: 'View: Package Hub (npm / PyPI)',
      category: 'View',
      icon: 'inventory_2',
      action: () => this.toggleSidebarView('packages'),
    },
    {
      id: 'view.run',
      title: 'View: Run & Debug Configurations',
      category: 'View',
      icon: 'play_arrow',
      action: () => this.toggleSidebarView('run'),
    },
    {
      id: 'view.timeline',
      title: 'View: Activity Timeline & Audit Trail',
      category: 'View',
      icon: 'history',
      action: () => this.toggleSidebarView('timeline'),
    },
    {
      id: 'file.newFile',
      title: 'File: Create New File in Active Project',
      category: 'File',
      icon: 'note_add',
      action: () => this.openCreateInFolder(this.scopedProject()?.id || null, 'file'),
    },
    {
      id: 'file.newFolder',
      title: 'File: Create New Folder in Active Project',
      category: 'File',
      icon: 'create_new_folder',
      action: () => this.openCreateFolderModal(),
    },
    {
      id: 'file.save',
      title: 'File: Save Active Document',
      category: 'File',
      icon: 'save',
      shortcut: 'Ctrl+S',
      action: () => {
        const inst = this.activeEditorInstance();
        if (inst) void inst.triggerManualSave();
      },
    },
    {
      id: 'file.closeTab',
      title: 'File: Close Active Tab',
      category: 'File',
      icon: 'close',
      action: () => {
        const id = this.activeTabId();
        if (id) this.closeTab(id);
      },
    },
    {
      id: 'file.closeAllTabs',
      title: 'File: Close All Tabs',
      category: 'File',
      icon: 'cancel',
      action: () => {
        this.openTabs.set([]);
        this.activeTabId.set('');
      },
    },
    {
      id: 'editor.format',
      title: 'Editor: Format Active Document',
      category: 'Editor',
      icon: 'format_align_left',
      action: () => {
        const inst = this.activeEditorInstance();
        if (inst) void inst.formatCode();
      },
    },
    {
      id: 'workspace.projects',
      title: 'Projects: Back to Projects Dashboard',
      category: 'Navigation',
      icon: 'dashboard',
      action: () => this.goToDashboard(),
    },
  ]);

  readonly quickOpenFilteredCommands = computed(() => {
    const raw = this.quickOpenQuery().trim();
    const query = raw.startsWith('>') ? raw.slice(1).trim().toLowerCase() : raw.toLowerCase();
    const commands = this.commandList();
    if (!query) return commands;
    return commands.filter((c) =>
      c.title.toLowerCase().includes(query) || c.category.toLowerCase().includes(query)
    );
  });

  readonly quickOpenResults = computed(() => {
    const q = this.quickOpenQuery().toLowerCase().trim();
    if (this.isCommandMode()) {
      return [];
    }
    const docs = [
      ...this.myDocuments(),
      ...this.sharedDocuments().map((s) => ({
        id: s.documentId,
        title: s.documentTitle,
        folderId: s.folderPath && s.folderPath.length > 0 ? s.folderPath[s.folderPath.length - 1].id : undefined,
      })),
    ];

    if (!q) {
      return docs.slice(0, 25);
    }
    return docs.filter((d) => d.title && d.title.toLowerCase().includes(q)).slice(0, 25);
  });

  openCommandPalette() {
    this.showQuickOpen.set(true);
    this.quickOpenQuery.set('>');
    this.quickOpenSelectedIndex.set(0);
    setTimeout(() => {
      const input = document.getElementById('quick-open-input-field');
      if (input) {
        input.focus();
        (input as HTMLInputElement).setSelectionRange(1, 1);
      }
    }, 50);
  }

  openQuickOpen() {
    this.showQuickOpen.set(true);
    this.quickOpenQuery.set('');
    this.quickOpenSelectedIndex.set(0);
    setTimeout(() => {
      const input = document.getElementById('quick-open-input-field');
      if (input) input.focus();
    }, 50);
  }

  toggleQuickOpen() {
    if (this.showQuickOpen()) {
      this.showQuickOpen.set(false);
    } else {
      this.openQuickOpen();
    }
  }

  handleQuickOpenKeyDown(event: KeyboardEvent) {
    const count = this.isCommandMode() ? this.quickOpenFilteredCommands().length : this.quickOpenResults().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.quickOpenSelectedIndex.update((i) => (i + 1) % Math.max(1, count));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.quickOpenSelectedIndex.update((i) => (i - 1 + count) % Math.max(1, count));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.executeQuickOpenSelection();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.showQuickOpen.set(false);
    }
  }

  executeQuickOpenSelection() {
    if (this.isCommandMode()) {
      const commands = this.quickOpenFilteredCommands();
      const idx = this.quickOpenSelectedIndex();
      if (commands[idx]) {
        this.showQuickOpen.set(false);
        commands[idx].action();
      }
    } else {
      const docs = this.quickOpenResults();
      const idx = this.quickOpenSelectedIndex();
      if (docs[idx]) {
        this.selectQuickOpenDoc(docs[idx].id);
      }
    }
  }

  selectQuickOpenDoc(docId: string) {
    this.showQuickOpen.set(false);
    this.openDocument(docId);
  }

  // Search & Drag-Drop
  searchQuery = signal<string>('');
  draggedItem = signal<{ type: 'file' | 'folder'; id: string } | null>(null);
  dragOverFolderId = signal<string | null>(null);

  availableFolderOptions = computed<TargetFolderOption[]>(() => {
    const scoped = this.scopedProject();
    if (scoped) {
      const list: TargetFolderOption[] = [
        { id: scoped.id, name: `${scoped.name} (Project Root)`, isShared: Boolean(scoped.isShared) },
      ];

      const addSubs = (parentId: string, prefix: string) => {
        const subs = this.getSubfoldersOf(parentId);
        for (const s of subs) {
          const path = prefix ? `${prefix}/${s.name}` : s.name;
          list.push({ id: s.id, name: path, isShared: Boolean(s.isShared) });
          addSubs(s.id, path);
        }
      };

      addSubs(scoped.id, '');
      return list;
    }

    const list: TargetFolderOption[] = [];
    const addAll = (folderList: FolderDto[], isShared: boolean, prefix = '') => {
      for (const f of folderList) {
        const label = prefix ? `${prefix}/${f.name}` : f.name;
        list.push({ id: f.id, name: label, isShared });
        const subs = this.getSubfoldersOf(f.id);
        if (subs && subs.length > 0) {
          addAll(subs, isShared, label);
        }
      }
    };

    addAll(this.myFolders().filter((f) => !f.parentFolderId), false);
    addAll(this.sharedFolderTree(), true);
    return list;
  });

  moveFolderOptions = computed<FolderDto[]>(() => {
    const scoped = this.scopedProject();
    if (scoped) {
      const list: FolderDto[] = [{ ...scoped, name: `${scoped.name} (Project Root)` }];
      const addSubs = (parentId: string, prefix: string) => {
        const subs = this.getSubfoldersOf(parentId);
        for (const s of subs) {
          const path = prefix ? `${prefix}/${s.name}` : s.name;
          list.push({ ...s, name: path });
          addSubs(s.id, path);
        }
      };
      addSubs(scoped.id, '');
      return list;
    }
    return this.myFolders();
  });

  readonly entrypointMap = signal<Record<string, string>>({});

  private updateExpandedFolders(exp: Set<string>) {
    this.expandedFolderIds.set(exp);
    try {
      sessionStorage.setItem('livesync_expanded_folders', JSON.stringify(Array.from(exp)));
    } catch {}
  }

  ngOnInit() {
    try {
      const saved = localStorage.getItem('livesync_entrypoints');
      if (saved) this.entrypointMap.set(JSON.parse(saved));
    } catch {}

    try {
      const savedExp = sessionStorage.getItem('livesync_expanded_folders');
      if (savedExp) {
        this.expandedFolderIds.set(new Set(JSON.parse(savedExp)));
      }
    } catch {}

    this.loadWorkspace().then(() => {
      const sub = this.route.params.subscribe((params) => {
        const projectName = params['projectName'];
        const folderId = this.route.snapshot.queryParams['id'];
        this.resolveScopedProject(projectName, folderId);
      });
      this.destroyRef.onDestroy(() => {
        sub.unsubscribe();
      });
    });

    this.destroyRef.onDestroy(() => {
      if (this.activeCleanupResizer) {
        this.activeCleanupResizer();
      }
      if (this.activeCleanupTerminalResizer) {
        this.activeCleanupTerminalResizer();
      }
    });
  }

  private resolveScopedProject(projectName?: string, folderId?: string) {
    if (!projectName && !folderId) return;

    let match: FolderDto | undefined;
    if (folderId) {
      match = this.myFolders().find((f) => f.id === folderId) || this.sharedFolderTree().find((f) => f.id === folderId);
    }
    if (!match && projectName && projectName !== 'All-Projects') {
      const decoded = decodeURIComponent(projectName).toLowerCase();
      match = this.myFolders().find((f) => f.name.toLowerCase() === decoded) ||
              this.sharedFolderTree().find((f) => f.name.toLowerCase() === decoded);
    }

    if (match) {
      const prevId = this.scopedProject()?.id;
      this.scopedProject.set(match);
      const exp = new Set(this.expandedFolderIds());
      exp.add(match.id);
      this.updateExpandedFolders(exp);

      // Re-index VFS relative to the scoped project root folder
      this.refreshVFSIndex();

      if (prevId !== match.id) {
        this.alignTabsWithProject(match);
        this.reanchorTerminalToProject(match);
      } else if (this.openTabs().length === 0) {
        this.autoOpenProjectEntry(match);
        this.reanchorTerminalToProject(match);
      }
    } else if (projectName === 'All-Projects') {
      this.scopedProject.set(null);
      this.refreshVFSIndex();
    }
  }

  getAllWorkspaceDocuments(): DocumentDto[] {
    const docMap = new Map<string, DocumentDto>();
    for (const doc of this.myDocuments()) {
      docMap.set(doc.id, doc);
    }
    for (const childList of Object.values(this.folderChildDocs())) {
      for (const doc of childList) {
        if (!docMap.has(doc.id) || !docMap.get(doc.id)?.content) {
          docMap.set(doc.id, doc);
        }
      }
    }
    const collectDocsFromFolders = (fList: FolderDto[]) => {
      for (const f of fList) {
        if (f.documents && f.documents.length > 0) {
          for (const d of f.documents) {
            if (!docMap.has(d.id) || !docMap.get(d.id)?.content) {
              docMap.set(d.id, d);
            }
          }
        }
        if (f.subfolders && f.subfolders.length > 0) {
          collectDocsFromFolders(f.subfolders);
        }
      }
    };
    collectDocsFromFolders(this.myFolders());
    collectDocsFromFolders(this.sharedFolderTree());

    for (const s of this.sharedDocuments()) {
      if (!docMap.has(s.documentId)) {
        docMap.set(s.documentId, {
          id: s.documentId,
          title: s.documentTitle,
          content: '',
          folderId: s.folderPath && s.folderPath.length > 0 ? s.folderPath[s.folderPath.length - 1].id : undefined,
          ownerId: s.userId,
          isShared: true,
          defaultAccessLevel: s.accessLevel,
          createdAt: s.sharedAt,
          updatedAt: s.sharedAt,
        } as DocumentDto);
      }
    }
    return Array.from(docMap.values());
  }

  private refreshVFSIndex(): void {
    const folders = this.myFolders();
    const tree = this.sharedFolderTree();
    const allDocs = this.getAllWorkspaceDocuments();

    this.vfsService.updateVFSState(
      [...folders, ...tree],
      allDocs,
      this.scopedProject()?.id || null,
    );
  }

  private reanchorTerminalToProject(proj: FolderDto): void {
    this.liveTerminalService.setProject(proj.id, proj.name);
    if (this.isTerminalOpen()) {
      this.attachWorkspaceTerminal();
    } else {
      this.syncAllWorkspaceFilesToDisk();
    }
  }

  private getAllFolderIdsInProject(rootFolderId: string): Set<string> {
    const ids = new Set<string>([rootFolderId]);
    const collect = (parentId: string) => {
      const subs = this.getSubfoldersOf(parentId);
      for (const s of subs) {
        if (!ids.has(s.id)) {
          ids.add(s.id);
          collect(s.id);
        }
      }
    };
    collect(rootFolderId);
    return ids;
  }

  private isDocumentInProject(docId: string, projectFolderId: string): boolean {
    const validFolderIds = this.getAllFolderIdsInProject(projectFolderId);

    // Check myDocuments
    const doc = this.myDocuments().find((d) => d.id === docId);
    if (doc && doc.folderId && validFolderIds.has(doc.folderId)) {
      return true;
    }

    // Check folderChildDocs
    for (const fId of validFolderIds) {
      const children = this.folderChildDocs()[fId];
      if (children && children.some((d) => d.id === docId)) {
        return true;
      }
    }

    // Check sharedFolderTree
    const checkSharedTree = (nodes: FolderDto[]): boolean => {
      for (const n of nodes) {
        if (validFolderIds.has(n.id)) {
          if (n.documents?.some((d) => d.id === docId)) return true;
        }
        if (n.subfolders && checkSharedTree(n.subfolders)) return true;
      }
      return false;
    };
    if (checkSharedTree(this.sharedFolderTree())) {
      return true;
    }

    return false;
  }

  private async alignTabsWithProject(project: FolderDto) {
    const projectTabs = this.openTabs().filter((tab) => this.isDocumentInProject(tab.id, project.id));

    if (projectTabs.length > 0) {
      this.openTabs.set(projectTabs);
      if (!projectTabs.some((t) => t.id === this.activeTabId())) {
        this.activeTabId.set(projectTabs[0].id);
      }
    } else {
      this.openTabs.set([]);
      this.activeTabId.set('');
      await this.autoOpenProjectEntry(project);
    }
  }

  private async autoOpenProjectEntry(folder: FolderDto) {
    try {
      let docs = this.folderChildDocs()[folder.id];
      if (!docs || docs.length === 0) {
        const details = await this.folderService.getFolder(folder.id);
        if (details.documents) {
          docs = details.documents;
          this.folderChildDocs.update((prev) => ({ ...prev, [folder.id]: details.documents }));
        }
        if (details.subfolders) {
          this.folderChildSubfolders.update((prev) => ({ ...prev, [folder.id]: details.subfolders }));
        }
      }

      if (docs && docs.length > 0) {
        const entry =
          docs.find((d) =>
            ['main.py', 'index.js', 'app.py', 'server.js', 'main.ts', 'index.ts', 'app.ts'].includes(
              d.title.toLowerCase()
            )
          ) || docs[0];
        this.openDocument(entry.id);
        return;
      }

      // If root has no direct files, look into immediate subfolders
      const subs = this.getSubfoldersOf(folder.id);
      if (subs && subs.length > 0) {
        for (const sub of subs) {
          let subDocs = this.folderChildDocs()[sub.id];
          if (!subDocs || subDocs.length === 0) {
            try {
              const subDetails = await this.folderService.getFolder(sub.id);
              if (subDetails.documents && subDetails.documents.length > 0) {
                subDocs = subDetails.documents;
                this.folderChildDocs.update((prev) => ({ ...prev, [sub.id]: subDetails.documents }));
              }
            } catch {}
          }
          if (subDocs && subDocs.length > 0) {
            const entry =
              subDocs.find((d) =>
                ['main.py', 'index.js', 'app.py', 'server.js', 'main.ts', 'index.ts', 'app.ts'].includes(
                  d.title.toLowerCase()
                )
              ) || subDocs[0];
            this.openDocument(entry.id);
            break;
          }
        }
      }
    } catch (err) {
      console.error('Error auto-opening project entry:', err);
    }
  }

  onScopeChange(val: string) {
    if (val === 'all') {
      this.scopedProject.set(null);
      this.router.navigate(['/workspace', 'All-Projects']);
    } else {
      const match =
        this.myFolders().find((f) => f.id === val) ||
        this.sharedFolderTree().find((f) => f.id === val);
      if (match) {
        this.scopedProject.set(match);
        const exp = new Set(this.expandedFolderIds());
        exp.add(match.id);
        this.expandedFolderIds.set(exp);
        this.alignTabsWithProject(match);
        this.router.navigate(['/workspace', encodeURIComponent(match.name)]);
      }
    }
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  async loadWorkspace(silent: boolean = false): Promise<void> {
    const seq = ++this.loadWorkspaceSeq;
    if (!silent) {
      this.isLoading.set(true);
    }
    try {
      const [folders, docs, sharedDocs, sharedFolds] = await Promise.all([
        this.folderService.getMyFolders(),
        this.documentService.getMyDocuments(),
        this.documentService.getSharedDocuments(),
        this.folderService.getSharedFolderDetails(),
      ]);

      // Guard against out-of-order responses from rapid consecutive calls
      if (seq !== this.loadWorkspaceSeq) {
        return;
      }

      this.myFolders.set(folders);
      this.myDocuments.set(docs);
      this.sharedDocuments.set(sharedDocs);
      this.sharedFolders.set([]);

      const tree = this.buildSharedAccessTree(sharedFolds, sharedDocs);
      this.sharedFolderTree.set(tree);
      await this.refreshExpandedFolderContents();

      if (seq !== this.loadWorkspaceSeq) {
        return;
      }

      const allDocs = this.getAllWorkspaceDocuments();

      // Update Virtual Filesystem (VFS) Path Index
      this.vfsService.updateVFSState(
        [...folders, ...tree],
        allDocs,
        this.scopedProject()?.id || null,
      );

      // Reconcile open tabs with latest titles
      this.syncOpenTabsWithVFS();
    } catch (error) {
      console.error('Error loading workspace:', error);
    } finally {
      if (!silent && seq === this.loadWorkspaceSeq) {
        this.isLoading.set(false);
      }
    }
  }

  private syncOpenTabsWithVFS(): void {
    this.openTabs.update((tabs) =>
      tabs.map((t) => {
        const doc =
          this.myDocuments().find((d) => d.id === t.id) ||
          this.sharedDocuments().find((d) => d.documentId === t.id);
        const title = doc
          ? 'title' in doc
            ? doc.title
            : (doc as SharedDocumentDto).documentTitle
          : t.title;
        return {
          ...t,
          title: title || t.title,
        };
      })
    );
  }

  private async refreshExpandedFolderContents() {
    const allKnownFolderIds = new Set<string>();
    const collectFolderIds = (folders: FolderDto[]) => {
      for (const f of folders) {
        allKnownFolderIds.add(f.id);
        if (f.subfolders && f.subfolders.length > 0) {
          collectFolderIds(f.subfolders);
        }
      }
    };
    collectFolderIds(this.myFolders());
    collectFolderIds(this.sharedFolderTree());

    // Prune any stale or deleted folder IDs from memory and sessionStorage
    const validExpanded = Array.from(this.expandedFolderIds()).filter((id) => allKnownFolderIds.has(id));
    if (validExpanded.length !== this.expandedFolderIds().size) {
      this.updateExpandedFolders(new Set(validExpanded));
    }

    for (const id of validExpanded) {
      try {
        const details = await this.folderService.getFolder(id);
        this.folderChildDocs.update((prev) => ({ ...prev, [id]: details.documents || [] }));
        this.folderChildSubfolders.update((prev) => ({ ...prev, [id]: details.subfolders || [] }));
      } catch (ignored) {}
    }
  }

  collapseAllFolders() {
    this.updateExpandedFolders(new Set());
  }

  expandAllFolders() {
    const all = new Set<string>();
    const addF = (folders: FolderDto[]) => {
      for (const f of folders) {
        all.add(f.id);
        if (f.subfolders) addF(f.subfolders);
      }
    };
    addF(this.getExplorerRootFolders());
    this.updateExpandedFolders(all);
  }

  getExplorerRootFolders(): FolderDto[] {
    const scoped = this.scopedProject();
    if (scoped) {
      const own = this.myFolders().find((f) => f.id === scoped.id);
      if (own) return [own];
      const shared = this.sharedFolderTree().find((f) => f.id === scoped.id);
      if (shared) return [shared];
      return [scoped];
    }
    return this.mergeFolderLists(this.getFilteredFolders(), this.sharedFolderTree());
  }

  getExplorerRootDocs(): DocumentDto[] {
    const sharedRootDocs = this.getFilteredSharedDocs()
      .filter((doc) => !doc.folderPath || doc.folderPath.length === 0)
      .map((doc) => this.sharedDocumentToDocumentDto(doc));
    return [...this.getFilteredMyDocs(), ...sharedRootDocs];
  }

  getExplorerRootCount(): number {
    return this.getExplorerRootFolders().length + (this.scopedProject() ? 0 : this.getExplorerRootDocs().length);
  }

  isSharedExplorerDocument(doc: DocumentDto): boolean {
    return !this.isOwnDocument(doc);
  }

  isManageableExplorerFolder(folder: FolderDto): boolean {
    const userId = this.authService.user()?.id;
    return Boolean(userId && !folder.isStructural && folder.ownerId === userId);
  }

  private isOwnDocument(doc: DocumentDto): boolean {
    const userId = this.authService.user()?.id;
    return Boolean(userId && doc.ownerId === userId);
  }

  private buildSharedAccessTree(sharedFolders: FolderDto[], sharedDocs: SharedDocumentDto[]): FolderDto[] {
    const roots: FolderDto[] = [];
    for (const folder of sharedFolders) {
      const path = folder.folderPath && folder.folderPath.length > 0 ? folder.folderPath : [{ id: folder.id, name: folder.name }];
      this.ensureFolderPath(roots, path, folder);
    }
    for (const doc of sharedDocs) {
      if (!doc.folderPath || doc.folderPath.length === 0) continue;
      const leaf = this.ensureFolderPath(roots, doc.folderPath);
      this.addDocumentToFolder(leaf, this.sharedDocumentToDocumentDto(doc));
    }
    return roots;
  }

  private mergeFolderLists(primary: FolderDto[], secondary: FolderDto[]): FolderDto[] {
    const merged = primary.map((folder) => this.cloneFolder(folder));
    for (const folder of secondary) {
      this.upsertFolder(merged, this.cloneFolder(folder));
    }
    return merged;
  }

  private ensureFolderPath(roots: FolderDto[], path: FolderPathNode[], terminalFolder?: FolderDto): FolderDto {
    let siblings = roots;
    let current: FolderDto | undefined;
    let parentFolderId: string | undefined;

    path.forEach((node, index) => {
      const isLeaf = index === path.length - 1;
      current = siblings.find((folder) => folder.id === node.id);
      if (!current) {
        current = this.createStructuralFolder(node, parentFolderId);
        siblings.push(current);
      }
      if (isLeaf && terminalFolder) {
        this.mergeFolderInto(current, terminalFolder);
      }
      parentFolderId = node.id;
      siblings = current.subfolders;
    });

    return current!;
  }

  private upsertFolder(siblings: FolderDto[], incoming: FolderDto): FolderDto {
    const existing = siblings.find((folder) => folder.id === incoming.id);
    if (!existing) {
      siblings.push(incoming);
      return incoming;
    }
    this.mergeFolderInto(existing, incoming);
    return existing;
  }

  private mergeFolderInto(target: FolderDto, incoming: FolderDto) {
    if (!target.shareCode && incoming.shareCode) target.shareCode = incoming.shareCode;
    if (incoming.ownerId) target.ownerId = incoming.ownerId;
    if (!target.permission && incoming.permission) target.permission = incoming.permission;
    if (!target.documentsCount && incoming.documentsCount) target.documentsCount = incoming.documentsCount;
    if (!target.subfoldersCount && incoming.subfoldersCount) target.subfoldersCount = incoming.subfoldersCount;
    if (incoming.isShared !== undefined) target.isShared = incoming.isShared;
    target.isStructural = Boolean(target.isStructural && incoming.isStructural);

    for (const sub of incoming.subfolders || []) {
      this.upsertFolder(target.subfolders, this.cloneFolder(sub));
    }
    for (const doc of incoming.documents || []) {
      this.addDocumentToFolder(target, doc);
    }
  }

  private createStructuralFolder(node: FolderPathNode, parentFolderId?: string): FolderDto {
    return {
      id: node.id,
      name: node.name,
      ownerId: '',
      shareCode: '',
      defaultAccessLevel: 'View',
      parentFolderId: parentFolderId || undefined,
      subfolders: [],
      documents: [],
      documentsCount: 0,
      subfoldersCount: 0,
      isShared: true,
      isStructural: true,
      createdAt: '',
      updatedAt: '',
    };
  }

  private cloneFolder(folder: FolderDto): FolderDto {
    return {
      ...folder,
      subfolders: (folder.subfolders || []).map((child) => this.cloneFolder(child)),
      documents: [...(folder.documents || [])],
      folderPath: folder.folderPath ? [...folder.folderPath] : undefined,
    };
  }

  private addDocumentToFolder(target: FolderDto, doc: DocumentDto) {
    if (!target.documents) target.documents = [];
    const exists = target.documents.some((item) => item.id === doc.id);
    if (!exists) {
      target.documents.push(doc);
      target.documentsCount = target.documents.length;
    }
  }

  private sharedDocumentToDocumentDto(sharedDoc: SharedDocumentDto): DocumentDto {
    return {
      id: sharedDoc.documentId || sharedDoc.id,
      title: sharedDoc.documentTitle || 'Untitled',
      content: '',
      ownerId: sharedDoc.userId,
      folderId: undefined,
      folderPath: sharedDoc.folderPath,
      defaultAccessLevel: sharedDoc.accessLevel || 'View',
      permission: sharedDoc.accessLevel || 'View',
      sharedWith: [],
      createdAt: sharedDoc.sharedAt || '',
      updatedAt: sharedDoc.sharedAt || '',
    };
  }

  getFilteredFolders(): FolderDto[] {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.myFolders();
    return this.myFolders().filter((f) => f.name.toLowerCase().includes(q));
  }

  getFilteredMyDocs(): DocumentDto[] {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.myDocuments().filter((d) => !d.folderId);
    return this.myDocuments().filter((d) => !d.folderId && d.title.toLowerCase().includes(q));
  }

  getFilteredSharedDocs(): SharedDocumentDto[] {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.sharedDocuments();
    return this.sharedDocuments().filter((d) => (d.documentTitle || '').toLowerCase().includes(q));
  }

  isFolderExpanded(folderId: string): boolean {
    return this.expandedFolderIds().has(folderId);
  }

  async toggleFolderExpand(folder: FolderDto, event?: Event) {
    if (event) event.stopPropagation();
    const exp = new Set(this.expandedFolderIds());
    if (exp.has(folder.id)) {
      exp.delete(folder.id);
    } else {
      exp.add(folder.id);
      if (!this.folderChildDocs()[folder.id]) {
        try {
          const details = await this.folderService.getFolder(folder.id);
          this.folderChildDocs.update((prev) => ({ ...prev, [folder.id]: details.documents || [] }));
          this.folderChildSubfolders.update((prev) => ({ ...prev, [folder.id]: details.subfolders || [] }));
        } catch (err) {
          console.error('Error fetching folder children:', err);
        }
      }
    }
    this.updateExpandedFolders(exp);
  }

  getSubfoldersOf(folderId: string): FolderDto[] {
    const cached = this.folderChildSubfolders()[folderId];
    if (cached && cached.length > 0) return cached;
    const findInTree = (nodes: FolderDto[]): FolderDto[] | null => {
      for (const n of nodes) {
        if (n.id === folderId) return n.subfolders || [];
        if (n.subfolders) {
          const res = findInTree(n.subfolders);
          if (res) return res;
        }
      }
      return null;
    };
    const ownNested = findInTree(this.myFolders());
    if (ownNested && ownNested.length > 0) return ownNested;
    const sharedNested = findInTree(this.sharedFolderTree());
    if (sharedNested && sharedNested.length > 0) return sharedNested;
    return this.myFolders().filter((f) => f.parentFolderId === folderId);
  }

  getDocsOf(folderId: string): DocumentDto[] {
    const cached = this.folderChildDocs()[folderId];
    if (cached) return cached;
    const findDocs = (nodes: FolderDto[]): DocumentDto[] | null => {
      for (const n of nodes) {
        if (n.id === folderId) return n.documents || [];
        if (n.subfolders) {
          const res = findDocs(n.subfolders);
          if (res) return res;
        }
      }
      return null;
    };
    const ownDocs = findDocs(this.myFolders());
    if (ownDocs && ownDocs.length > 0) return ownDocs;
    const sharedNested = findDocs(this.sharedFolderTree());
    if (sharedNested && sharedNested.length > 0) return sharedNested;
    return this.myDocuments().filter((d) => d.folderId === folderId);
  }

  openCreateInFolder(folderId: string | null, type: 'file' | 'folder', event?: Event) {
    if (event) event.stopPropagation();
    const targetFolderId = folderId || this.scopedProject()?.id || null;

    // Auto-expand the target folder so the inline input is immediately visible
    if (targetFolderId) {
      const exp = new Set(this.expandedFolderIds());
      exp.add(targetFolderId);
      this.expandedFolderIds.set(exp);
    }

    this.inlineCreationName.set('');
    this.inlineCreation.set({
      parentFolderId: targetFolderId,
      type,
      depth: targetFolderId ? 1 : 0,
    });
  }

  cancelInlineCreation(): void {
    this.inlineCreation.set(null);
    this.inlineCreationName.set('');
  }

  async commitInlineCreation(): Promise<void> {
    const rawInput = this.inlineCreationName().trim();
    const target = this.inlineCreation();
    if (!rawInput || !target) {
      this.cancelInlineCreation();
      return;
    }

    this.inlineCreation.set(null);
    this.inlineCreationName.set('');

    try {
      // Normalize slashes (support both / and \)
      const normalized = rawInput.replace(/\\/g, '/');
      const parts = normalized.split('/').filter((p) => p.trim().length > 0);
      if (parts.length === 0) return;

      let currentParentId = target.parentFolderId;
      const exp = new Set(this.expandedFolderIds());

      if (target.type === 'folder') {
        // All parts are folders to create/traverse
        for (const segment of parts) {
          const existing = this.findSubfolderByName(segment, currentParentId);
          if (existing) {
            currentParentId = existing.id;
          } else {
            const created = await this.folderService.createFolder(segment, currentParentId || undefined);
            currentParentId = created.id;
          }
          if (currentParentId) exp.add(currentParentId);
        }
      } else {
        // Last part is the file; preceding parts are folders
        const folderParts = parts.slice(0, -1);
        const fileName = parts[parts.length - 1];

        for (const segment of folderParts) {
          const existing = this.findSubfolderByName(segment, currentParentId);
          if (existing) {
            currentParentId = existing.id;
          } else {
            const created = await this.folderService.createFolder(segment, currentParentId || undefined);
            currentParentId = created.id;
          }
          if (currentParentId) exp.add(currentParentId);
        }

        // Create the file in the leaf folder
        const createdDoc = await this.documentService.createDocument({
          title: fileName,
          content: '',
          folderId: currentParentId || (this.scopedProject()?.id || undefined),
        });

        this.expandedFolderIds.set(exp);
        await this.loadWorkspace();
        this.notifyWorkspaceChange('create', 'file', createdDoc.id, fileName, currentParentId);
        this.openDocument(createdDoc.id);
        return;
      }

      this.expandedFolderIds.set(exp);
      await this.loadWorkspace();
      this.notifyWorkspaceChange('create', 'folder', currentParentId || undefined, rawInput, target.parentFolderId);
    } catch (err) {
      console.error('Error in commitInlineCreation:', err);
    }
  }

  onInlineBlur(): void {
    const rawInput = this.inlineCreationName().trim();
    if (!rawInput) {
      this.cancelInlineCreation();
    } else {
      void this.commitInlineCreation();
    }
  }

  closeAllModals(): void {
    this.showCreateFolderModal.set(false);
    this.showCreateFilePrompt.set(false);
    this.showMoveModal.set(false);
    this.showShareFolderModal.set(false);
    this.showRenameModal.set(false);
    this.showDeleteConfirm.set(false);
    this.contextMenu.set(null);
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeydown(event: KeyboardEvent): void {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const isCmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

    // 1. ESCAPE -> Dismiss active inline creation, context menus, and modal dialogs
    if (event.key === 'Escape') {
      if (this.inlineCreation()) {
        event.preventDefault();
        this.cancelInlineCreation();
        return;
      }
      if (this.contextMenu()) {
        event.preventDefault();
        this.contextMenu.set(null);
        return;
      }
      this.closeAllModals();
      return;
    }

    // 2. Ctrl+S / Cmd+S -> Trigger manual instant save on active document
    if (isCmdOrCtrl && (event.key === 's' || event.key === 'S')) {
      event.preventDefault();
      const activeInst = this.activeEditorInstance();
      if (activeInst) {
        void activeInst.triggerManualSave();
      }
      return;
    }

    // 3. Ctrl+B / Cmd+B -> Toggle VS Code-style sidebar dock
    if (isCmdOrCtrl && (event.key === 'b' || event.key === 'B')) {
      event.preventDefault();
      this.isSidebarOpen.update((open) => !open);
      return;
    }

    // 4. Ctrl+` / Cmd+` -> Toggle integrated workspace terminal
    if (isCmdOrCtrl && event.key === '`') {
      event.preventDefault();
      this.toggleTerminalInActiveEditor();
      return;
    }

    // 5. Ctrl+Shift+P / Cmd+Shift+P -> Open VS Code Command Palette
    if (isCmdOrCtrl && event.shiftKey && (event.key === 'p' || event.key === 'P')) {
      event.preventDefault();
      this.openCommandPalette();
      return;
    }

    // 6. Ctrl+P / Cmd+P -> Open Quick Open Fuzzy File Finder
    if (isCmdOrCtrl && !event.shiftKey && (event.key === 'p' || event.key === 'P')) {
      event.preventDefault();
      this.openQuickOpen();
      return;
    }

    // 7. Ctrl+Alt+A -> Toggle AI Pair Assistant Dock
    if (isCmdOrCtrl && event.altKey && (event.key === 'a' || event.key === 'A')) {
      event.preventDefault();
      this.toggleAiDock();
      return;
    }

    // 8. Ctrl+Shift+F / Cmd+Shift+F -> Focus Workspace Global Search
    if (isCmdOrCtrl && event.shiftKey && (event.key === 'f' || event.key === 'F')) {
      event.preventDefault();
      this.openWorkspaceSearch();
      return;
    }
  }

  private findSubfolderByName(name: string, parentFolderId: string | null): FolderDto | undefined {
    if (!parentFolderId) {
      return this.myFolders().find((f) => f.name.toLowerCase() === name.toLowerCase() && !f.parentFolderId);
    }
    const subfolders = this.folderChildSubfolders()[parentFolderId] || this.getSubfoldersOf(parentFolderId);
    return subfolders.find((f) => f.name.toLowerCase() === name.toLowerCase());
  }

  async handleCreateFileSubmit(payload: CreateFileSubmitPayload) {
    const title = payload.title.trim();
    const folderId = payload.folderId;
    if (!title || !folderId) return;
    this.showCreateFilePrompt.set(false);

    try {
      const doc = await this.documentService.createDocument({
        title,
        content: '',
        folderId,
      });

      await this.loadWorkspace();
      const exp = new Set(this.expandedFolderIds());
      exp.add(folderId);
      this.expandedFolderIds.set(exp);
      this.notifyWorkspaceChange('create', 'file', doc.id, title, folderId);
      this.openDocument(doc.id);
    } catch (err) {
      console.error('Error creating file in folder:', err);
      alert('Failed to create file');
    }
  }

  // Context Menu State
  contextMenu = signal<{ visible: boolean; x: number; y: number; type: 'file' | 'folder'; item: any } | null>(null);

  onContextMenu(event: MouseEvent, type: 'file' | 'folder', item: any) {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.set({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      type,
      item,
    });
  }

  closeContextMenu() {
    this.contextMenu.set(null);
  }

  isProjectEntrypoint(doc: DocumentDto): boolean {
    const folderId = doc.folderId || this.scopedProject()?.id || 'root';
    const designated = this.entrypointMap()[folderId];
    if (designated) {
      return designated === doc.title || designated === doc.id;
    }
    const title = doc.title.toLowerCase();
    return title === 'main.py' || title === 'app.py' || title === 'index.js' || title === 'server.js';
  }

  setProjectEntrypoint(doc: DocumentDto) {
    const folderId = doc.folderId || this.scopedProject()?.id || 'root';
    const current = { ...this.entrypointMap() };
    current[folderId] = doc.title;
    this.entrypointMap.set(current);
    try {
      localStorage.setItem('livesync_entrypoints', JSON.stringify(current));
    } catch {}
  }

  onContextMenuAction(action: string) {
    const ctx = this.contextMenu();
    if (!ctx) return;
    this.closeContextMenu();

    if (action === 'setEntrypoint') {
      this.setProjectEntrypoint(ctx.item);
    } else if (action === 'openTerminal') {
      if (ctx.type === 'folder') {
        const relPath = this.getFolderRelativePath(ctx.item);
        this.openInIntegratedTerminal(relPath, ctx.item.name);
      } else {
        const relPath = this.getFileRelativePath(ctx.item);
        const containingDir = relPath.includes('/') ? relPath.substring(0, relPath.lastIndexOf('/')) : '';
        const folderName = containingDir ? containingDir.split('/').pop() : this.scopedProject()?.name;
        this.openInIntegratedTerminal(containingDir, folderName);
      }
    } else if (action === 'findInFolder') {
      const relPath = ctx.type === 'folder' ? this.getFolderRelativePath(ctx.item) : this.getFileRelativePath(ctx.item);
      const filter = relPath ? `${relPath}/**` : '';
      this.searchService.includePattern.set(filter);
      this.searchService.showFilters.set(true);
      this.toggleSidebarView('search');
    } else if (action === 'copyRelativePath') {
      const relPath = ctx.type === 'folder' ? this.getFolderRelativePath(ctx.item) : this.getFileRelativePath(ctx.item);
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(relPath || '/').catch(() => {});
      }
    } else if (action === 'newFile') {
      this.openCreateInFolder(ctx.item.id, 'file');
    } else if (action === 'newFolder') {
      this.openCreateInFolder(ctx.item.id, 'folder');
    } else if (action === 'rename') {
      this.openRenameModal({
        id: ctx.item.id,
        name: ctx.type === 'folder' ? ctx.item.name : ctx.item.title,
        type: ctx.type,
      });
    } else if (action === 'duplicate') {
      this.duplicateFile(ctx.item);
    } else if (action === 'share') {
      if (ctx.type === 'folder') {
        this.openShareFolderModal(ctx.item);
      } else {
        this.openShareModal(ctx.item);
      }
    } else if (action === 'move') {
      this.openMoveModal(ctx.item);
    } else if (action === 'delete') {
      if (ctx.type === 'folder') {
        this.deleteFolder(ctx.item.id);
      } else {
        this.confirmDelete(ctx.item.id);
      }
    }
  }

  getFolderRelativePath(folder: FolderDto): string {
    if (!folder) return '';
    const scopedId = this.scopedProject()?.id;
    if (folder.id === scopedId) return '';

    const segments: string[] = [folder.name];
    let currParentId = folder.parentFolderId;

    const findFolderById = (id: string, list: FolderDto[]): FolderDto | undefined => {
      for (const f of list) {
        if (f.id === id) return f;
        if (f.subfolders && f.subfolders.length > 0) {
          const res = findFolderById(id, f.subfolders);
          if (res) return res;
        }
      }
      return undefined;
    };

    while (currParentId && currParentId !== scopedId) {
      const parent =
        findFolderById(currParentId, this.myFolders()) ||
        findFolderById(currParentId, this.sharedFolderTree());
      if (!parent) break;
      segments.unshift(parent.name);
      currParentId = parent.parentFolderId;
    }

    return segments.join('/');
  }

  getFileRelativePath(doc: DocumentDto): string {
    if (!doc) return '';
    const vfsPath = this.vfsService.getPathByDocumentId(doc.id);
    if (vfsPath) return vfsPath;
    if (doc.folderId) {
      const findFolderById = (id: string, list: FolderDto[]): FolderDto | undefined => {
        for (const f of list) {
          if (f.id === id) return f;
          if (f.subfolders && f.subfolders.length > 0) {
            const res = findFolderById(id, f.subfolders);
            if (res) return res;
          }
        }
        return undefined;
      };
      const folder =
        findFolderById(doc.folderId, this.myFolders()) ||
        findFolderById(doc.folderId, this.sharedFolderTree());
      if (folder) {
        const folderRel = this.getFolderRelativePath(folder);
        return folderRel ? `${folderRel}/${doc.title}` : doc.title;
      }
    }
    return doc.title;
  }

  openInIntegratedTerminal(relPath: string, name?: string): void {
    if (!this.isTerminalOpen()) {
      this.isTerminalOpen.set(true);
      setTimeout(() => {
        this.attachWorkspaceTerminal();
        this.liveTerminalService.createTabInDirectory(relPath, name);
      }, 50);
    } else {
      this.attachWorkspaceTerminal();
      this.liveTerminalService.createTabInDirectory(relPath, name);
    }
  }

  openRenameModal(item: { id: string; name: string; type: RenameItemType }, event?: Event) {
    if (event) event.stopPropagation();
    this.renameTarget.set(item);
    this.showRenameModal.set(true);
  }

  async handleRenameSubmit(newName: string) {
    const target = this.renameTarget();
    if (!target || !newName.trim()) return;
    this.showRenameModal.set(false);

    try {
      if (target.type === 'folder' || target.type === 'project') {
        await this.folderService.updateFolder(target.id, newName.trim());
        if (this.scopedProject()?.id === target.id) {
          const updated = { ...this.scopedProject()!, name: newName.trim() };
          this.scopedProject.set(updated);
          this.router.navigate(['/workspace', encodeURIComponent(newName.trim())]);
        }
        await this.loadWorkspace();
        this.notifyWorkspaceChange('rename', 'folder', target.id, newName.trim());
      } else if (target.type === 'file') {
        await this.documentService.updateDocument(target.id, { title: newName.trim() });
        this.openTabs.update((tabs) =>
          tabs.map((t) => (t.id === target.id ? { ...t, title: newName.trim() } : t))
        );
        await this.loadWorkspace();
        this.notifyWorkspaceChange('rename', 'file', target.id, newName.trim());
      }
    } catch (err) {
      console.error('Error renaming item:', err);
      alert('Failed to rename ' + target.type);
    }
  }

  async duplicateFile(doc: DocumentDto, event?: Event) {
    if (event) event.stopPropagation();
    try {
      let content = doc.content;
      if (!content) {
        try {
          const fullDoc = await this.documentService.getDocument(doc.id);
          content = fullDoc.content || '';
        } catch (ignored) {}
      }

      const dotIdx = doc.title.lastIndexOf('.');
      let copyTitle = '';
      if (dotIdx > 0) {
        copyTitle = `${doc.title.substring(0, dotIdx)}_copy${doc.title.substring(dotIdx)}`;
      } else {
        copyTitle = `${doc.title}_copy`;
      }

      const created = await this.documentService.createDocument({
        title: copyTitle,
        content: content || '',
        folderId: doc.folderId,
      });

      await this.loadWorkspace();
      if (doc.folderId) {
        const exp = new Set(this.expandedFolderIds());
        exp.add(doc.folderId);
        this.expandedFolderIds.set(exp);
      }
      this.notifyWorkspaceChange('create', 'file', created.id, copyTitle, doc.folderId);
      this.openDocument(created.id);
    } catch (err) {
      console.error('Error duplicating file:', err);
      alert('Failed to duplicate file');
    }
  }

  // Drag and Drop
  onDragStart(event: DragEvent, type: 'file' | 'folder', id: string) {
    this.draggedItem.set({ type, id });
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', JSON.stringify({ type, id }));
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragEnd() {
    this.draggedItem.set(null);
    this.dragOverFolderId.set(null);
  }

  onDragOver(event: DragEvent, folderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOverFolderId.set(folderId || 'root');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  onDragEnter(event: DragEvent, folderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOverFolderId.set(folderId || 'root');
  }

  onDragLeave(event: DragEvent, folderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    if (this.dragOverFolderId() === (folderId || 'root')) {
      this.dragOverFolderId.set(null);
    }
  }

  async onDrop(event: DragEvent, targetFolderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOverFolderId.set(null);

    const item = this.draggedItem();
    if (!item) return;

    if (item.type === 'file') {
      try {
        await this.folderService.moveDocument(item.id, targetFolderId);
        await this.loadWorkspace();
        this.notifyWorkspaceChange('move', 'file', item.id, undefined, targetFolderId);
      } catch (err) {
        console.error('Error moving document:', err);
      }
    } else if (item.type === 'folder') {
      if (item.id === targetFolderId) return;
      try {
        await this.folderService.moveFolder(item.id, targetFolderId);
        await this.loadWorkspace();
        this.notifyWorkspaceChange('move', 'folder', item.id, undefined, targetFolderId);
      } catch (err) {
        console.error('Error moving folder:', err);
      }
    }
    this.draggedItem.set(null);
  }

  isExportingZip = signal<boolean>(false);
  isDraggingExternalFolder = signal<boolean>(false);

  async exportProjectAsZip(): Promise<void> {
    this.isExportingZip.set(true);
    try {
      const zip = new JSZip();
      const docs = this.scopedProject()
        ? this.myDocuments().filter((d) => this.vfsService.getPathByDocumentId(d.id))
        : this.myDocuments();

      for (const doc of docs) {
        let content = doc.content;
        if (content === undefined || content === null) {
          try {
            const fullDoc = await this.documentService.getDocument(doc.id);
            content = fullDoc.content || '';
          } catch {
            content = '';
          }
        }
        const relPath = this.vfsService.getPathByDocumentId(doc.id) || doc.title;
        zip.file(relPath, content);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const projectName = this.scopedProject()?.name || 'LiveSync-Workspace';
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${projectName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Failed to export ZIP:', err);
      alert('Failed to export workspace ZIP');
    } finally {
      this.isExportingZip.set(false);
    }
  }

  onExternalDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types?.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
      this.isDraggingExternalFolder.set(true);
    }
  }

  onExternalDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingExternalFolder.set(false);
  }

  async onExternalDrop(event: DragEvent, targetFolderId: string | null = null): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingExternalFolder.set(false);

    const items = event.dataTransfer?.items;
    if (!items || items.length === 0) return;

    const baseFolderId = targetFolderId || this.scopedProject()?.id || null;

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
        if (entry) {
          await this.traverseAndImportEntry(entry, baseFolderId);
        } else if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            const content = await file.text();
            await this.documentService.createDocument({
              title: file.name,
              content,
              folderId: baseFolderId || undefined,
            });
          }
        }
      }
      await this.loadWorkspace();
    } catch (err) {
      console.error('Error importing dropped files/folders:', err);
    }
  }

  private async traverseAndImportEntry(entry: any, parentFolderId: string | null): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
      const content = await file.text();
      await this.documentService.createDocument({
        title: entry.name,
        content,
        folderId: parentFolderId || undefined,
      });
    } else if (entry.isDirectory) {
      const createdFolder = await this.folderService.createFolder(entry.name, parentFolderId || undefined);
      const reader = entry.createReader();
      const entries = await new Promise<any[]>((resolve, reject) => reader.readEntries(resolve, reject));
      for (const child of entries) {
        await this.traverseAndImportEntry(child, createdFolder.id);
      }
    }
  }

  // Tabs Management
  openDocument(docId: string) {
    const title = this.findDocumentTitle(docId);
    const existing = this.openTabs().find((t) => t.id === docId);
    if (!existing) {
      this.openTabs.update((tabs) => [...tabs, { id: docId, title }]);
    }
    this.activeTabId.set(docId);
  }

  switchTab(docId: string) {
    this.activeTabId.set(docId);
  }

  closeTab(docId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    const current = this.openTabs();
    const nextTabs = current.filter((t) => t.id !== docId);
    this.openTabs.set(nextTabs);
    if (this.activeTabId() === docId) {
      if (nextTabs.length > 0) {
        this.activeTabId.set(nextTabs[nextTabs.length - 1].id);
      } else {
        this.activeTabId.set('');
      }
    }
  }

  getActiveTabTitle(): string {
    const active = this.openTabs().find((t) => t.id === this.activeTabId());
    return active ? active.title : '';
  }

  onTabDragStart(index: number, event: DragEvent): void {
    this.draggedTabIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  onTabDragOver(index: number, event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverTabIndex.set(index);
  }

  onTabDrop(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    const fromIndex = this.draggedTabIndex();
    if (fromIndex === null || fromIndex === targetIndex) {
      this.draggedTabIndex.set(null);
      this.dragOverTabIndex.set(null);
      return;
    }

    this.openTabs.update((tabs) => {
      const copy = [...tabs];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });

    this.draggedTabIndex.set(null);
    this.dragOverTabIndex.set(null);
  }

  onTabDragEnd(): void {
    this.draggedTabIndex.set(null);
    this.dragOverTabIndex.set(null);
  }

  openCreateFolderModal() {
    this.newFolderName.set('');
    this.showCreateFolderModal.set(true);
  }

  async createFolder() {
    const name = this.newFolderName().trim();
    if (!name) return;

    try {
      const parentId = this.targetParentFolderId() || this.scopedProject()?.id || undefined;
      const created = await this.folderService.createFolder(name, parentId);
      this.showCreateFolderModal.set(false);
      this.newFolderName.set('');
      await this.loadWorkspace();
      if (parentId) {
        const exp = new Set(this.expandedFolderIds());
        exp.add(parentId);
        this.expandedFolderIds.set(exp);
      }
      this.notifyWorkspaceChange('create', 'folder', created?.id, name, parentId);
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Failed to create folder');
    }
  }

  async deleteFolder(folderId: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!confirm('Are you sure you want to delete this folder and all its contents?')) return;

    try {
      await this.folderService.deleteFolder(folderId);
      if (this.scopedProject()?.id === folderId) {
        this.scopedProject.set(null);
        this.router.navigate(['/workspace', 'All-Projects']);
      }
      await this.loadWorkspace();
      this.notifyWorkspaceChange('delete', 'folder', folderId);
    } catch (error) {
      console.error('Error deleting folder:', error);
      alert('Failed to delete folder');
    }
  }

  openMoveModal(doc: DocumentDto, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedDocForMove.set(doc);
    this.showMoveModal.set(true);
  }

  async moveDocumentToFolder(targetFolderId: string | null) {
    const doc = this.selectedDocForMove();
    if (!doc) return;

    try {
      await this.folderService.moveDocument(doc.id, targetFolderId);
      this.showMoveModal.set(false);
      this.selectedDocForMove.set(null);
      await this.loadWorkspace();
      this.notifyWorkspaceChange('move', 'file', doc.id, undefined, targetFolderId);
    } catch (error) {
      console.error('Error moving document:', error);
      alert('Failed to move document');
    }
  }

  async openShareFolderModal(folder: FolderDto, event?: Event) {
    if (event) event.stopPropagation();
    let folderForShare = folder;
    if (!folderForShare.shareCode) {
      try {
        folderForShare = await this.folderService.generateShareCode(folder.id);
        this.updateFolderShareCode(folder.id, folderForShare.shareCode || '');
      } catch (error) {
        console.error('Error generating folder share code:', error);
        alert('Failed to generate folder share code');
        return;
      }
    }

    this.selectedFolderForShare.set(folderForShare);
    this.folderShareCode.set(folderForShare.shareCode || '');
    this.showShareFolderModal.set(true);
  }

  async regenerateFolderShareCode() {
    const folder = this.selectedFolderForShare();
    if (!folder) return;

    try {
      const updatedFolder = await this.folderService.generateShareCode(folder.id);
      this.selectedFolderForShare.set(updatedFolder);
      this.folderShareCode.set(updatedFolder.shareCode || '');
      this.updateFolderShareCode(updatedFolder.id, updatedFolder.shareCode || '');
    } catch (error) {
      console.error('Error regenerating folder share code:', error);
      alert('Failed to regenerate folder share code');
    }
  }

  copyFolderShareCode() {
    const code = this.folderShareCode();
    if (code) {
      navigator.clipboard.writeText(code);
      alert('Folder share code copied to clipboard!');
    }
  }

  private updateFolderShareCode(folderId: string, shareCode: string) {
    this.myFolders.update((folders) =>
      folders.map((f) => (f.id === folderId ? { ...f, shareCode } : f))
    );
  }

  async updateFolderDefaultAccessLevel(accessLevel: string) {
    const folder = this.selectedFolderForShare();
    if (!folder) return;

    try {
      await this.folderService.updateShareCodeAccessLevel(folder.id, accessLevel);
      folder.defaultAccessLevel = accessLevel;
      this.selectedFolderForShare.set({ ...folder });
    } catch (error) {
      console.error('Error updating folder default access level:', error);
      alert('Failed to update access level');
    }
  }

  async updateFolderSharedAccessLevel(userId: string, accessLevel: string) {
    const folder = this.selectedFolderForShare();
    if (!folder) return;

    try {
      await this.folderService.updateSharedAccessLevel(folder.id, userId, accessLevel);
      this.realtimeService.updateCollaboratorPermission(userId, accessLevel, folder.id, undefined);

      const updatedSharedWith = (folder.sharedWith || []).map((user) =>
        user.userId === userId ? { ...user, accessLevel } : user
      );
      const updatedFolder = { ...folder, sharedWith: updatedSharedWith };
      this.selectedFolderForShare.set(updatedFolder);
      this.myFolders.update((folders) =>
        folders.map((f) => (f.id === folder.id ? updatedFolder : f))
      );

      await this.loadWorkspace(true);

      const refreshed = this.myFolders().find((f) => f.id === folder.id);
      if (refreshed) {
        this.selectedFolderForShare.set(refreshed);
      }
    } catch (error) {
      console.error('Error updating collaborator access level:', error);
      alert('Failed to update collaborator access level');
    }
  }

  async removeFolderSharedAccess(userId: string) {
    const folder = this.selectedFolderForShare();
    if (!folder) return;

    try {
      await this.folderService.removeSharedAccess(folder.id, userId);
      this.realtimeService.updateCollaboratorPermission(userId, 'Revoked', folder.id, undefined);

      const updatedSharedWith = (folder.sharedWith || []).filter((user) => user.userId !== userId);
      const updatedFolder = { ...folder, sharedWith: updatedSharedWith };
      this.selectedFolderForShare.set(updatedFolder);
      this.myFolders.update((folders) =>
        folders.map((f) => (f.id === folder.id ? updatedFolder : f))
      );

      await this.loadWorkspace(true);

      const refreshed = this.myFolders().find((f) => f.id === folder.id);
      if (refreshed) {
        this.selectedFolderForShare.set(refreshed);
      }
    } catch (error) {
      console.error('Error removing collaborator access:', error);
      alert('Failed to remove collaborator access');
    }
  }

  async openShareModal(doc: DocumentDto, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedDocForShare.set(doc);
    this.defaultAccessLevel.set(doc.defaultAccessLevel || 'View');

    if (!doc.shareCode) {
      try {
        const updatedDoc = await this.documentService.generateShareCode(doc.id);
        this.selectedDocForShare.set(updatedDoc);
        this.shareCode.set(updatedDoc.shareCode || '');
      } catch (error) {
        console.error('Error generating share code:', error);
        alert('Failed to generate share code');
      }
    } else {
      this.shareCode.set(doc.shareCode);
    }
    this.showShareModal.set(true);
  }

  getDocumentShareCollaborators(): SharedCollaborator[] {
    const doc = this.selectedDocForShare();
    if (!doc) return [];

    const map = new Map<string, SharedCollaborator>();

    // 1. Add inherited collaborators from containing project/folder
    if (doc.folderId) {
      const folder = this.myFolders().find((f) => f.id === doc.folderId);
      if (folder && folder.sharedWith) {
        for (const user of folder.sharedWith) {
          map.set(user.userId, {
            userId: user.userId,
            userName: user.userName,
            accessLevel: user.accessLevel,
            isInherited: true,
            inheritedFrom: folder.name,
          });
        }
      }
    }

    // 2. Overlay direct document-level permissions
    if (doc.sharedWith) {
      for (const user of doc.sharedWith) {
        map.set(user.userId, {
          userId: user.userId,
          userName: user.userName,
          accessLevel: user.accessLevel,
          isInherited: false,
        });
      }
    }

    return Array.from(map.values());
  }

  copyShareCode() {
    const code = this.shareCode();
    if (code) {
      navigator.clipboard.writeText(code);
      alert('Share code copied to clipboard!');
    }
  }

  closeShareModal() {
    this.showShareModal.set(false);
    this.selectedDocForShare.set(null);
    this.shareCode.set('');
  }

  async regenerateShareCode() {
    const doc = this.selectedDocForShare();
    if (!doc) return;

    try {
      const updatedDoc = await this.documentService.generateShareCode(doc.id);
      this.selectedDocForShare.set(updatedDoc);
      this.shareCode.set(updatedDoc.shareCode || '');
      this.myDocuments.update((docs) => docs.map((d) => (d.id === doc.id ? updatedDoc : d)));
    } catch (error) {
      console.error('Error regenerating share code:', error);
      alert('Failed to regenerate share code');
    }
  }

  async updateDocumentDefaultAccessLevel(accessLevel: string) {
    const doc = this.selectedDocForShare();
    if (!doc) return;

    try {
      await this.documentService.updateShareCodeAccessLevel(doc.id, accessLevel);
      doc.defaultAccessLevel = accessLevel;
      this.selectedDocForShare.set({ ...doc });
    } catch (error) {
      console.error('Error updating default access level:', error);
      alert('Failed to update default access level');
    }
  }

  async updateDocumentSharedAccessLevel(documentId: string, userId: string, accessLevel: string) {
    const doc = this.selectedDocForShare();
    try {
      await this.documentService.updateSharedAccessLevel(documentId, userId, accessLevel);
      this.realtimeService.updateCollaboratorPermission(userId, accessLevel, undefined, documentId);

      if (doc && doc.id === documentId) {
        const updatedSharedWith = (doc.sharedWith || []).map((user) =>
          user.userId === userId ? { ...user, accessLevel } : user
        );
        const updatedDoc = { ...doc, sharedWith: updatedSharedWith };
        this.selectedDocForShare.set(updatedDoc);
        this.myDocuments.update((docs) =>
          docs.map((d) => (d.id === documentId ? updatedDoc : d))
        );
      }

      await this.loadWorkspace(true);

      if (doc) {
        const refreshed = this.myDocuments().find((d) => d.id === documentId);
        if (refreshed) {
          this.selectedDocForShare.set(refreshed);
        }
      }
    } catch (error) {
      console.error('Error updating collaborator access level:', error);
      alert('Failed to update collaborator access level');
    }
  }

  async removeDocumentSharedAccess(documentId: string, userId: string) {
    const doc = this.selectedDocForShare();
    try {
      await this.documentService.removeSharedAccess(documentId, userId);
      this.realtimeService.updateCollaboratorPermission(userId, 'Revoked', undefined, documentId);

      if (doc && doc.id === documentId) {
        const updatedSharedWith = (doc.sharedWith || []).filter((user) => user.userId !== userId);
        const updatedDoc = { ...doc, sharedWith: updatedSharedWith };
        this.selectedDocForShare.set(updatedDoc);
        this.myDocuments.update((docs) =>
          docs.map((d) => (d.id === documentId ? updatedDoc : d))
        );
      }

      await this.loadWorkspace(true);

      if (doc) {
        const refreshed = this.myDocuments().find((d) => d.id === documentId);
        if (refreshed) {
          this.selectedDocForShare.set(refreshed);
        }
      }
    } catch (error) {
      console.error('Error removing collaborator access:', error);
      alert('Failed to remove collaborator access');
    }
  }

  confirmDelete(docId: string, event?: Event) {
    if (event) event.stopPropagation();
    this.deleteDocId.set(docId);
    this.showDeleteConfirm.set(true);
  }

  getDeleteDocTitle(): string {
    const id = this.deleteDocId();
    const doc = this.myDocuments().find((d) => d.id === id);
    return doc?.title || 'this document';
  }

  async deleteDocument() {
    const docId = this.deleteDocId();
    if (!docId) return;

    this.myDocuments.update((docs) => docs.filter((d) => d.id !== docId));
    this.folderChildDocs.update((prev) => {
      const updated: Record<string, DocumentDto[]> = {};
      for (const k in prev) {
        updated[k] = prev[k].filter((d) => d.id !== docId);
      }
      return updated;
    });

    const nextTabs = this.openTabs().filter((t) => t.id !== docId);
    this.openTabs.set(nextTabs);
    if (this.activeTabId() === docId) {
      this.activeTabId.set(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : '');
    }

    this.showDeleteConfirm.set(false);
    this.deleteDocId.set('');

    try {
      await this.documentService.deleteDocument(docId);
      this.notifyWorkspaceChange('delete', 'file', docId);
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document from server');
      this.loadWorkspace();
    }
  }

  getLanguageBadge(title: string): { icon: string; class: string } {
    const ext = title.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py': return { icon: 'code', class: 'lang-py' };
      case 'js': case 'mjs': return { icon: 'javascript', class: 'lang-js' };
      case 'ts': return { icon: 'code', class: 'lang-ts' };
      case 'html': return { icon: 'html', class: 'lang-html' };
      case 'css': case 'scss': return { icon: 'css', class: 'lang-css' };
      case 'json': return { icon: 'data_object', class: 'lang-json' };
      case 'md': return { icon: 'description', class: 'lang-md' };
      default: return { icon: 'insert_drive_file', class: 'lang-default' };
    }
  }

  private findDocumentTitle(docId: string): string {
    const ownDoc = this.myDocuments().find((doc) => doc.id === docId);
    if (ownDoc?.title) return ownDoc.title;
    const sharedDoc = this.sharedDocuments().find((doc) => doc.documentId === docId || doc.id === docId);
    if (sharedDoc?.documentTitle) return sharedDoc.documentTitle;
    for (const folderId in this.folderChildDocs()) {
      const cached = this.folderChildDocs()[folderId]?.find((doc) => doc.id === docId);
      if (cached?.title) return cached.title;
    }
    return 'Untitled';
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/signin']);
  }

  // Resizing logic
  private getSavedExplorerWidth(): number {
    if (typeof window === 'undefined') return EXPLORER_DEFAULT_WIDTH;
    const saved = localStorage.getItem(EXPLORER_WIDTH_STORAGE_KEY);
    const parsed = saved ? Number(saved) : EXPLORER_DEFAULT_WIDTH;
    return isNaN(parsed) ? EXPLORER_DEFAULT_WIDTH : Math.min(Math.max(parsed, EXPLORER_MIN_WIDTH), EXPLORER_MAX_WIDTH);
  }

  startExplorerResize(event: MouseEvent) {
    event.preventDefault();
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.explorerWidth();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: MouseEvent) => {
      if (!this.isResizing) return;
      const nextWidth = Math.min(
        Math.max(this.resizeStartWidth + (moveEvent.clientX - this.resizeStartX), EXPLORER_MIN_WIDTH),
        EXPLORER_MAX_WIDTH,
      );
      this.explorerWidth.set(nextWidth);
    };

    const onEnd = () => {
      this.isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(EXPLORER_WIDTH_STORAGE_KEY, String(this.explorerWidth()));
      this.activeCleanupResizer = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    };

    this.activeCleanupResizer = onEnd;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  }

  startExplorerTouchResize(event: TouchEvent) {
    if (!event.touches.length) return;
    this.isResizing = true;
    this.resizeStartX = event.touches[0].clientX;
    this.resizeStartWidth = this.explorerWidth();

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (!this.isResizing || !moveEvent.touches.length) return;
      const nextWidth = Math.min(
        Math.max(this.resizeStartWidth + (moveEvent.touches[0].clientX - this.resizeStartX), EXPLORER_MIN_WIDTH),
        EXPLORER_MAX_WIDTH,
      );
      this.explorerWidth.set(nextWidth);
    };

    const onTouchEnd = () => {
      this.isResizing = false;
      localStorage.setItem(EXPLORER_WIDTH_STORAGE_KEY, String(this.explorerWidth()));
      this.activeCleanupResizer = null;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    this.activeCleanupResizer = onTouchEnd;
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
  }

  onExplorerResizeKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.explorerWidth.set(Math.max(this.explorerWidth() - 10, EXPLORER_MIN_WIDTH));
      localStorage.setItem(EXPLORER_WIDTH_STORAGE_KEY, String(this.explorerWidth()));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.explorerWidth.set(Math.min(this.explorerWidth() + 10, EXPLORER_MAX_WIDTH));
      localStorage.setItem(EXPLORER_WIDTH_STORAGE_KEY, String(this.explorerWidth()));
    }
  }

  getSavedAiDockPosition(): 'right' | 'left' | 'bottom' {
    if (typeof localStorage === 'undefined') return 'right';
    const val = localStorage.getItem(AI_DOCK_POSITION_KEY);
    if (val === 'left' || val === 'bottom' || val === 'right') return val;
    return 'right';
  }

  getSavedAiDockOpen(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const val = localStorage.getItem(AI_DOCK_OPEN_KEY);
    return val !== null ? val === 'true' : false;
  }

  getSavedAiDockWidth(): number {
    if (typeof localStorage === 'undefined') return AI_DOCK_DEFAULT_WIDTH;
    const val = localStorage.getItem(AI_DOCK_WIDTH_KEY);
    const parsed = val ? parseInt(val, 10) : AI_DOCK_DEFAULT_WIDTH;
    return isNaN(parsed) ? AI_DOCK_DEFAULT_WIDTH : Math.max(AI_DOCK_MIN_WIDTH, Math.min(AI_DOCK_MAX_WIDTH, parsed));
  }

  setAiDockPosition(pos: 'right' | 'left' | 'bottom'): void {
    this.aiDockPosition.set(pos);
    localStorage.setItem(AI_DOCK_POSITION_KEY, pos);
    if (pos === 'left') {
      this.isSidebarOpen.set(true);
      this.activeSidebarView.set('ai');
    } else if (pos === 'bottom') {
      this.isTerminalOpen.set(true);
      this.bottomPanelActiveTab.set('ai');
    } else {
      this.isAiDockOpen.set(true);
      localStorage.setItem(AI_DOCK_OPEN_KEY, 'true');
    }
  }

  toggleAiDock(): void {
    if (this.aiDockPosition() === 'left') {
      this.toggleSidebarView('ai');
    } else if (this.aiDockPosition() === 'bottom') {
      if (this.isTerminalOpen() && this.bottomPanelActiveTab() === 'ai') {
        this.isTerminalOpen.set(false);
      } else {
        this.isTerminalOpen.set(true);
        this.bottomPanelActiveTab.set('ai');
      }
    } else {
      const nextState = !this.isAiDockOpen();
      this.isAiDockOpen.set(nextState);
      localStorage.setItem(AI_DOCK_OPEN_KEY, String(nextState));
    }
  }

  startAiDockResize(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    this.isResizingAiDock = true;
    this.resizeAiDockStartX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    this.resizeAiDockStartWidth = this.aiDockWidth();

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!this.isResizingAiDock) return;
      const currentX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      // Dragging left from right dock increases width
      const delta = this.resizeAiDockStartX - currentX;
      const nextWidth = Math.max(AI_DOCK_MIN_WIDTH, Math.min(AI_DOCK_MAX_WIDTH, this.resizeAiDockStartWidth + delta));
      this.aiDockWidth.set(nextWidth);
    };

    const onEnd = () => {
      if (this.isResizingAiDock) {
        this.isResizingAiDock = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem(AI_DOCK_WIDTH_KEY, String(this.aiDockWidth()));
      }
      document.removeEventListener('mousemove', onMove as any);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove as any);
      document.removeEventListener('touchend', onEnd);
    };

    document.addEventListener('mousemove', onMove as any);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove as any, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  toggleSidebarView(view: 'explorer' | 'search' | 'run' | 'packages' | 'ai' | 'comments' | 'timeline'): void {
    if (view === 'ai' && this.aiDockPosition() === 'right') {
      this.toggleAiDock();
      return;
    }
    if (view === 'ai' && this.aiDockPosition() === 'bottom') {
      this.toggleAiDock();
      return;
    }
    if (this.activeSidebarView() === view && this.isSidebarOpen()) {
      this.isSidebarOpen.set(false);
    } else {
      this.activeSidebarView.set(view);
      this.isSidebarOpen.set(true);
      if (view === 'search') {
        setTimeout(() => {
          const input = document.getElementById('workspace-search-input');
          if (input) {
            input.focus();
            (input as HTMLInputElement).select();
          }
        }, 50);
      } else if (view === 'timeline') {
        this.loadAuditLogs();
      }
    }
  }

  async loadAuditLogs(): Promise<void> {
    const proj = this.scopedProject();
    if (!proj?.id) {
      this.auditLogs.set([]);
      return;
    }

    this.isLoadingAuditLogs.set(true);
    try {
      const logs = await this.folderService.getProjectAuditLogs(proj.id, 50, 0);
      this.auditLogs.set(logs || []);
    } catch (err) {
      console.warn('Could not load audit logs for project:', err);
      this.auditLogs.set([]);
    } finally {
      this.isLoadingAuditLogs.set(false);
    }
  }

  collectWorkspaceFilesSnapshot(): Record<string, string> {
    const proj = this.scopedProject();
    const projId = proj?.id;
    const vfs = this.vfsService.vfsIndex();
    const docs = this.getAllWorkspaceDocuments();

    // Query active live buffer across all open tab editor instances
    const liveBufferMap = new Map<string, string>();
    for (const inst of this.editorInstances()) {
      const docId = inst.documentId();
      if (docId) {
        liveBufferMap.set(docId, inst.codeSignal());
      }
    }

    const filesMap: Record<string, string> = {};
    for (const doc of docs) {
      if (!projId || this.isDocumentInProject(doc.id, projId)) {
        const relPath = vfs.docIdToPath.get(doc.id) || doc.title;
        if (relPath) {
          const liveCode = liveBufferMap.get(doc.id);
          filesMap[relPath] = liveCode !== undefined ? liveCode : (doc.content || '');
        }
      }
    }
    return filesMap;
  }

  collectDirtyOverlays(): Record<string, string> {
    const overlays: Record<string, string> = {};
    const vfs = this.vfsService.vfsIndex();
    const allDocs = this.getAllWorkspaceDocuments();
    for (const inst of this.editorInstances()) {
      const docId = inst.documentId();
      if (docId) {
        const doc = allDocs.find((d) => d.id === docId);
        const relPath = vfs.docIdToPath.get(docId) || doc?.title || 'main';
        const code = inst.codeSignal();
        if (code !== undefined && code !== null) {
          overlays[relPath] = code;
        }
      }
    }
    return overlays;
  }

  async executeRunProfile(): Promise<void> {
    const activeId = this.activeTabId();
    const allDocs = this.getAllWorkspaceDocuments();
    const doc = allDocs.find((d) => d.id === activeId);
    const activeFilePath = doc ? (this.getFileRelativePath(doc) || doc.title) : 'main';
    const projId = this.scopedProject()?.id;

    if (!this.isTerminalOpen()) {
      this.isTerminalOpen.set(true);
      setTimeout(async () => {
        this.attachWorkspaceTerminal();
        await this.syncAllWorkspaceFilesToDisk();
        void this.runConfigService.runProfile(
          this.runConfigService.selectedProfile(),
          activeFilePath,
          undefined,
          projId
        );
      }, 50);
    } else {
      this.attachWorkspaceTerminal();
      await this.syncAllWorkspaceFilesToDisk();
      void this.runConfigService.runProfile(
        this.runConfigService.selectedProfile(),
        activeFilePath,
        undefined,
        projId
      );
    }
  }

  openWorkspaceSearch(): void {
    this.toggleSidebarView('search');
  }

  async triggerWorkspaceSearch(): Promise<void> {
    const projId = this.scopedProject()?.id || 'global';
    await this.searchService.search(projId);
  }

  async triggerWorkspaceReplaceAll(): Promise<void> {
    const projId = this.scopedProject()?.id || 'global';
    const res = await this.searchService.replaceAll(projId);
    if (res.status === 'ok' && res.updatedFiles) {
      // Reload workspace tree and active documents
      void this.loadWorkspace(true);
    }
  }

  async triggerSingleMatchReplace(file: string, match: SearchMatch): Promise<void> {
    const projId = this.scopedProject()?.id || 'global';
    const res = await this.searchService.replaceSingleMatch(projId, file, match);
    if (res.status === 'ok') {
      void this.loadWorkspace(true);
    }
  }

  navigateToSearchResult(file: string, lineNumber: number, columnNumber: number = 0): void {
    const vfs = this.vfsService.vfsIndex();
    const docId = vfs.pathToDocId.get(file) || this.findDocIdByTitleOrPath(file);

    if (docId) {
      this.openDocument(docId);
      setTimeout(() => {
        const activeInst = this.activeEditorInstance();
        if (activeInst) {
          activeInst.scrollToLine(lineNumber, columnNumber);
        }
      }, 100);
    }
  }

  private findDocIdByTitleOrPath(path: string): string | null {
    const base = path.split('/').pop() || path;
    const match = this.myDocuments().find(
      (d) => d.title.toLowerCase() === path.toLowerCase() || d.title.toLowerCase() === base.toLowerCase(),
    );
    return match ? match.id : null;
  }

  // Workspace Terminal State & Handlers
  readonly isTerminalOpen = signal<boolean>(false);
  readonly terminalHeight = signal<number>(280);
  readonly isTerminalMaximized = signal<boolean>(false);
  readonly workspaceTerminalContainer = viewChild<ElementRef<HTMLElement>>('workspaceTerminalContainer');

  private isResizingTerminal = false;
  private startY = 0;
  private startHeight = 280;

  toggleTerminalInActiveEditor(): void {
    this.toggleTerminal();
  }

  toggleTerminal(): void {
    const next = !this.isTerminalOpen();
    this.isTerminalOpen.set(next);
    if (next) {
      setTimeout(() => {
        this.attachWorkspaceTerminal();
      }, 50);
    }
  }

  closeTerminal(): void {
    this.isTerminalOpen.set(false);
  }

  attachWorkspaceTerminal(): void {
    const container = this.workspaceTerminalContainer()?.nativeElement;
    if (!container) return;
    const proj = this.scopedProject();
    const projId = proj?.id || (this.openTabs()[0]?.id ? this.myFolders()[0]?.id || 'workspace_default' : 'workspace_default');
    const projName = proj?.name || 'workspace';
    this.liveTerminalService.attachToElement(container, projId, this.isDarkMode(), projName);
    this.syncAllWorkspaceFilesToDisk();
  }

  async syncAllWorkspaceFilesToDisk(): Promise<void> {
    const filesMap = this.collectWorkspaceFilesSnapshot();
    if (Object.keys(filesMap).length > 0) {
      await this.liveTerminalService.syncFiles(filesMap);
    }
  }

  restartTerminal(): void {
    this.liveTerminalService.restart();
  }

  clearTerminal(): void {
    this.liveTerminalService.clear();
  }

  toggleMaximizeTerminal(): void {
    if (this.isTerminalMaximized()) {
      this.isTerminalMaximized.set(false);
      this.terminalHeight.set(280);
    } else {
      this.isTerminalMaximized.set(true);
      this.terminalHeight.set(window.innerHeight - 180);
    }
    setTimeout(() => {
      this.liveTerminalService.fit();
    }, 50);
  }

  focusTerminal(): void {
    this.liveTerminalService.focus();
  }

  startResizingTerminal(event: MouseEvent | TouchEvent): void {
    event.preventDefault();
    this.isResizingTerminal = true;
    this.startY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    this.startHeight = this.terminalHeight();

    const onMove = (moveEv: MouseEvent | TouchEvent) => {
      if (!this.isResizingTerminal) return;
      const currentY = 'touches' in moveEv ? moveEv.touches[0].clientY : moveEv.clientY;
      const deltaY = this.startY - currentY;
      const nextHeight = Math.max(120, Math.min(window.innerHeight - 120, this.startHeight + deltaY));
      this.terminalHeight.set(nextHeight);
      this.liveTerminalService.fit();
    };

    const onEnd = () => {
      this.isResizingTerminal = false;
      this.activeCleanupTerminalResizer = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      this.liveTerminalService.fit();
    };

    this.activeCleanupTerminalResizer = onEnd;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  }

  resetTerminalHeight(): void {
    this.terminalHeight.set(280);
    this.isTerminalMaximized.set(false);
    setTimeout(() => {
      this.liveTerminalService.fit();
    }, 50);
  }

  toggleTheme(): void {
    this.isDarkMode.update((v) => !v);
  }
}
