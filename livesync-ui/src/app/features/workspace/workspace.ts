import { Component, HostListener, inject, signal, computed, OnInit } from '@angular/core';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
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
import { FolderService, FolderDto, SharedFolderDto } from '../../services/folder.service';
import { Editor } from '../editor/editor';
import {
  ShareModalComponent,
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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

  // Search & Drag-Drop
  searchQuery = signal<string>('');
  draggedItem = signal<{ type: 'file' | 'folder'; id: string } | null>(null);
  dragOverFolderId = signal<string | null>(null);

  availableFolderOptions = computed<TargetFolderOption[]>(() => {
    const list: TargetFolderOption[] = [];
    for (const f of this.myFolders()) {
      list.push({ id: f.id, name: f.name, isShared: false });
    }
    for (const sf of this.sharedFolderTree()) {
      list.push({ id: sf.id, name: sf.name, isShared: true });
    }
    return list;
  });

  ngOnInit() {
    this.loadWorkspace().then(() => {
      this.route.params.subscribe((params) => {
        const projectName = params['projectName'];
        const folderId = this.route.snapshot.queryParams['id'];
        this.resolveScopedProject(projectName, folderId);
      });
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
      this.scopedProject.set(match);
      const exp = new Set(this.expandedFolderIds());
      exp.add(match.id);
      this.expandedFolderIds.set(exp);

      if (this.openTabs().length === 0) {
        this.autoOpenProjectEntry(match);
      }
    } else if (projectName === 'All-Projects') {
      this.scopedProject.set(null);
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
      }

      if (docs && docs.length > 0) {
        const entry =
          docs.find((d) =>
            ['main.py', 'index.js', 'app.py', 'server.js', 'main.ts', 'index.ts', 'app.ts'].includes(
              d.title.toLowerCase()
            )
          ) || docs[0];
        this.openDocument(entry.id);
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
        this.router.navigate(['/workspace', encodeURIComponent(match.name)], {
          queryParams: { id: match.id },
        });
        if (this.openTabs().length === 0) {
          this.autoOpenProjectEntry(match);
        }
      }
    }
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  async loadWorkspace() {
    this.isLoading.set(true);
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
    } catch (error) {
      console.error('Error loading workspace:', error);
    } finally {
      this.isLoading.set(false);
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
    this.expandedFolderIds.set(new Set());
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
    this.expandedFolderIds.set(all);
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
    this.expandedFolderIds.set(exp);
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
    this.targetParentFolderId.set(folderId);
    if (type === 'folder') {
      this.openCreateFolderModal();
    } else {
      this.targetFolderForNewFile.set(folderId);
      this.showCreateFilePrompt.set(true);
    }
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

  onContextMenuAction(action: string) {
    const ctx = this.contextMenu();
    if (!ctx) return;
    this.closeContextMenu();

    if (action === 'newFile') {
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
          this.router.navigate(['/workspace', encodeURIComponent(newName.trim())], {
            queryParams: { id: target.id },
          });
        }
        await this.loadWorkspace();
      } else if (target.type === 'file') {
        await this.documentService.updateDocument(target.id, { title: newName.trim() });
        this.openTabs.update((tabs) =>
          tabs.map((t) => (t.id === target.id ? { ...t, title: newName.trim() } : t))
        );
        await this.loadWorkspace();
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
      } catch (err) {
        console.error('Error moving document:', err);
      }
    } else if (item.type === 'folder') {
      if (item.id === targetFolderId) return;
      try {
        await this.folderService.moveFolder(item.id, targetFolderId);
        await this.loadWorkspace();
      } catch (err) {
        console.error('Error moving folder:', err);
      }
    }
    this.draggedItem.set(null);
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
      await this.folderService.createFolder(name, parentId);
      this.showCreateFolderModal.set(false);
      this.newFolderName.set('');
      await this.loadWorkspace();
      if (parentId) {
        const exp = new Set(this.expandedFolderIds());
        exp.add(parentId);
        this.expandedFolderIds.set(exp);
      }
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
      await this.loadWorkspace();
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
      await this.loadWorkspace();
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
    try {
      await this.documentService.updateSharedAccessLevel(documentId, userId, accessLevel);
      await this.loadWorkspace();
    } catch (error) {
      console.error('Error updating collaborator access level:', error);
      alert('Failed to update collaborator access level');
    }
  }

  async removeDocumentSharedAccess(documentId: string, userId: string) {
    try {
      await this.documentService.removeSharedAccess(documentId, userId);
      await this.loadWorkspace();
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
  }

  startExplorerTouchResize(event: TouchEvent) {
    if (!event.touches.length) return;
    this.isResizing = true;
    this.resizeStartX = event.touches[0].clientX;
    this.resizeStartWidth = this.explorerWidth();
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent) {
    if (!this.isResizing) return;
    const nextWidth = Math.min(Math.max(this.resizeStartWidth + (event.clientX - this.resizeStartX), EXPLORER_MIN_WIDTH), EXPLORER_MAX_WIDTH);
    this.explorerWidth.set(nextWidth);
  }

  @HostListener('window:touchmove', ['$event'])
  onWindowTouchMove(event: TouchEvent) {
    if (!this.isResizing || !event.touches.length) return;
    const nextWidth = Math.min(Math.max(this.resizeStartWidth + (event.touches[0].clientX - this.resizeStartX), EXPLORER_MIN_WIDTH), EXPLORER_MAX_WIDTH);
    this.explorerWidth.set(nextWidth);
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onWindowMouseUp() {
    if (this.isResizing) {
      this.isResizing = false;
      document.body.style.cursor = '';
      localStorage.setItem(EXPLORER_WIDTH_STORAGE_KEY, String(this.explorerWidth()));
    }
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
}
