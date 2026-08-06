import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { appEndpoints } from '../app-endpoints';

export interface DocumentDto {
  id: string;
  title: string;
  content: string;
  ownerId: string;
  folderId?: string;
  ownerName?: string;
  shareCode?: string;
  defaultAccessLevel: string;
  createdAt: string;
  updatedAt: string;
  lastEditedAt?: string;
  lastEditedBy?: string;
  sharedWith: SharedDocumentDto[];
}

export interface FolderPathNode {
  id: string;
  name: string;
}

export interface SharedDocumentDto {
  id: string;
  documentId: string;
  documentTitle: string;
  userId: string;
  userName?: string;
  sharedAt: string;
  accessLevel: string;
  folderPath?: FolderPathNode[];
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

export interface DocumentAccessResponse {
  accessLevel: string;
}

export interface ExecuteDocumentRequest {
  language: string;
  standardInput?: string;
  code: string;
}

export interface DocumentExecutionResponse {
  documentId: string;
  language: string;
  status: string;
  isSuccess: boolean;
  message: string;
  standardOutput?: string;
  standardError?: string;
  executionDurationMs?: number;
  peakMemoryBytes?: number;
  cpuTimeMs?: number;
  timeComplexity?: string;
  spaceComplexity?: string;
  complexityExplanation?: string;
  requestedAt: string;
  completedAt: string;
}

export interface ExecutionLanguageDescriptor {
  id?: string;
  name: string;
  displayName: string;
}

export interface AiAnalysisResponse {
  action: string;
  language: string;
  explanation: string;
  suggestions: string[];
  generatedCode?: string;
}

interface MessageResponse {
  message: string;
}


@Injectable({
  providedIn: 'root',
})
export class DocumentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${appEndpoints.apiBaseUrl}/api/documents`;
  private readonly sandboxUrl = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl;

  async getMyDocuments(): Promise<DocumentDto[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<DocumentDto[]>(`${this.apiUrl}/my-documents`),
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
        this.http.get<SharedDocumentDto[]>(`${this.apiUrl}/shared-with-me`),
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

  async getAccessLevel(id: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.get<DocumentAccessResponse>(`${this.apiUrl}/${id}/access`),
      );
      return response.accessLevel;
    } catch (error) {
      console.error('Error fetching document access:', error);
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
        this.http.put<DocumentDto>(`${this.apiUrl}/${id}`, request),
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
        this.http.put<DocumentDto>(`${this.apiUrl}/${id}/content`, request),
      );
      return response;
    } catch (error: any) {
      console.error('Error updating content:', error);
      const serverMessage = (typeof error?.error?.message === 'string' ? error.error.message : error?.message || '');
      const isExplicitPermission = 
        serverMessage.toLowerCase().includes('access') ||
        serverMessage.toLowerCase().includes('edit') ||
        serverMessage.toLowerCase().includes('permission') ||
        serverMessage.toLowerCase().includes('owner');

      if (error.status === 403 && isExplicitPermission) {
        const permissionError = new Error(
          serverMessage || 'Permission denied: You no longer have edit access to this document',
        );
        (permissionError as any).status = 403;
        (permissionError as any).isPermissionError = true;
        throw permissionError;
      }
      throw error;
    }
  }

  async executeDocument(
    id: string,
    request: ExecuteDocumentRequest,
  ): Promise<DocumentExecutionResponse> {
    try {
      const response = await firstValueFrom(
        this.http.post<DocumentExecutionResponse>(`${this.sandboxUrl}/api/execution/run`, {
          language: request.language,
          code: request.code,
          standardInput: request.standardInput,
        }),
      );
      return { ...response, documentId: id };
    } catch (error) {
      console.error('Error executing document:', error);
      throw error;
    }
  }

  async getExecutionLanguages(): Promise<ExecutionLanguageDescriptor[]> {
    try {
      return await firstValueFrom(
        this.http.get<ExecutionLanguageDescriptor[]>(`${this.sandboxUrl}/api/execution/languages`),
      );
    } catch (error) {
      console.error('Error fetching execution languages:', error);
      throw error;
    }
  }

  async aiAssistant(
    id: string,
    action: string,
    language: string,
    code?: string,
    prompt?: string,
  ): Promise<AiAnalysisResponse> {
    try {
      return await firstValueFrom(
        this.http.post<AiAnalysisResponse>(`${this.sandboxUrl}/api/ai/analyze`, {
          action,
          language,
          code,
          prompt,
        }),
      );
    } catch (error) {
      console.error('Error running AI assistant:', error);
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
        this.http.post<DocumentDto>(`${this.apiUrl}/${id}/generate-share-code`, {}),
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
        this.http.get<DocumentDto>(`${this.apiUrl}/share/${shareCode}`),
      );
      return response;
    } catch (error) {
      console.error('Error fetching document by share code:', error);
      throw error;
    }
  }

  async addSharedDocument(shareCode: string): Promise<MessageResponse> {
    try {
      return await firstValueFrom(
        this.http.post<MessageResponse>(`${this.apiUrl}/add-shared`, { shareCode }),
      );
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
    accessLevel: string,
  ): Promise<MessageResponse> {
    try {
      return await firstValueFrom(
        this.http.put<MessageResponse>(
          `${this.apiUrl}/${documentId}/shared/${sharedUserId}/access-level`,
          { accessLevel },
        ),
      );
    } catch (error) {
      console.error('Error updating access level:', error);
      throw error;
    }
  }

  async updateShareCodeAccessLevel(
    documentId: string,
    accessLevel: string,
  ): Promise<MessageResponse> {
    try {
      return await firstValueFrom(
        this.http.put<MessageResponse>(`${this.apiUrl}/${documentId}/share-code-access-level`, {
          accessLevel,
        }),
      );
    } catch (error) {
      console.error('Error updating share code access level:', error);
      throw error;
    }
  }
}
