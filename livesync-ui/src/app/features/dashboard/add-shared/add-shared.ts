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
    try {
      const doc = await this.documentService.getDocumentByShareCode(code);
      if (doc) {
        this.documentPreview.set(doc);
      } else {
        this.errorMessage.set('Document not found with this share code');
      }
    } catch (error) {
      this.errorMessage.set('Invalid share code or an error occurred');
      this.documentPreview.set(null);
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
      // Try document share code first
      await this.documentService.addSharedDocument(code);
      this.successMessage.set('Document added successfully! Redirecting to dashboard...');
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 1500);
    } catch (docError: any) {
      // If document share code fails, try folder share code
      try {
        await this.folderService.joinSharedFolder(code);
        this.successMessage.set('Folder joined successfully! Redirecting to dashboard...');
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 1500);
      } catch (folderError: any) {
        if (docError.status === 400) {
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

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
