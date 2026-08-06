import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe, SlicePipe } from '@angular/common';
import { DocumentService } from '../../../services/document.service';
import { FolderService } from '../../../services/folder.service';

@Component({
  selector: 'app-add-shared',
  standalone: true,
  imports: [FormsModule, DatePipe, SlicePipe],
  templateUrl: './add-shared.html',
  styleUrl: './add-shared.scss',
})
export class AddShared {
  private readonly documentService = inject(DocumentService);
  private readonly folderService = inject(FolderService);
  private readonly router = inject(Router);

  shareType = signal<'document' | 'folder' | null>(null);

  shareCode = signal('');
  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  documentPreview = signal<any>(null);

  async verifyShareCode() {
    const code = this.shareCode().trim().toUpperCase();
    if (!code) {
      this.errorMessage.set('Please enter a share code');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.shareType.set(null);
    this.documentPreview.set(null);

    try {
      const folder = await this.folderService.getFolderByShareCode(code);
      this.shareType.set('folder');
      this.documentPreview.set(folder);
    } catch (folderError) {
      try {
        const doc = await this.documentService.getDocumentByShareCode(code);
        this.shareType.set('document');
        this.documentPreview.set(doc);
      } catch (docError) {
        this.errorMessage.set('No shared file or folder was found for this code');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
  async addDocument() {
    const code = this.shareCode().trim().toUpperCase();
    if (!code) {
      this.errorMessage.set('Please enter a share code');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      if (this.shareType() === 'folder') {
        await this.folderService.joinSharedFolder(code);
        this.successMessage.set('Shared folder added. Redirecting to dashboard...');
        this.redirectToDashboard();
        return;
      }

      if (this.shareType() === 'document') {
        await this.documentService.addSharedDocument(code);
        this.successMessage.set('Shared document added. Redirecting to dashboard...');
        this.redirectToDashboard();
        return;
      }

      await this.documentService.addSharedDocument(code);
      this.successMessage.set('Shared document added. Redirecting to dashboard...');
      this.redirectToDashboard();
    } catch (docError: any) {
      try {
        await this.folderService.joinSharedFolder(code);
        this.successMessage.set('Shared folder added. Redirecting to dashboard...');
        this.redirectToDashboard();
      } catch (folderError: any) {
        if (docError.status === 400 || folderError.status === 400) {
          this.errorMessage.set('You already have access to this item or the code is invalid');
        } else {
          this.errorMessage.set('Failed to join with this share code');
        }
        this.documentPreview.set(null);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  private redirectToDashboard() {
    setTimeout(() => {
      this.router.navigate(['/dashboard']);
    }, 1500);
  }
  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
