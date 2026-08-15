import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
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
import {
  ShareModalComponent,
  ConfirmDeleteModalComponent,
  MoveModalComponent,
  CreateFileModalComponent,
  TargetFolderOption,
  CreateFileSubmitPayload,
} from '../../shared/components/modals';

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
    ShareModalComponent,
    ConfirmDeleteModalComponent,
    CreateFileModalComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly documentService = inject(DocumentService);
  private readonly folderService = inject(FolderService);
  private readonly router = inject(Router);

  // Projects and Documents State
  myFolders = signal<FolderDto[]>([]);
  myDocuments = signal<DocumentDto[]>([]);
  sharedDocuments = signal<SharedDocumentDto[]>([]);
  sharedFolders = signal<SharedFolderDto[]>([]);
  sharedFolderTree = signal<FolderDto[]>([]);

  isLoading = signal(false);
  searchQuery = signal<string>('');

  // Modals State
  showCreateFolderModal = signal(false);
  newFolderName = signal('');

  showCreateFilePrompt = signal(false);
  targetFolderForNewFile = signal<string | null>(null);

  showShareFolderModal = signal(false);
  selectedFolderForShare = signal<FolderDto | null>(null);
  folderShareCode = signal('');

  showDeleteConfirm = signal(false);
  deleteFolderId = signal('');
  deleteFolderName = signal('');

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

  filteredMyProjects = computed<FolderDto[]>(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.myFolders();
    return this.myFolders().filter((f) => f.name.toLowerCase().includes(q));
  });

  filteredSharedProjects = computed<FolderDto[]>(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.sharedFolderTree();
    return this.sharedFolderTree().filter((f) => f.name.toLowerCase().includes(q));
  });

  ngOnInit() {
    this.loadWorkspace();
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
    } catch (error) {
      console.error('Error loading workspace:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  openProjectInIDE(folder: FolderDto) {
    this.router.navigate(['/workspace', encodeURIComponent(folder.name)], {
      queryParams: { id: folder.id },
    });
  }

  openCreateFolderModal() {
    this.newFolderName.set('');
    this.showCreateFolderModal.set(true);
  }

  async createFolder() {
    const name = this.newFolderName().trim();
    if (!name) return;

    try {
      const created = await this.folderService.createFolder(name);
      this.showCreateFolderModal.set(false);
      this.newFolderName.set('');
      await this.loadWorkspace();
      this.openProjectInIDE(created);
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project');
    }
  }

  openCreateFileModal(folderId: string | null = null) {
    this.targetFolderForNewFile.set(folderId);
    this.showCreateFilePrompt.set(true);
  }

  async handleCreateFileSubmit(payload: CreateFileSubmitPayload) {
    const title = payload.title.trim();
    const folderId = payload.folderId;
    if (!title || !folderId) return;
    this.showCreateFilePrompt.set(false);

    try {
      await this.documentService.createDocument({
        title,
        content: '',
        folderId,
      });

      const folder = this.myFolders().find((f) => f.id === folderId) || this.sharedFolderTree().find((f) => f.id === folderId);
      if (folder) {
        this.openProjectInIDE(folder);
      } else {
        await this.loadWorkspace();
      }
    } catch (err) {
      console.error('Error creating file:', err);
      alert('Failed to create file');
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

  copyFolderShareCodeDirect(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      alert(`Share code "${code}" copied to clipboard!`);
    });
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

  confirmDeleteProject(folder: FolderDto, event?: Event) {
    if (event) event.stopPropagation();
    this.deleteFolderId.set(folder.id);
    this.deleteFolderName.set(folder.name);
    this.showDeleteConfirm.set(true);
  }

  async deleteProject() {
    const folderId = this.deleteFolderId();
    if (!folderId) return;

    try {
      await this.folderService.deleteFolder(folderId);
      this.showDeleteConfirm.set(false);
      this.deleteFolderId.set('');
      await this.loadWorkspace();
    } catch (error) {
      console.error('Error deleting folder:', error);
      alert('Failed to delete folder');
    }
  }

  goToAddShared() {
    this.router.navigate(['/add-shared']);
  }

  getFolderDocsCount(folderId: string): number {
    return this.myDocuments().filter((d) => d.folderId === folderId).length;
  }

  getFolderSubfoldersCount(folderId: string): number {
    return this.myFolders().filter((f) => f.parentFolderId === folderId).length;
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

  private ensureFolderPath(roots: FolderDto[], path: FolderPathNode[], terminalFolder?: FolderDto): FolderDto {
    let siblings = roots;
    let current: FolderDto | undefined;
    let parentFolderId: string | undefined;

    path.forEach((node, index) => {
      const isLeaf = index === path.length - 1;
      current = siblings.find((folder) => folder.id === node.id);
      if (!current) {
        current = {
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
        siblings.push(current);
      }
      if (isLeaf && terminalFolder) {
        Object.assign(current, terminalFolder);
      }
      parentFolderId = node.id;
      siblings = current.subfolders;
    });

    return current!;
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

  logout() {
    this.authService.logout();
    this.router.navigate(['/signin']);
  }
}
