import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
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
import { DocumentService, DocumentDto, SharedDocumentDto } from '../../services/document.service';
import { FolderService, FolderDto, SharedFolderDto } from '../../services/folder.service';
import { Editor } from '../editor/editor';

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
    DatePipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly documentService = inject(DocumentService);
  private readonly folderService = inject(FolderService);
  private readonly router = inject(Router);

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
  showEditorModal = signal(false);
  selectedDocId = signal<string>('');
  deleteDocId = signal('');
  defaultAccessLevel = signal<string>('View');
  editingAccessLevelFor = signal<string | null>(null);

  // Search & Views
  searchQuery = signal<string>('');
  activeTab = signal<'all' | 'folders' | 'mine' | 'shared' | 'favorites'>('all');
  layoutView = signal<'grid' | 'list'>('grid');
  starredDocIds = signal<Set<string>>(new Set(['starred_sample']));

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
      return matchesSearch && matchesTab;
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
    return this.myFolders().filter((f) => !q || f.name.toLowerCase().includes(q));
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
    await this.loadWorkspace();
  }

  async loadWorkspace() {
    this.isLoading.set(true);
    try {
      const [myDocs, sharedDocs, folders, sharedF] = await Promise.all([
        this.documentService.getMyDocuments(),
        this.documentService.getSharedDocuments(),
        this.folderService.getMyFolders(),
        this.folderService.getSharedFolders(),
      ]);
      this.myDocuments.set(myDocs);
      this.sharedDocuments.set(sharedDocs);
      this.myFolders.set(folders);
      this.sharedFolders.set(sharedF);
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
      await this.folderService.createFolder(name, this.currentFolderId() || undefined);
      this.showCreateFolderModal.set(false);
      this.newFolderName.set('');

      if (this.currentFolderId()) {
        const details = await this.folderService.getFolder(this.currentFolderId()!);
        this.myFolders.set(details.subfolders || []);
      } else {
        const rootFolders = await this.folderService.getMyFolders();
        this.myFolders.set(rootFolders);
      }
    } catch (err) {
      console.error('Error creating folder:', err);
      alert('Failed to create folder');
    }
  }

  async deleteFolder(folderId: string, event?: Event) {
    if (event) event.stopPropagation();
    if (!confirm('Delete this folder? Documents inside will be moved to root workspace.')) return;

    try {
      await this.folderService.deleteFolder(folderId);
      this.myFolders.update((f) => f.filter((item) => item.id !== folderId));
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
    this.selectedFolderForShare.set(folder);
    this.folderShareCode.set(folder.shareCode);
    this.showShareFolderModal.set(true);
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

  openDocument(docId: string) {
    this.selectedDocId.set(docId);
    this.showEditorModal.set(true);
  }

  openSharedDoc(docId: string) {
    this.selectedDocId.set(docId);
    this.showEditorModal.set(true);
  }

  closeEditor() {
    this.showEditorModal.set(false);
    this.selectedDocId.set('');
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

    try {
      await this.documentService.deleteDocument(docId);
      this.myDocuments.update((docs) => docs.filter((d) => d.id !== docId));
      this.showDeleteConfirm.set(false);
      this.deleteDocId.set('');
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document');
    }
  }

  logout() {
    this.authService.logout();
  }

  goToAddShared() {
    this.router.navigate(['/add-shared']);
  }
}
