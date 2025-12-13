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
import { AuthService } from '../../services/auth.service';
import { DocumentService, DocumentDto, SharedDocumentDto } from '../../services/document.service';
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
    Editor,
    DatePipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly documentService = inject(DocumentService);
  private readonly router = inject(Router);

  myDocuments = signal<DocumentDto[]>([]);
  sharedDocuments = signal<SharedDocumentDto[]>([]);
  isLoading = signal(false);
  isCreating = signal(false);
  newDocTitle = signal('');
  showShareModal = signal(false);
  selectedDocForShare = signal<DocumentDto | null>(null);
  shareCode = signal('');
  showDeleteConfirm = signal(false);
  showEditorModal = signal(false);
  selectedDocId = signal<string>('');
  deleteDocId = signal('');
  defaultAccessLevel = signal<string>('View');
  editingAccessLevelFor = signal<string | null>(null);

  async ngOnInit() {
    await this.loadDocuments();
  }

  async loadDocuments() {
    this.isLoading.set(true);
    try {
      const [myDocs, sharedDocs] = await Promise.all([
        this.documentService.getMyDocuments(),
        this.documentService.getSharedDocuments(),
      ]);
      this.myDocuments.set(myDocs);
      this.sharedDocuments.set(sharedDocs);
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      this.isLoading.set(false);
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
    // Reload documents to reflect any changes
    this.loadDocuments();
  }

  async openShareModal(doc: DocumentDto) {
    this.selectedDocForShare.set(doc);
    // Initialize default access level from document (default to 'View' if not set)
    this.defaultAccessLevel.set((doc as any).defaultAccessLevel || 'View');

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
      // Update local state
      const updatedDocs = this.myDocuments().map((d) =>
        d.id === doc.id ? { ...d, defaultAccessLevel: this.defaultAccessLevel() } : d
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
