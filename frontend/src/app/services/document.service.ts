import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface DocumentDto {
  id: string;
  title: string;
  content: string;
  ownerId: string;
  ownerName?: string;
  shareCode?: string;
  createdAt: string;
  updatedAt: string;
  lastEditedAt?: string;
  lastEditedBy?: string;
  sharedWith: SharedDocumentDto[];
}

export interface SharedDocumentDto {
  id: string;
  documentId: string;
  documentTitle: string;
  userId: string;
  userName?: string;
  sharedAt: string;
  accessLevel: string;
}

export interface CreateDocumentRequest {
  title: string;
  content?: string;
}

export interface UpdateDocumentRequest {
  title?: string;
  content?: string;
  lastEditedBy?: string;
}

export interface DocumentContentUpdateRequest {
  content: string;
  lastEditedBy?: string;
}

export interface AddSharedDocumentRequest {
  shareCode: string;
  accessLevel?: string;
}

@Injectable({
  providedIn: 'root',
})
export class DocumentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'https://localhost:7001/api/documents';

  async getMyDocuments(): Promise<DocumentDto[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<DocumentDto[]>(`${this.apiUrl}/my-documents`)
      );
      return response;
    } catch (error) {
      console.error('Error fetching documents:', error);
      throw error;
    }
  }

  async getSharedDocuments(): Promise<SharedDocumentDto[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<SharedDocumentDto[]>(`${this.apiUrl}/shared-with-me`)
      );
      return response;
    } catch (error) {
      console.error('Error fetching shared documents:', error);
      throw error;
    }
  }

  async getDocument(id: string): Promise<DocumentDto> {
    try {
      const response = await firstValueFrom(this.http.get<DocumentDto>(`${this.apiUrl}/${id}`));
      return response;
    } catch (error) {
      console.error('Error fetching document:', error);
      throw error;
    }
  }

  async createDocument(request: CreateDocumentRequest): Promise<DocumentDto> {
    try {
      const response = await firstValueFrom(this.http.post<DocumentDto>(`${this.apiUrl}`, request));
      return response;
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  }

  async updateDocument(id: string, request: UpdateDocumentRequest): Promise<DocumentDto> {
    try {
      const response = await firstValueFrom(
        this.http.put<DocumentDto>(`${this.apiUrl}/${id}`, request)
      );
      return response;
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  }

  async updateContent(id: string, request: DocumentContentUpdateRequest): Promise<DocumentDto> {
    try {
      const response = await firstValueFrom(
        this.http.put<DocumentDto>(`${this.apiUrl}/${id}/content`, request)
      );
      return response;
    } catch (error) {
      console.error('Error updating content:', error);
      throw error;
    }
  }

  async deleteDocument(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`${this.apiUrl}/${id}`));
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  async generateShareCode(id: string): Promise<DocumentDto> {
    try {
      const response = await firstValueFrom(
        this.http.post<DocumentDto>(`${this.apiUrl}/${id}/generate-share-code`, {})
      );
      return response;
    } catch (error) {
      console.error('Error generating share code:', error);
      throw error;
    }
  }

  async getDocumentByShareCode(shareCode: string): Promise<DocumentDto> {
    try {
      const response = await firstValueFrom(
        this.http.get<DocumentDto>(`${this.apiUrl}/share/${shareCode}`)
      );
      return response;
    } catch (error) {
      console.error('Error fetching document by share code:', error);
      throw error;
    }
  }

  async addSharedDocument(shareCode: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.apiUrl}/add-shared`, { shareCode }));
    } catch (error) {
      console.error('Error adding shared document:', error);
      throw error;
    }
  }

  async removeSharedAccess(documentId: string, sharedUserId: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`${this.apiUrl}/${documentId}/shared/${sharedUserId}`));
    } catch (error) {
      console.error('Error removing shared access:', error);
      throw error;
    }
  }

  async updateSharedAccessLevel(
    documentId: string,
    sharedUserId: string,
    accessLevel: string
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.http.put(`${this.apiUrl}/${documentId}/shared/${sharedUserId}/access-level`, {
          accessLevel,
        })
      );
    } catch (error) {
      console.error('Error updating access level:', error);
      throw error;
    }
  }

  async updateShareCodeAccessLevel(documentId: string, accessLevel: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.put(`${this.apiUrl}/${documentId}/share-code-access-level`, {
          accessLevel,
        })
      );
    } catch (error) {
      console.error('Error updating share code access level:', error);
      throw error;
    }
  }
}
