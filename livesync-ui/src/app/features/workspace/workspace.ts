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
import JSZip from 'jszip';
import { Editor } from '../editor/editor';
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
  private readonly realtimeService = inject(RealtimeService);
  public readonly vfsService = inject(VFSService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private activeCleanupResizer?: (() => void) | null;
  private activeCleanupTerminalResizer?: (() => void) | null;
  private lastHandledPermTimestamp = 0;
  private lastJoinedWorkspaceId: string | null = null;

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
          void this.loadWorkspace(true);
          if (wsChange.action === 'rename' && wsChange.itemId && wsChange.name) {
            this.openTabs.update((tabs) =>
              tabs.map((t) => (t.id === wsChange.itemId ? { ...t, title: wsChange.name! } : t))
            );
          }
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

  // Tabs state
  openTabs = signal<Array<{ id: string; title: string }>>([]);
  activeTabId = signal<string>('');

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

  // AI Quick Actions Menu
  showAiQuickMenu = signal(false);

  toggleAiQuickMenu() {
    this.showAiQuickMenu.update((v) => !v);
  }

  runAiQuickAction(action: string) {
    this.showAiQuickMenu.set(false);
    this.activeEditorInstance()?.runAiAnalysis(action);
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

  // Quick Open / Command Palette (Ctrl+P)
  showQuickOpen = signal(false);
  quickOpenQuery = signal('');
  quickOpenSelectedIndex = signal(0);

  quickOpenResults = computed(() => {
    const q = this.quickOpenQuery().toLowerCase().trim();
    const docs = [
      ...this.myDocuments(),
      ...this.sharedDocuments().map((s) => ({
        id: s.documentId,
        title: s.documentTitle,
        folderId: s.folderPath && s.folderPath.length > 0 ? s.folderPath[s.folderPath.length - 1].id : undefined,
      })),
    ];

    if (!q) {
      return docs.slice(0, 15);
    }
    return docs.filter((d) => d.title && d.title.toLowerCase().includes(q)).slice(0, 15);
  });

  toggleQuickOpen() {
    this.showQuickOpen.update((v) => !v);
    if (this.showQuickOpen()) {
      this.quickOpenQuery.set('');
      this.quickOpenSelectedIndex.set(0);
    }
  }

  handleQuickOpenKeyDown(event: KeyboardEvent) {
    const results = this.quickOpenResults();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.quickOpenSelectedIndex.update((i) => (i + 1) % Math.max(1, results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.quickOpenSelectedIndex.update((i) => (i - 1 + results.length) % Math.max(1, results.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = this.quickOpenSelectedIndex();
      if (results[idx]) {
        this.selectQuickOpenDoc(results[idx].id);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.showQuickOpen.set(false);
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

  private refreshVFSIndex(): void {
    const folders = this.myFolders();
    const sharedFolds = this.sharedFolders();
    const tree = this.sharedFolderTree();
    const docs = this.myDocuments();
    const sharedDocs = this.sharedDocuments();

    const allDocs: DocumentDto[] = [
      ...docs,
      ...sharedDocs.map(
        (s) =>
          ({
            id: s.documentId,
            title: s.documentTitle,
            folderId: s.folderPath && s.folderPath.length > 0 ? s.folderPath[s.folderPath.length - 1].id : undefined,
            ownerId: s.userId,
            isShared: true,
            defaultAccessLevel: s.accessLevel,
            createdAt: s.sharedAt,
            updatedAt: s.sharedAt,
          }) as DocumentDto,
      ),
    ];

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

  async loadWorkspace(silent: boolean = false) {
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

      this.myFolders.set(folders);
      this.myDocuments.set(docs);
      this.sharedDocuments.set(sharedDocs);
      this.sharedFolders.set([]);

      const tree = this.buildSharedAccessTree(sharedFolds, sharedDocs);
      this.sharedFolderTree.set(tree);
      await this.refreshExpandedFolderContents();

      const allDocs: DocumentDto[] = [
        ...docs,
        ...sharedDocs.map(
          (s) =>
            ({
              id: s.documentId,
              title: s.documentTitle,
              folderId: s.folderPath && s.folderPath.length > 0 ? s.folderPath[s.folderPath.length - 1].id : undefined,
              ownerId: s.userId,
              isShared: true,
              defaultAccessLevel: s.accessLevel,
              createdAt: s.sharedAt,
              updatedAt: s.sharedAt,
            }) as DocumentDto,
        ),
      ];

      // Update Virtual Filesystem (VFS) Path Index
      this.vfsService.updateVFSState(
        [...folders, ...tree],
        allDocs,
        this.scopedProject()?.id || null,
      );
    } catch (error) {
      console.error('Error loading workspace:', error);
    } finally {
      if (!silent) {
        this.isLoading.set(false);
      }
    }
  }

  private async refreshExpandedFolderContents() {
    const expanded = Array.from(this.expandedFolderIds());
    for (const id of expanded) {
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

    // 5. Ctrl+P / Cmd+P -> Toggle Quick Open Command Palette
    if (isCmdOrCtrl && (event.key === 'p' || event.key === 'P') && !event.shiftKey) {
      event.preventDefault();
      this.toggleQuickOpen();
      return;
    }

    // 6. Ctrl+Shift+F / Cmd+Shift+F -> Focus Workspace Global Search
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
      const folder =
        this.myFolders().find((f) => f.id === doc.folderId) ||
        this.sharedFolderTree().find((f) => f.id === doc.folderId);
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

  closeTab(docId: string, event: Event) {
    event.stopPropagation();
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

  toggleSidebarView(view: 'explorer' | 'search' | 'run' | 'packages' | 'ai' | 'comments' | 'timeline'): void {
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
    const docs = [
      ...this.myDocuments(),
      ...this.sharedDocuments().map((s) => ({
        id: s.documentId,
        title: s.documentTitle,
        content: '',
        folderId: s.folderPath && s.folderPath.length > 0 ? s.folderPath[s.folderPath.length - 1].id : undefined,
      })),
    ];

    const filesMap: Record<string, string> = {};
    for (const doc of docs) {
      if (!projId || this.isDocumentInProject(doc.id, projId)) {
        const relPath = vfs.docIdToPath.get(doc.id) || doc.title;
        if (relPath) {
          const activeInst = this.activeEditorInstance();
          if (activeInst && activeInst.docId() === doc.id) {
            filesMap[relPath] = activeInst.codeSignal() || doc.content || '';
          } else {
            filesMap[relPath] = doc.content || '';
          }
        }
      }
    }
    return filesMap;
  }

  collectDirtyOverlays(): Record<string, string> {
    const overlays: Record<string, string> = {};
    const activeInst = this.activeEditorInstance();
    if (activeInst && activeInst.docId()) {
      const docId = activeInst.docId();
      const vfs = this.vfsService.vfsIndex();
      const activeDoc = this.myDocuments().find((d) => d.id === docId);
      const relPath = vfs.docIdToPath.get(docId) || activeDoc?.title || 'main';
      const code = activeInst.codeSignal();
      if (code !== undefined && code !== null) {
        overlays[relPath] = code;
      }
    }
    return overlays;
  }

  async executeRunProfile(): Promise<void> {
    const activeId = this.activeTabId();
    const doc = this.myDocuments().find((d) => d.id === activeId);
    const activeFilePath = doc ? (this.getFileRelativePath(doc) || doc.title) : 'main';
    const overlays = this.collectDirtyOverlays();
    const projId = this.scopedProject()?.id;

    if (!this.isTerminalOpen()) {
      this.isTerminalOpen.set(true);
      setTimeout(() => {
        this.attachWorkspaceTerminal();
        void this.runConfigService.runProfile(
          this.runConfigService.selectedProfile(),
          activeFilePath,
          overlays,
          projId
        );
      }, 50);
    } else {
      this.attachWorkspaceTerminal();
      void this.runConfigService.runProfile(
        this.runConfigService.selectedProfile(),
        activeFilePath,
        overlays,
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

  syncAllWorkspaceFilesToDisk(): void {
    const filesMap = this.collectWorkspaceFilesSnapshot();
    if (Object.keys(filesMap).length > 0) {
      this.liveTerminalService.syncFiles(filesMap);
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
