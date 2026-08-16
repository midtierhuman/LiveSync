import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { appEndpoints } from '../app-endpoints';
import { AuthService } from './auth.service';

export interface SearchMatch {
  lineNumber: number;
  lineContent: string;
  preview: string;
  startColumn: number;
  endColumn: number;
  matchText: string;
}

export interface FileSearchResult {
  file: string;
  matchCount: number;
  matches: SearchMatch[];
}

export interface WorkspaceSearchResponse {
  status: string;
  projectId: string;
  query: string;
  totalMatches: number;
  totalFiles: number;
  durationMs: number;
  results: FileSearchResult[];
  error?: string;
}

export interface WorkspaceReplaceRequest {
  projectId?: string;
  query: string;
  replacement: string;
  isRegex?: boolean;
  matchCase?: boolean;
  matchWholeWord?: boolean;
  files?: string[];
  targetFile?: string;
  targetLine?: number;
  targetStartCol?: number;
  targetEndCol?: number;
}

export interface WorkspaceReplaceResponse {
  status: string;
  projectId: string;
  replacedMatches: number;
  replacedFiles: number;
  updatedFiles?: Record<string, string>;
  timestamp: number;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class WorkspaceSearchService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  // Search input state
  readonly query = signal<string>('');
  readonly replaceText = signal<string>('');
  readonly isReplaceOpen = signal<boolean>(false);
  readonly isRegex = signal<boolean>(false);
  readonly matchCase = signal<boolean>(false);
  readonly matchWholeWord = signal<boolean>(false);
  readonly includePattern = signal<string>('');
  readonly excludePattern = signal<string>('');
  readonly showFilters = signal<boolean>(false);

  // Result state
  readonly isSearching = signal<boolean>(false);
  readonly isReplacing = signal<boolean>(false);
  readonly searchResults = signal<FileSearchResult[]>([]);
  readonly totalMatches = signal<number>(0);
  readonly totalFiles = signal<number>(0);
  readonly searchDurationMs = signal<number>(0);
  readonly searchError = signal<string | null>(null);
  readonly collapsedFiles = signal<Set<string>>(new Set<string>());

