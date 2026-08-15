import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { appEndpoints } from '../app-endpoints';
import { AuthService } from './auth.service';

export interface WorkspaceSyncRequest {
  projectId?: string;
  files: Record<string, string>;
  lockedFiles?: string[];
}

export interface WorkspaceSyncResponse {
  status: string;
  projectId: string;
  syncedCount: number;
  hashes: Record<string, string>;
  timestamp: number;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class WorkspaceSyncService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly isSyncing = signal<boolean>(false);
  readonly lastSyncTime = signal<number | null>(null);
  readonly syncError = signal<string | null>(null);
  readonly syncedHashes = signal<Record<string, string>>({});

  private getAuthHeaders(): { [header: string]: string } {
    const token = this.authService.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private getBaseUrl(): string {
    return appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || window.location.origin;
  }

  /**
   * Performs atomic workspace disk synchronization over dedicated REST endpoint.
   * Decoupled from terminal interactive WebSocket keystroke streams.
   */
  async syncWorkspace(
    projectId: string,
    files: Record<string, string>,
    lockedFiles: string[] = [],
  ): Promise<WorkspaceSyncResponse> {
    if (!files || Object.keys(files).length === 0) {
      return {
        status: 'ok',
        projectId: projectId || 'default',
        syncedCount: 0,
        hashes: {},
        timestamp: Date.now(),
      };
    }

    const safeProjectId = projectId || 'default';
    const url = `${this.getBaseUrl()}/api/workspaces/${encodeURIComponent(safeProjectId)}/sync`;
    const payload: WorkspaceSyncRequest = {
      projectId: safeProjectId,
      files,
      lockedFiles,
    };

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<WorkspaceSyncResponse>(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(),
          },
        }),
      );

      this.lastSyncTime.set(response.timestamp || Date.now());
      if (response.hashes) {
        this.syncedHashes.set({ ...this.syncedHashes(), ...response.hashes });
      }
      return response;
    } catch (err: any) {
      const errorMsg = err?.error?.error || err?.message || 'Failed to atomically sync workspace files';
      this.syncError.set(errorMsg);
      throw new Error(errorMsg);
    } finally {
      this.isSyncing.set(false);
    }
  }

  /**
   * Retrieves file hashes and status for a workspace from the gateway.
   */
  async getWorkspaceFiles(projectId: string): Promise<Record<string, string>> {
    const safeProjectId = projectId || 'default';
    const url = `${this.getBaseUrl()}/api/workspaces/${encodeURIComponent(safeProjectId)}/sync`;

    try {
      const res = await firstValueFrom(
        this.http.get<{ status: string; projectId: string; files: Record<string, string> }>(url, {
          headers: this.getAuthHeaders(),
        }),
      );
      return res?.files || {};
    } catch (err) {
      console.warn(`[WorkspaceSyncService] Failed to retrieve workspace files for ${safeProjectId}:`, err);
      return {};
    }
  }
}
