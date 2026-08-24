import { Injectable, inject, signal, computed } from '@angular/core';
import { DocumentDto } from './document.service';
import { FolderDto } from './folder.service';

export interface VFSNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string; // e.g. "src/components/Button.tsx"
  parentId: string | null;
  children?: VFSNode[];
}

export interface VFSIndex {
  pathToDocId: Map<string, string>;
  docIdToPath: Map<string, string>;
  folderPathMap: Map<string, string>;
  rootNodes: VFSNode[];
}

@Injectable({
  providedIn: 'root',
})
export class VFSService {
  private readonly foldersSignal = signal<FolderDto[]>([]);
  private readonly documentsSignal = signal<DocumentDto[]>([]);
  private readonly rootFolderIdSignal = signal<string | null>(null);

  /**
   * Computed reactive VFS index mapping relative paths <-> document IDs.
   */
  readonly vfsIndex = computed<VFSIndex>(() => {
    const folders = this.foldersSignal();
    const documents = this.documentsSignal();
    const rootFolderId = this.rootFolderIdSignal();

    const pathToDocId = new Map<string, string>();
    const docIdToPath = new Map<string, string>();
    const folderPathMap = new Map<string, string>();

    // Step 1: Build folder lookup maps with recursive hierarchy flattening
    const folderById = new Map<string, FolderDto>();
    const childrenByParentFolder = new Map<string, FolderDto[]>();

    const flattenAndIndex = (fList: FolderDto[]) => {
      for (const folder of fList) {
        if (!folderById.has(folder.id)) {
          folderById.set(folder.id, folder);
          const pid = folder.parentFolderId || '__root__';
          if (!childrenByParentFolder.has(pid)) {
            childrenByParentFolder.set(pid, []);
          }
          childrenByParentFolder.get(pid)!.push(folder);
        }
        if (folder.subfolders && folder.subfolders.length > 0) {
          flattenAndIndex(folder.subfolders);
        }
      }
    };
    flattenAndIndex(folders);

    // Step 2: Compute canonical relative path for each folder
    const computeFolderPath = (folder: FolderDto): string => {
      if (rootFolderId && folder.id === rootFolderId) {
        return '';
      }
      if (!folder.parentFolderId || (rootFolderId && folder.parentFolderId === rootFolderId)) {
        return folder.name;
      }
      const parent = folderById.get(folder.parentFolderId);
      if (!parent) return folder.name;
      const parentPath = computeFolderPath(parent);
      return parentPath ? `${parentPath}/${folder.name}` : folder.name;
    };

    for (const folder of folders) {
      const fPath = computeFolderPath(folder);
      if (fPath) {
        folderPathMap.set(fPath, folder.id);
      }
    }

    // Step 3: Compute canonical relative path for each document
    for (const doc of documents) {
      let docPath = doc.title;
      if (doc.folderId) {
        const folder = folderById.get(doc.folderId);
        if (folder) {
          const folderPath = computeFolderPath(folder);
          docPath = folderPath ? `${folderPath}/${doc.title}` : doc.title;
        }
      }

      // Normalize slashes
      docPath = docPath.replace(/\\/g, '/');
      pathToDocId.set(docPath, doc.id);
      docIdToPath.set(doc.id, docPath);
    }

    // Step 4: Build tree hierarchy nodes for VFS representation
    const rootNodes: VFSNode[] = [];
    const buildFolderNode = (folder: FolderDto, currentPath: string): VFSNode => {
      const nodePath = currentPath ? `${currentPath}/${folder.name}` : folder.name;
      const children: VFSNode[] = [];

      // Subfolders
      const subfolders = childrenByParentFolder.get(folder.id) || [];
      for (const sf of subfolders) {
        children.push(buildFolderNode(sf, nodePath));
      }

      // Files in this folder
      const filesInFolder = documents.filter((d) => d.folderId === folder.id);
      for (const file of filesInFolder) {
        const filePath = `${nodePath}/${file.title}`;
        children.push({
          id: file.id,
          name: file.title,
          type: 'file',
          path: filePath,
          parentId: folder.id,
        });
      }

      return {
        id: folder.id,
        name: folder.name,
        type: 'folder',
        path: nodePath,
        parentId: folder.parentFolderId || null,
        children,
      };
    };

    const targetRootFolders = rootFolderId
      ? (folderById.has(rootFolderId) ? [folderById.get(rootFolderId)!] : folders.filter((f) => f.id === rootFolderId))
      : folders.filter((f) => !f.parentFolderId);

    for (const rf of targetRootFolders) {
      rootNodes.push(buildFolderNode(rf, ''));
    }

    if (!rootFolderId) {
      const rootDocs = documents.filter((d) => !d.folderId);
      for (const rd of rootDocs) {
        rootNodes.push({
          id: rd.id,
          name: rd.title,
          type: 'file',
          path: rd.title,
          parentId: null,
        });
      }
    }

    return {
      pathToDocId,
      docIdToPath,
      folderPathMap,
      rootNodes,
    };
  });