  private getAuthHeaders(): { [header: string]: string } {
    const token = this.authService.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private getBaseUrl(): string {
    return appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || window.location.origin;
  }

  toggleFileCollapse(filePath: string): void {
    this.collapsedFiles.update((set) => {
      const next = new Set(set);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }

  collapseAll(): void {
    const allFiles = this.searchResults().map((r) => r.file);
    this.collapsedFiles.set(new Set(allFiles));
  }

  expandAll(): void {
    this.collapsedFiles.set(new Set());
  }

  clearSearch(): void {
    this.query.set('');
    this.searchResults.set([]);
    this.totalMatches.set(0);
    this.totalFiles.set(0);
    this.searchDurationMs.set(0);
    this.searchError.set(null);
    this.collapsedFiles.set(new Set());
  }

  async search(projectId: string, explicitQuery?: string): Promise<WorkspaceSearchResponse> {
    const q = explicitQuery !== undefined ? explicitQuery : this.query();
    if (explicitQuery !== undefined) {
      this.query.set(explicitQuery);
    }

    if (!q || !q.trim()) {
      this.clearSearch();
      return {
        status: 'ok',
        projectId: projectId || 'default',
        query: '',
        totalMatches: 0,
        totalFiles: 0,
        durationMs: 0,
        results: [],
      };
    }

    this.isSearching.set(true);
    this.searchError.set(null);

    try {
      const safeId = encodeURIComponent(projectId || 'default');
      let params = new HttpParams()
        .set('query', q)
        .set('isRegex', String(this.isRegex()))
        .set('matchCase', String(this.matchCase()))
        .set('matchWholeWord', String(this.matchWholeWord()));

      if (this.includePattern().trim()) {
        params = params.set('include', this.includePattern().trim());
      }
      if (this.excludePattern().trim()) {
        params = params.set('exclude', this.excludePattern().trim());
      }

      const url = `${this.getBaseUrl()}/api/workspaces/${safeId}/search`;
      const response = await firstValueFrom(
        this.http.get<WorkspaceSearchResponse>(url, {
          headers: this.getAuthHeaders(),
          params,
        }),
      );

      this.searchResults.set(response.results || []);
      this.totalMatches.set(response.totalMatches || 0);
      this.totalFiles.set(response.totalFiles || 0);
      this.searchDurationMs.set(response.durationMs || 0);
      this.collapsedFiles.set(new Set());

      return response;
    } catch (err: any) {
      console.error('[WorkspaceSearch] Search error:', err);
      const msg = err.error?.error || err.message || 'Failed to search workspace';
      this.searchError.set(msg);
      this.searchResults.set([]);
      this.totalMatches.set(0);
      this.totalFiles.set(0);
      return {
        status: 'error',
        projectId: projectId || 'default',
        query: q,
        totalMatches: 0,
        totalFiles: 0,
        durationMs: 0,
        results: [],
        error: msg,
      };
    } finally {
      this.isSearching.set(false);
    }
  }

  async replaceAll(projectId: string, replacementText?: string): Promise<WorkspaceReplaceResponse> {
    const q = this.query();
    const rep = replacementText !== undefined ? replacementText : this.replaceText();
    if (!q) {
      return {
        status: 'error',
        projectId: projectId || 'default',
        replacedMatches: 0,
        replacedFiles: 0,
        timestamp: Date.now(),
        error: 'Search query cannot be empty',
      };
    }

    this.isReplacing.set(true);
    try {
      const safeId = encodeURIComponent(projectId || 'default');
      const payload: WorkspaceReplaceRequest = {
        projectId: projectId || 'default',
        query: q,
        replacement: rep,
        isRegex: this.isRegex(),
        matchCase: this.matchCase(),
        matchWholeWord: this.matchWholeWord(),
      };

      const url = `${this.getBaseUrl()}/api/workspaces/${safeId}/replace`;
      const response = await firstValueFrom(
        this.http.post<WorkspaceReplaceResponse>(url, payload, {
          headers: this.getAuthHeaders(),
        }),
      );

      // Re-run search to refresh current results view
      await this.search(projectId);
      return response;
    } catch (err: any) {
      console.error('[WorkspaceSearch] Replace error:', err);
      const msg = err.error?.error || err.message || 'Failed to replace in workspace';
      this.searchError.set(msg);
      return {
        status: 'error',
        projectId: projectId || 'default',
        replacedMatches: 0,
        replacedFiles: 0,
        timestamp: Date.now(),
        error: msg,
      };
    } finally {
      this.isReplacing.set(false);
    }
  }

  async replaceSingleMatch(
    projectId: string,
    file: string,
    match: SearchMatch,
    replacementText?: string,
  ): Promise<WorkspaceReplaceResponse> {
    const q = this.query();
    const rep = replacementText !== undefined ? replacementText : this.replaceText();
    this.isReplacing.set(true);

    try {
      const safeId = encodeURIComponent(projectId || 'default');
      const payload: WorkspaceReplaceRequest = {
        projectId: projectId || 'default',
        query: q,
        replacement: rep,
        targetFile: file,
        targetLine: match.lineNumber,
        targetStartCol: match.startColumn,
        targetEndCol: match.endColumn,
      };

      const url = `${this.getBaseUrl()}/api/workspaces/${safeId}/replace`;
      const response = await firstValueFrom(
        this.http.post<WorkspaceReplaceResponse>(url, payload, {
          headers: this.getAuthHeaders(),
        }),
      );

      // Re-run search to refresh current results view
      await this.search(projectId);
      return response;
    } catch (err: any) {
      console.error('[WorkspaceSearch] Single replace error:', err);
      const msg = err.error?.error || err.message || 'Failed to replace match';
      this.searchError.set(msg);
      return {
        status: 'error',
        projectId: projectId || 'default',
        replacedMatches: 0,
        replacedFiles: 0,
        timestamp: Date.now(),
        error: msg,
      };
    } finally {
      this.isReplacing.set(false);
    }
  }
}
