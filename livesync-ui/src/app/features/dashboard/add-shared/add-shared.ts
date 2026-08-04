import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe, SlicePipe } from '@angular/common';
import { DocumentService } from '../../../services/document.service';

@Component({
  selector: 'app-add-shared',
  standalone: true,
  imports: [FormsModule, DatePipe, SlicePipe],
  templateUrl: './add-shared.html',
  styleUrl: './add-shared.scss',
})
export class AddShared {
  private readonly documentService = inject(DocumentService);
  private readonly router = inject(Router);

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
      await this.documentService.addSharedDocument(code);
      this.successMessage.set('Document added successfully! Redirecting to dashboard...');
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 1500);
    } catch (error: any) {
      if (error.status === 400) {
        this.errorMessage.set('You already have access to this document or the code is invalid');
      } else {
        this.errorMessage.set('Failed to add document');
      }
      this.documentPreview.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
