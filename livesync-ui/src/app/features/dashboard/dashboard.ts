import { Component, HostListener, inject, signal, OnInit } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
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

const EXPLORER_WIDTH_STORAGE_KEY = 'livesync.explorerWidth';
const EXPLORER_MIN_WIDTH = 180;
const EXPLORER_MAX_WIDTH = 600;
const EXPLORER_DEFAULT_WIDTH = 260;

@Component({
  selector: 'app-dashboard',
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
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly documentService = inject(DocumentService);
  private readonly folderService = inject(FolderService);
  private readonly router = inject(Router);

  readonly explorerMinWidth = EXPLORER_MIN_WIDTH;
  readonly explorerMaxWidth = EXPLORER_MAX_WIDTH;
  explorerWidth = signal(EXPLORER_DEFAULT_WIDTH);
  private isResizingExplorer = false;

  myDocuments = signal<DocumentDto[]>([]);
  sharedDocuments = signal<SharedDocumentDto[]>([]);
  myFolders = signal<FolderDto[]>([]);
  sharedFolders = signal<SharedFolderDto[]>([]);

  currentFolderId = signal<string | null>(null);
  currentFolder = signal<FolderDto | null>(null);
  folderBreadcrumbs = signal<{ id: string | null; name: string }[]>([
    { id: null, name: 'Root Workspace' },
  ]);

  isLoading = signal(false);
  isCreating = signal(false);
  newDocTitle = signal('');

  // Folder Modals
  showCreateFolderModal = signal(false);
  newFolderName = signal('');

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
  editingAccessLevelFor = signal<string | null>(null);

  // Search & Views
  searchQuery = signal<string>('');
  activeTab = signal<'all' | 'folders' | 'mine' | 'shared' | 'favorites'>('all');
  layoutView = signal<'tree' | 'grid' | 'list'>('tree');
  starredDocIds = signal<Set<string>>(new Set(['starred_sample']));

  // VS Code Solution Explorer Tree State
  expandedFolderIds = signal<Set<string>>(new Set());
  folderChildDocs = signal<Record<string, DocumentDto[]>>({});
  folderChildSubfolders = signal<Record<string, FolderDto[]>>({});

  // Editor Tabs State
  openTabs = signal<{ id: string; title: string }[]>([]);
  activeTabId = signal<string>('');
  targetParentFolderId = signal<string | null>(null);

  // Shared Folder Tree State
  sharedFolderTree = signal<FolderDto[]>([]);
  expandedSharedFolderIds = signal<Set<string>>(new Set());

  async toggleFolderExpand(folder: FolderDto, event?: Event) {
    if (event) event.stopPropagation();
    const folderId = folder.id;
    const current = new Set(this.expandedFolderIds());
    if (current.has(folderId)) {
      current.delete(folderId);
      this.expandedFolderIds.set(current);
    } else {
      current.add(folderId);
      this.expandedFolderIds.set(current);
      if (!folder.isStructural && !this.folderChildDocs()[folderId]) {
        try {
          const details = await this.folderService.getFolder(folderId);
          this.folderChildDocs.update((prev) => ({ ...prev, [folderId]: details.documents || [] }));
          this.folderChildSubfolders.update((prev) => ({ ...prev, [folderId]: details.subfolders || [] }));
        } catch (err) {
          console.error('Error fetching folder children:', err);
        }
      }
    }
  }

  isFolderExpanded(folderId: string): boolean {
    return this.expandedFolderIds().has(folderId);
  }

  expandAllFolders() {
    const allIds = new Set(this.myFolders().map((f) => f.id));
    this.expandedFolderIds.set(allIds);
    allIds.forEach(async (id) => {
      if (!this.folderChildDocs()[id]) {
        try {
          const details = await this.folderService.getFolder(id);
          this.folderChildDocs.update((prev) => ({ ...prev, [id]: details.documents || [] }));
        } catch (ignored) {}
      }
    });
  }

  collapseAllFolders() {
    this.expandedFolderIds.set(new Set());
  }
  getExplorerRootFolders(): FolderDto[] {
    return this.mergeFolderLists(this.getFilteredFolders(), this.sharedFolderTree());
  }

  getExplorerRootDocs(): DocumentDto[] {
    const sharedRootDocs = this.getFilteredSharedDocs()
      .filter((doc) => !doc.folderPath || doc.folderPath.length === 0)
      .map((doc) => this.sharedDocumentToDocumentDto(doc));
    return [...this.getFilteredMyDocs(), ...sharedRootDocs];
  }

  getExplorerRootCount(): number {
    return this.getExplorerRootFolders().length + this.getExplorerRootDocs().length;
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
      const path = folder.folderPath && folder.folderPath.length > 0
        ? folder.folderPath
        : [{ id: folder.id, name: folder.name }];
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
    target.name = incoming.name || target.name;
    target.ownerId = incoming.ownerId || target.ownerId;
    target.parentFolderId = incoming.parentFolderId ?? target.parentFolderId;
    target.shareCode = incoming.shareCode || target.shareCode;
    target.defaultAccessLevel = incoming.defaultAccessLevel || target.defaultAccessLevel;
    target.createdAt = incoming.createdAt || target.createdAt;
    target.updatedAt = incoming.updatedAt || target.updatedAt;
    target.subfoldersCount = Math.max(target.subfoldersCount || 0, incoming.subfoldersCount || 0);
    target.documentsCount = Math.max(target.documentsCount || 0, incoming.documentsCount || 0);
    target.folderPath = incoming.folderPath || target.folderPath;
    target.isStructural = Boolean(target.isStructural && incoming.isStructural);
    target.isShared = target.isShared || incoming.isShared;
    target.permission = incoming.permission || target.permission;

    for (const subfolder of incoming.subfolders || []) {
      this.upsertFolder(target.subfolders, this.cloneFolder(subfolder));
    }
    for (const doc of incoming.documents || []) {
      this.addDocumentToFolder(target, doc);
    }
  }

  private addDocumentToFolder(folder: FolderDto, doc: DocumentDto) {
    if (!folder.documents.some((existing) => existing.id === doc.id)) {
      folder.documents.push(doc);
    }
  }

  private cloneFolder(folder: FolderDto): FolderDto {
    return {
      ...folder,
      subfolders: (folder.subfolders || []).map((subfolder) => this.cloneFolder(subfolder)),
      documents: [...(folder.documents || [])],
      folderPath: folder.folderPath ? [...folder.folderPath] : undefined,
    };
  }

  private createStructuralFolder(node: FolderPathNode, parentFolderId?: string): FolderDto {
    return {
      id: node.id,
      name: node.name,
      ownerId: '',
      parentFolderId,
      shareCode: '',
      defaultAccessLevel: 'View',
      createdAt: '',
      updatedAt: '',
      subfoldersCount: 0,
      documentsCount: 0,
      subfolders: [],
      documents: [],
      folderPath: [],
      isStructural: true,
      isShared: true,
      permission: 'View',
    };
  }

  private sharedDocumentToDocumentDto(doc: SharedDocumentDto): DocumentDto {
    return {
      id: doc.documentId,
      title: doc.documentTitle,
      content: '',
      ownerId: '',
      folderId: doc.folderPath && doc.folderPath.length > 0 ? doc.folderPath[doc.folderPath.length - 1].id : undefined,
      ownerName: doc.userName,
      defaultAccessLevel: doc.accessLevel,
      createdAt: doc.sharedAt,
      updatedAt: doc.sharedAt,
      sharedWith: [],
      isShared: true,
      permission: doc.accessLevel === 'Edit' ? 'Edit' : 'View',
    };
  }

  getSubfoldersOf(folderId: string): FolderDto[] {
    const findSubfolders = (list: FolderDto[]): FolderDto[] | null => {
      for (const f of list) {
        if (f.id === folderId) {
          return f.subfolders || [];
        }
        if (f.subfolders && f.subfolders.length > 0) {
          const res = findSubfolders(f.subfolders);
          if (res) return res;
        }
      }
      return null;
    };

    const nested = findSubfolders(this.myFolders());
    if (nested) return nested;
    const sharedNested = findSubfolders(this.sharedFolderTree());
    if (sharedNested) return sharedNested;
    return this.myFolders().filter((f) => f.parentFolderId === folderId);
  }

  private findFolderById(folders: FolderDto[], folderId: string): FolderDto | null {
    for (const folder of folders) {
      if (folder.id === folderId) return folder;
      const nested = this.findFolderById(folder.subfolders || [], folderId);
      if (nested) return nested;
    }
    return null;
  }

  getDocsOf(folderId: string): DocumentDto[] {
    const findDocs = (list: FolderDto[]): DocumentDto[] | null => {
      for (const f of list) {
        if (f.id === folderId) {
          return f.documents || [];
        }
        if (f.subfolders && f.subfolders.length > 0) {
          const res = findDocs(f.subfolders);
          if (res) return res;
        }
      }
      return null;
    };

    const nested = findDocs(this.myFolders());
    if (nested && nested.length > 0) return nested;
    const sharedNested = findDocs(this.sharedFolderTree());
    if (sharedNested && sharedNested.length > 0) return sharedNested;
    return this.myDocuments().filter((d) => d.folderId === folderId);
  }

  async openCreateInFolder(folderId: string | null, type: 'file' | 'folder', event?: Event) {
    if (event) event.stopPropagation();
    this.targetParentFolderId.set(folderId);
    if (type === 'folder') {
      this.openCreateFolderModal();
    } else {
      const title = prompt('Enter new document title (e.g. main.py, index.js, App.java):');
      if (title?.trim()) {
        try {
          const doc = await this.documentService.createDocument({
            title: title.trim(),
            content: '',
          });
          if (folderId) {
            await this.folderService.moveDocument(doc.id, folderId);
            doc.folderId = folderId;
            this.myDocuments.update((docs) => [doc, ...docs]);
            this.folderChildDocs.update((prev) => ({
              ...prev,
              [folderId]: [doc, ...(prev[folderId] || [])],
            }));
          } else {
            this.myDocuments.update((docs) => [doc, ...docs]);
          }
          this.openDocument(doc.id);
        } catch (err) {
          console.error('Error creating file in folder:', err);
          alert('Failed to create file');
        }
      }
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

  onContextMenuAction(action: 'newFile' | 'newFolder' | 'share' | 'delete' | 'move') {
    const ctx = this.contextMenu();
    this.closeContextMenu();
    if (!ctx) return;

    if (action === 'newFile' && ctx.type === 'folder') {
      this.openCreateInFolder(ctx.item.id, 'file');
    } else if (action === 'newFolder' && ctx.type === 'folder') {
      this.openCreateInFolder(ctx.item.id, 'folder');
    } else if (action === 'share') {
      if (ctx.type === 'folder') {
        this.openShareFolderModal(ctx.item);
      } else {
        this.openShareModal(ctx.item);
      }
    } else if (action === 'delete') {
      if (ctx.type === 'folder') {
        this.deleteFolder(ctx.item.id);
      } else {
        this.confirmDelete(ctx.item.id);
      }
    } else if (action === 'move' && ctx.type === 'file') {
      this.openMoveModal(ctx.item);
    }
  }

  // Drag & Drop State
  draggedItem = signal<{ id: string; type: 'file' | 'folder' } | null>(null);
  dragOverFolderId = signal<string | null | 'root'>(null);

  /** Recursively collect all descendant folder IDs of a given folder */
  private collectDescendantFolderIds(folderId: string): Set<string> {
    const ids = new Set<string>();
    const recurse = (parentId: string) => {
      const children = this.getSubfoldersOf(parentId);
      for (const child of children) {
        ids.add(child.id);
        recurse(child.id);
      }
    };
    recurse(folderId);
    return ids;
  }

  /** Check if dropping dragged item on targetFolderId is valid */
  private isValidDropTarget(targetFolderId: string | null): boolean {
    const dragged = this.draggedItem();
    if (!dragged) return true;
    if (dragged.type === 'folder') {
      const targetKey = targetFolderId ?? null;
      if (dragged.id === targetKey) return false;
      if (targetKey && this.collectDescendantFolderIds(dragged.id).has(targetKey)) return false;
    }
    return true;
  }

  /** Find the current parentFolderId for a given folder */
  private findFolderParentId(folderId: string): string | null | undefined {
    const folder = this.findFolderById(this.myFolders(), folderId);
    if (folder) return folder.parentFolderId ?? null;
    const cached = this.folderChildSubfolders();
    for (const parentId in cached) {
      const found = cached[parentId].find(f => f.id === folderId);
      if (found) return parentId;
    }
    return undefined;
  }

  private removeFolderFromTree(folders: FolderDto[], folderId: string): FolderDto[] {
    return folders
      .filter((folder) => folder.id !== folderId)
      .map((folder) => ({
        ...folder,
        subfolders: this.removeFolderFromTree(folder.subfolders || [], folderId),
      }));
  }

  private updateFolderInTree(folders: FolderDto[], folderId: string, update: (folder: FolderDto) => FolderDto): FolderDto[] {
    return folders.map((folder) => {
      if (folder.id === folderId) {
        return update(folder);
      }
      return {
        ...folder,
        subfolders: this.updateFolderInTree(folder.subfolders || [], folderId, update),
      };
    });
  }

  private updateFolderShareCode(folderId: string, shareCode: string) {
    const applyShareCode = (folder: FolderDto): FolderDto => ({ ...folder, shareCode });
    this.myFolders.update((folders) => this.updateFolderInTree(folders, folderId, applyShareCode));
    this.folderChildSubfolders.update((cache) => {
      const updated: Record<string, FolderDto[]> = {};
      for (const parentId of Object.keys(cache)) {
        updated[parentId] = this.updateFolderInTree(cache[parentId], folderId, applyShareCode);
      }
      return updated;
    });

    const current = this.currentFolder();
    if (current?.id === folderId) {
      this.currentFolder.set({ ...current, shareCode });
    }
  }

  private insertFolderInTree(folders: FolderDto[], targetParentFolderId: string | null, folderToInsert: FolderDto): FolderDto[] {
    const cleanedFolder = this.cloneFolder(folderToInsert);
    if (!targetParentFolderId) {
      return [cleanedFolder, ...this.removeFolderFromTree(folders, cleanedFolder.id)];
    }

    return this.updateFolderInTree(
      this.removeFolderFromTree(folders, cleanedFolder.id),
      targetParentFolderId,
      (target) => ({
        ...target,
        subfolders: [
          cleanedFolder,
          ...(target.subfolders || []).filter((folder) => folder.id !== cleanedFolder.id),
        ],
      })
    );
  }

  private removeFolderFromChildCache(folderId: string) {
    this.folderChildSubfolders.update((prev) => {
      const updated: Record<string, FolderDto[]> = {};
      for (const parentId of Object.keys(prev)) {
        updated[parentId] = prev[parentId].filter((folder) => folder.id !== folderId);
      }
      return updated;
    });
  }

  private addFolderToChildCache(targetParentFolderId: string | null, folder: FolderDto) {
    if (!targetParentFolderId) return;
    this.folderChildSubfolders.update((prev) => ({
      ...prev,
      [targetParentFolderId]: [
        this.cloneFolder(folder),
        ...(prev[targetParentFolderId] || []).filter((child) => child.id !== folder.id),
      ],
    }));
  }
  onDragStart(event: DragEvent, type: 'file' | 'folder', id: string) {
    event.stopPropagation();
    this.draggedItem.set({ id, type });
    event.dataTransfer?.setData('text/plain', JSON.stringify({ type, id }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragEnd() {
    this.draggedItem.set(null);
    this.dragOverFolderId.set(null);
  }
  onDragOver(event: DragEvent, targetFolderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isValidDropTarget(targetFolderId)) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      return;
    }
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const targetKey = targetFolderId ?? 'root';
    if (this.dragOverFolderId() !== targetKey) {
      this.dragOverFolderId.set(targetKey);
    }
  }

  onDragEnter(event: DragEvent, targetFolderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isValidDropTarget(targetFolderId)) return;
    this.dragOverFolderId.set(targetFolderId ?? 'root');
  }

  onDragLeave(event: DragEvent, targetFolderId: string | null) {
    event.stopPropagation();
    const targetKey = targetFolderId ?? 'root';
    if (this.dragOverFolderId() === targetKey) {
      this.dragOverFolderId.set(null);
    }
  }

  async onDrop(event: DragEvent, targetFolderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOverFolderId.set(null);
    const dragged = this.draggedItem();
    this.draggedItem.set(null);
    if (!dragged) return;

    if (dragged.type === 'file') {
      const docToMove = this.myDocuments().find((d) => d.id === dragged.id);

      // 1. Immutably update myDocuments signal right away!
      this.myDocuments.update((docs) =>
        docs.map((d) => (d.id === dragged.id ? { ...d, folderId: targetFolderId ?? undefined } : d))
      );

      // 2. Immutably update folderChildDocs cache maps instantly
      this.folderChildDocs.update((prev) => {
        const updated = { ...prev };
        for (const fId in updated) {
          updated[fId] = updated[fId].filter((d) => d.id !== dragged.id);
        }
        if (targetFolderId && docToMove) {
          updated[targetFolderId] = [
            ...(updated[targetFolderId] || []),
            { ...docToMove, folderId: targetFolderId },
          ];
        }
        return updated;
      });

      // 3. Persist change asynchronously to backend
      try {
        await this.folderService.moveDocument(dragged.id, targetFolderId);
      } catch (err) {
        console.error('Error moving document via drag and drop:', err);
        await this.loadWorkspace();
      }
    } else if (dragged.type === 'folder') {
      if (dragged.id === targetFolderId) return;
      if (targetFolderId && this.collectDescendantFolderIds(dragged.id).has(targetFolderId)) return;

      const currentParentId = this.findFolderParentId(dragged.id);
      if ((currentParentId ?? null) === (targetFolderId ?? null)) return;

      const folderToMove = this.findFolderById(this.myFolders(), dragged.id);
      if (!folderToMove) return;
      const movedFolder: FolderDto = this.cloneFolder({
        ...folderToMove,
        parentFolderId: targetFolderId ?? undefined,
      });

      this.myFolders.update((folders) => this.insertFolderInTree(folders, targetFolderId, movedFolder));
      this.removeFolderFromChildCache(dragged.id);
      this.addFolderToChildCache(targetFolderId, movedFolder);

      if (targetFolderId) {
        this.expandedFolderIds.update((set) => new Set([...set, targetFolderId]));
      }
      try {
        await this.folderService.moveFolder(dragged.id, targetFolderId);
      } catch (err) {
        console.error('Error moving folder via drag and drop:', err);
        await this.loadWorkspace();
      }
    }
  }

  toggleStar(docId: string, event?: Event) {
    if (event) event.stopPropagation();
    const current = new Set(this.starredDocIds());
    if (current.has(docId)) {
      current.delete(docId);
    } else {
      current.add(docId);
    }
    this.starredDocIds.set(current);
  }

  isStarred(docId: string): boolean {
    return this.starredDocIds().has(docId);
  }

  getFilteredMyDocs(): DocumentDto[] {
    const q = this.searchQuery().toLowerCase().trim();
    return this.myDocuments().filter((d) => {
      const matchesSearch = !q || d.title.toLowerCase().includes(q);
      const matchesTab =
        this.activeTab() === 'all' ||
        this.activeTab() === 'mine' ||
        (this.activeTab() === 'favorites' && this.isStarred(d.id));
      
      const matchesFolder = q
        ? true
        : this.currentFolderId()
        ? d.folderId === this.currentFolderId()
        : !d.folderId;

      return matchesSearch && matchesTab && matchesFolder;
    });
  }

  getFilteredSharedDocs(): SharedDocumentDto[] {
    const q = this.searchQuery().toLowerCase().trim();
    return this.sharedDocuments().filter((d) => {
      const matchesSearch =
        !q ||
        d.documentTitle.toLowerCase().includes(q) ||
        (d.userName || '').toLowerCase().includes(q);
      const matchesTab =
        this.activeTab() === 'all' ||
        this.activeTab() === 'shared' ||
        (this.activeTab() === 'favorites' && this.isStarred(d.documentId));
      return matchesSearch && matchesTab;
    });
  }

  getFilteredFolders(): FolderDto[] {
    const q = this.searchQuery().toLowerCase().trim();
    return this.myFolders().filter((f) => {
      const matchesSearch = !q || f.name.toLowerCase().includes(q);
      const matchesParent = q
        ? true
        : this.currentFolderId()
        ? f.parentFolderId === this.currentFolderId()
        : !f.parentFolderId;

      return matchesSearch && matchesParent;
    });
  }

  startExplorerResize(event: MouseEvent) {
    event.preventDefault();
    this.beginExplorerResize();
  }

  startExplorerTouchResize(event: TouchEvent) {
    event.preventDefault();
    this.beginExplorerResize();
    const touch = event.touches[0];
    if (touch) {
      this.explorerWidth.set(this.clampExplorerWidth(touch.clientX));
    }
  }

  onExplorerResizeKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 20 : 10;
    const delta = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    if (!delta) return;
    event.preventDefault();
    this.explorerWidth.set(this.clampExplorerWidth(this.explorerWidth() + delta));
    this.persistExplorerWidth();
  }

  private beginExplorerResize() {
    this.isResizingExplorer = true;
    if (typeof document !== 'undefined') {
      document.body.classList.add('explorer-resizing');
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onExplorerResize(event: MouseEvent) {
    if (!this.isResizingExplorer) return;
    this.explorerWidth.set(this.clampExplorerWidth(event.clientX));
  }

  @HostListener('document:touchmove', ['$event'])
  onExplorerTouchResize(event: TouchEvent) {
    if (!this.isResizingExplorer) return;
    const touch = event.touches[0];
    if (touch) {
      event.preventDefault();
      this.explorerWidth.set(this.clampExplorerWidth(touch.clientX));
    }
  }

  @HostListener('document:mouseup')
  @HostListener('document:touchend')
  @HostListener('document:touchcancel')
  stopExplorerResize() {
    if (!this.isResizingExplorer) return;
    this.isResizingExplorer = false;
    if (typeof document !== 'undefined') {
      document.body.classList.remove('explorer-resizing');
    }
    this.persistExplorerWidth();
  }

  private restoreExplorerWidth() {
    if (typeof localStorage === 'undefined') return;
    const stored = Number(localStorage.getItem(EXPLORER_WIDTH_STORAGE_KEY));
    if (Number.isFinite(stored)) {
      this.explorerWidth.set(this.clampExplorerWidth(stored));
    }
  }

  private persistExplorerWidth() {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(EXPLORER_WIDTH_STORAGE_KEY, String(this.explorerWidth()));
  }

  private clampExplorerWidth(width: number): number {
    return Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, Math.round(width)));
  }
  getLanguageBadge(title: string): { name: string; class: string; icon: string } {
    const lowered = (title || '').toLowerCase();
    if (lowered.endsWith('.py')) return { name: 'Python', class: 'python', icon: 'code' };
    if (lowered.endsWith('.cs')) return { name: 'C# .NET', class: 'csharp', icon: 'terminal' };
    if (lowered.endsWith('.java')) return { name: 'Java', class: 'java', icon: 'coffee' };
    if (lowered.endsWith('.js') || lowered.endsWith('.ts')) return { name: 'Node.js', class: 'javascript', icon: 'javascript' };
    return { name: 'Polyglot', class: 'generic', icon: 'data_object' };
  }

  async ngOnInit() {
    this.restoreExplorerWidth();
    await this.loadWorkspace();
  }

  async loadWorkspace() {
    this.isLoading.set(true);
    try {
      const [myDocs, sharedDocs, folders, sharedF, sharedFDetails] = await Promise.all([
        this.documentService.getMyDocuments(),
        this.documentService.getSharedDocuments(),
        this.folderService.getMyFolders(),
        this.folderService.getSharedFolders(),
        this.folderService.getSharedFolderDetails().catch(() => [] as FolderDto[]),
      ]);
      this.myDocuments.set(myDocs);
      this.sharedDocuments.set(sharedDocs);
      this.myFolders.set(folders);
      this.sharedFolders.set(sharedF);
      this.sharedFolderTree.set(this.buildSharedAccessTree(sharedFDetails, sharedDocs));
    } catch (error) {
      console.error('Error loading workspace:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async openFolder(folder: FolderDto) {
    this.isLoading.set(true);
    try {
      const details = await this.folderService.getFolder(folder.id);
      this.currentFolder.set(details);
      this.currentFolderId.set(folder.id);
      this.myDocuments.set(details.documents || []);
      this.myFolders.set(details.subfolders || []);

      const breadcrumbs = this.folderBreadcrumbs();
      this.folderBreadcrumbs.set([...breadcrumbs, { id: folder.id, name: folder.name }]);
    } catch (err) {
      console.error('Error opening folder:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async navigateToBreadcrumb(index: number) {
    const target = this.folderBreadcrumbs()[index];
    const newBreadcrumbs = this.folderBreadcrumbs().slice(0, index + 1);
    this.folderBreadcrumbs.set(newBreadcrumbs);

    if (target.id === null) {
      this.currentFolderId.set(null);
      this.currentFolder.set(null);
      await this.loadWorkspace();
    } else {
      const details = await this.folderService.getFolder(target.id);
      this.currentFolder.set(details);
      this.currentFolderId.set(target.id);
      this.myDocuments.set(details.documents || []);
      this.myFolders.set(details.subfolders || []);
    }
  }

  openCreateFolderModal() {
    this.newFolderName.set('');
    this.showCreateFolderModal.set(true);
  }

  async createFolder() {
    const name = this.newFolderName().trim();
    if (!name) return;

    try {
      const parentId = this.targetParentFolderId() || this.currentFolderId() || undefined;
      await this.folderService.createFolder(name, parentId);
      this.showCreateFolderModal.set(false);
      this.newFolderName.set('');
      this.targetParentFolderId.set(null);

      await this.loadWorkspace();
      if (parentId) {
        this.expandedFolderIds.update((set) => new Set([...set, parentId]));
      }
    } catch (err) {
      console.error('Error creating folder:', err);
      alert('Failed to create folder');
    }
  }

  async deleteFolder(folderId: string, event?: Event) {
    if (event) event.stopPropagation();

    const descendantIds = this.collectDescendantFolderIds(folderId);
    const allFolderIds = new Set([folderId, ...descendantIds]);

    let docCount = 0;
    for (const fId of allFolderIds) {
      docCount += (this.folderChildDocs()[fId] || this.getDocsOf(fId)).length;
    }
    const subfolderCount = descendantIds.size;

    let warning = 'Permanently delete this folder';
    if (subfolderCount > 0 || docCount > 0) {
      const parts: string[] = [];
      if (subfolderCount > 0) parts.push(`${subfolderCount} subfolder${subfolderCount > 1 ? 's' : ''}`);
      if (docCount > 0) parts.push(`${docCount} file${docCount > 1 ? 's' : ''}`);
      warning += ` and all ${parts.join(' and ')} inside it`;
    }
    warning += '? This cannot be undone.';

    if (!confirm(warning)) return;

    // Gather doc IDs for tab cleanup before we clear caches
    const deletedDocIds = new Set<string>();
    for (const fId of allFolderIds) {
      const docs = this.folderChildDocs()[fId] || this.getDocsOf(fId);
      for (const doc of docs) deletedDocIds.add(doc.id);
    }

    try {
      await this.folderService.deleteFolder(folderId);

      // Remove from root-level myFolders and nested tree
      this.myFolders.update((f) => f.filter((item) => item.id !== folderId));
      this.myFolders.update((f) => this.removeFolderFromTree(f, folderId));

      // Clean up cached child docs and subfolders
      this.folderChildDocs.update((prev) => {
        const updated = { ...prev };
        for (const fId of allFolderIds) delete updated[fId];
        return updated;
      });
      this.folderChildSubfolders.update((prev) => {
        const updated = { ...prev };
        for (const fId of allFolderIds) delete updated[fId];
        return updated;
      });

      // Remove documents belonging to deleted folders
      this.myDocuments.update((docs) => docs.filter((d) => !d.folderId || !allFolderIds.has(d.folderId)));

      // Close open editor tabs for documents inside deleted folders
      if (deletedDocIds.size > 0) {
        this.openTabs.update((tabs) => tabs.filter((t) => !deletedDocIds.has(t.id)));
        if (deletedDocIds.has(this.activeTabId())) {
          const remaining = this.openTabs();
          this.activeTabId.set(remaining.length > 0 ? remaining[remaining.length - 1].id : '');
        }
      }

      // Remove from expanded set
      this.expandedFolderIds.update((set) => {
        const updated = new Set(set);
        for (const fId of allFolderIds) updated.delete(fId);
        return updated;
      });
    } catch (err) {
      console.error('Error deleting folder:', err);
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
    } catch (err) {
      console.error('Error moving document:', err);
      alert('Failed to move document');
    }
  }

  async openShareFolderModal(folder: FolderDto, event?: Event) {
    if (event) event.stopPropagation();

    let folderForShare = folder;
    if (!folderForShare.shareCode) {
      try {
        folderForShare = await this.folderService.generateShareCode(folderForShare.id);
        this.updateFolderShareCode(folderForShare.id, folderForShare.shareCode || '');
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

  async createNewDocument() {
    if (!this.newDocTitle().trim()) {
      alert('Please enter a document title');
      return;
    }

    this.isCreating.set(true);
    try {
      const doc = await this.documentService.createDocument({
        title: this.newDocTitle(),
        content: '',
      });

      if (this.currentFolderId()) {
        await this.folderService.moveDocument(doc.id, this.currentFolderId());
      }

      this.openDocument(doc.id);
    } catch (error) {
      console.error('Error creating document:', error);
      alert('Failed to create document');
    } finally {
      this.isCreating.set(false);
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

    const searchFolders = (folders: FolderDto[]): string | null => {
      for (const f of folders) {
        const found = f.documents?.find((d) => d.id === docId);
        if (found?.title) return found.title;
        if (f.subfolders?.length) {
          const subFound = searchFolders(f.subfolders);
          if (subFound) return subFound;
        }
      }
      return null;
    };

    const fromFolders = searchFolders(this.myFolders()) || searchFolders(this.sharedFolderTree());
    if (fromFolders) return fromFolders;

    return 'Untitled';
  }

  openDocument(docId: string) {
    // Add tab if not already open
    const existing = this.openTabs().find((t) => t.id === docId);
    if (!existing) {
      const title = this.findDocumentTitle(docId);
      this.openTabs.update((tabs) => [...tabs, { id: docId, title }]);
    }
    this.activeTabId.set(docId);
  }

  openSharedDoc(docId: string) {
    this.openDocument(docId);
  }

  getSharedDocFolderPath(doc: SharedDocumentDto): string {
    if (!doc.folderPath || doc.folderPath.length === 0) return '';
    return doc.folderPath.map((n) => n.name).join(' / ') + ' / ';
  }

  closeTab(tabId: string, event?: MouseEvent) {
    event?.stopPropagation();
    this.openTabs.update((tabs) => tabs.filter((t) => t.id !== tabId));
    // If closing the active tab, switch to the last remaining tab or clear
    if (this.activeTabId() === tabId) {
      const remaining = this.openTabs();
      if (remaining.length > 0) {
        const last = remaining[remaining.length - 1];
        this.activeTabId.set(last.id);
      } else {
        this.activeTabId.set('');
      }
    }
  }

  switchTab(tabId: string) {
    this.activeTabId.set(tabId);
  }

  closeEditor() {
    // Close all tabs
    this.openTabs.set([]);
    this.activeTabId.set('');
    this.loadWorkspace();
  }

  async openShareModal(doc: DocumentDto) {
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

  async removeSharedAccess(docId: string, userId: string) {
    if (!confirm('Remove shared access for this user?')) return;

    try {
      await this.documentService.removeSharedAccess(docId, userId);
      const doc = this.myDocuments().find((d) => d.id === docId);
      if (doc) {
        doc.sharedWith = doc.sharedWith.filter((s) => s.userId !== userId);
        this.myDocuments.set([...this.myDocuments()]);
      }
      const selected = this.selectedDocForShare();
      if (selected && selected.id === docId) {
        this.selectedDocForShare.set({
          ...selected,
          sharedWith: (selected.sharedWith || []).filter((s) => s.userId !== userId),
        });
      }
    } catch (error) {
      console.error('Error removing shared access:', error);
      alert('Failed to remove shared access');
    }
  }

  async updateSharedAccessLevel(docId: string, userId: string, newAccessLevel: string) {
    try {
      await this.documentService.updateSharedAccessLevel(docId, userId, newAccessLevel);
      const doc = this.myDocuments().find((d) => d.id === docId);
      if (doc) {
        const sharedUser = doc.sharedWith.find((s) => s.userId === userId);
        if (sharedUser) {
          sharedUser.accessLevel = newAccessLevel;
          this.myDocuments.set([...this.myDocuments()]);
        }
      }
      this.editingAccessLevelFor.set(null);
      alert('Access level updated successfully');
    } catch (error) {
      console.error('Error updating access level:', error);
      alert('Failed to update access level');
    }
  }

  async updateDefaultAccessLevel() {
    const doc = this.selectedDocForShare();
    if (!doc) return;

    try {
      await this.documentService.updateShareCodeAccessLevel(doc.id, this.defaultAccessLevel());
      const updatedDocs = this.myDocuments().map((d) =>
        d.id === doc.id ? { ...d, defaultAccessLevel: this.defaultAccessLevel() } : d,
      );
      this.myDocuments.set(updatedDocs);
    } catch (error) {
      console.error('Error updating default access level:', error);
      alert('Failed to update default access level');
    }
  }

  confirmDelete(docId: string) {
    this.deleteDocId.set(docId);
    this.showDeleteConfirm.set(true);
  }

  async deleteDocument() {
    const docId = this.deleteDocId();
    if (!docId) return;

    // 1. Immediately purge from root / all documents signal
    this.myDocuments.update((docs) => docs.filter((d) => d.id !== docId));

    // 2. Immediately purge from all subfolder document cache maps
    this.folderChildDocs.update((prev) => {
      const updated = { ...prev };
      for (const fId in updated) {
        updated[fId] = updated[fId].filter((d) => d.id !== docId);
      }
      return updated;
    });

    // 3. Close open editor tabs for deleted document
    this.openTabs.update((tabs) => tabs.filter((t) => t.id !== docId));
    if (this.activeTabId() === docId) {
      const remaining = this.openTabs();
      this.activeTabId.set(remaining.length > 0 ? remaining[remaining.length - 1].id : '');
    }

    this.showDeleteConfirm.set(false);
    this.deleteDocId.set('');

    try {
      await this.documentService.deleteDocument(docId);
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document');
      await this.loadWorkspace();
    }
  }

  logout() {
    this.authService.logout();
  }

  goToAddShared() {
    this.router.navigate(['/add-shared']);
  }
}
