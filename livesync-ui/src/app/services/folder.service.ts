import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { appEndpoints } from '../app-endpoints';
import { DocumentDto, FolderPathNode } from './document.service';

export interface FolderDto {
  id: string;
  name: string;
  ownerId: string;
  parentFolderId?: string;
  shareCode: string;
  defaultAccessLevel: string;
  createdAt: string;
  updatedAt: string;
  subfoldersCount: number;
  documentsCount: number;
  subfolders: FolderDto[];
  documents: DocumentDto[];
  folderPath?: FolderPathNode[];
  isStructural?: boolean;
  isShared?: boolean;
  permission?: string;
}

export interface SharedFolderDto {
  id: string;
  folderId: string;
  folderName: string;
  ownerId: string;
  ownerEmail: string;
  sharedAt: string;
  accessLevel: string;
  pathIds?: string[];
  pathNames?: string[];
}

@Injectable({
  providedIn: 'root',
})
export class FolderService {
  private readonly http = inject(HttpClient);

  async createFolder(name: string, parentFolderId?: string): Promise<FolderDto> {
    return firstValueFrom(
      this.http.post<FolderDto>(`${appEndpoints.apiBaseUrl}/api/folders`, {
        name,
        parentFolderId: parentFolderId || null,
      })
    );
  }

  async getMyFolders(): Promise<FolderDto[]> {
    return firstValueFrom(
      this.http.get<FolderDto[]>(`${appEndpoints.apiBaseUrl}/api/folders/my-folders`)
    );
  }

  async getSharedFolders(): Promise<SharedFolderDto[]> {
    return firstValueFrom(
      this.http.get<SharedFolderDto[]>(`${appEndpoints.apiBaseUrl}/api/folders/shared-with-me`)
    );
  }

  async getSharedFolderDetails(): Promise<FolderDto[]> {
    return firstValueFrom(
      this.http.get<FolderDto[]>(`${appEndpoints.apiBaseUrl}/api/folders/shared-with-me/details`)
    );
  }

  async getFolder(id: string): Promise<FolderDto> {
    return firstValueFrom(
      this.http.get<FolderDto>(`${appEndpoints.apiBaseUrl}/api/folders/${id}`)
    );
  }

  async updateFolder(id: string, name: string): Promise<FolderDto> {
    return firstValueFrom(
      this.http.put<FolderDto>(`${appEndpoints.apiBaseUrl}/api/folders/${id}`, { name })
    );
  }

  async deleteFolder(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${appEndpoints.apiBaseUrl}/api/folders/${id}`)
    );
  }

  async moveDocument(documentId: string, folderId: string | null): Promise<void> {
    await firstValueFrom(
      this.http.put(`${appEndpoints.apiBaseUrl}/api/folders/move-document/${documentId}`, {
        folderId,
      })
    );
  }

  async moveFolder(folderId: string, targetParentFolderId: string | null): Promise<void> {
    await firstValueFrom(
      this.http.put(`${appEndpoints.apiBaseUrl}/api/folders/move-folder/${folderId}`, {
        targetParentFolderId,
      })
    );
  }

  async joinSharedFolder(shareCode: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${appEndpoints.apiBaseUrl}/api/folders/add-shared`, {
        shareCode,
      })
    );
  }
}