  /**
   * Updates the source data for the VFS index.
   */
  updateVFSState(folders: FolderDto[], documents: DocumentDto[], scopedRootFolderId: string | null = null): void {
    this.foldersSignal.set(folders);
    this.documentsSignal.set(documents);
    this.rootFolderIdSignal.set(scopedRootFolderId);
  }

  /**
   * Optimistically updates the name/title of a file or folder in memory, immediately invalidating the VFS cache.
   */
  renameItem(type: 'file' | 'folder', id: string, newName: string): void {
    const cleanName = newName.trim();
    if (!cleanName || !id) return;

    if (type === 'file') {
      this.documentsSignal.update((docs) =>
        docs.map((d) => (d.id === id ? { ...d, title: cleanName } : d))
      );
    } else {
      this.foldersSignal.update((folders) =>
        folders.map((f) => (f.id === id ? { ...f, name: cleanName } : f))
      );
    }
  }

  /**
   * Optimistically updates the parent folder of a file or folder in memory.
   */
  moveItem(type: 'file' | 'folder', id: string, targetFolderId: string | null | undefined): void {
    if (!id) return;
    const parentId = targetFolderId || undefined;

    if (type === 'file') {
      this.documentsSignal.update((docs) =>
        docs.map((d) => (d.id === id ? { ...d, folderId: parentId } : d))
      );
    } else {
      this.foldersSignal.update((folders) =>
        folders.map((f) => (f.id === id ? { ...f, parentFolderId: parentId } : f))
      );
    }
  }

  /**
   * Optimistically removes a file or folder (and its children) from VFS memory.
   */
  deleteItem(type: 'file' | 'folder', id: string): void {
    if (!id) return;

    if (type === 'file') {
      this.documentsSignal.update((docs) => docs.filter((d) => d.id !== id));
    } else {
      // Find all descendant folders recursively
      const toDeleteFolderIds = new Set<string>([id]);
      let addedMore = true;
      while (addedMore) {
        addedMore = false;
        for (const f of this.foldersSignal()) {
          if (f.parentFolderId && toDeleteFolderIds.has(f.parentFolderId) && !toDeleteFolderIds.has(f.id)) {
            toDeleteFolderIds.add(f.id);
            addedMore = true;
          }
        }
      }

      this.foldersSignal.update((folders) => folders.filter((f) => !toDeleteFolderIds.has(f.id)));
      this.documentsSignal.update((docs) =>
        docs.filter((d) => !d.folderId || !toDeleteFolderIds.has(d.folderId))
      );
    }
  }

  /**
   * Resolves a document UUID from a relative path (e.g. "src/utils/math.ts").
   */
  getDocumentIdByPath(path: string): string | undefined {
    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
    return this.vfsIndex().pathToDocId.get(normalized);
  }

  /**
   * Gets the canonical relative path for a document UUID.
   */
  getPathByDocumentId(documentId: string): string | undefined {
    return this.vfsIndex().docIdToPath.get(documentId);
  }

  /**
   * Resolves an import statement relative to the current file path.
   * Example: fromPath = "src/components/Header.tsx", importSpecifier = "../utils/math"
   * Returns: "src/utils/math" (or matched document path with extension).
   */
  resolveImportPath(fromPath: string, importSpecifier: string): string | null {
    if (!importSpecifier.startsWith('.')) {
      // Non-relative package import (e.g. "lodash", "react")
      return null;
    }

    const fromDir = fromPath.includes('/') ? fromPath.substring(0, fromPath.lastIndexOf('/')) : '';
    const rawSegments = (fromDir ? `${fromDir}/${importSpecifier}` : importSpecifier).split('/');
    const resolvedSegments: string[] = [];

    for (const seg of rawSegments) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') {
        if (resolvedSegments.length > 0) {
          resolvedSegments.pop();
        }
      } else {
        resolvedSegments.push(seg);
      }
    }

    const basePath = resolvedSegments.join('/');
    const index = this.vfsIndex();

    // Check exact path match
    if (index.pathToDocId.has(basePath)) {
      return basePath;
    }

    // Try common file extensions (.ts, .tsx, .js, .jsx, .py, /index.ts, /index.js)
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.json', '/index.ts', '/index.js', '/index.tsx'];
    for (const ext of extensions) {
      const candidate = `${basePath}${ext}`;
      if (index.pathToDocId.has(candidate)) {
        return candidate;
      }
    }

    return basePath;
  }

  /**
   * Generates a normalized multi-file snapshot map where keys are relative POSIX paths.
   */
  generateProjectSnapshot(documents: DocumentDto[]): Record<string, string> {
    const snapshot: Record<string, string> = {};
    const index = this.vfsIndex();

    for (const doc of documents) {
      const path = index.docIdToPath.get(doc.id) || doc.title;
      snapshot[path] = doc.content || '';
    }

    return snapshot;
  }
}
