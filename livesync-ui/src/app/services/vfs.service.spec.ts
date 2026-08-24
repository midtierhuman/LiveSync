import { TestBed } from '@angular/core/testing';
import { VFSService } from './vfs.service';
import { DocumentDto } from './document.service';
import { FolderDto } from './folder.service';

describe('VFSService', () => {
  let service: VFSService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VFSService],
    });
    service = TestBed.inject(VFSService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should build accurate canonical relative paths for nested folder structures', () => {
    const folders: FolderDto[] = [
      { id: 'f-root', name: 'my-project', parentFolderId: undefined } as unknown as FolderDto,
      { id: 'f-src', name: 'src', parentFolderId: 'f-root' } as unknown as FolderDto,
      { id: 'f-utils', name: 'utils', parentFolderId: 'f-src' } as unknown as FolderDto,
    ];

    const documents: DocumentDto[] = [
      { id: 'doc-1', title: 'package.json', folderId: 'f-root' } as unknown as DocumentDto,
      { id: 'doc-2', title: 'index.ts', folderId: 'f-src' } as unknown as DocumentDto,
      { id: 'doc-3', title: 'math.ts', folderId: 'f-utils' } as unknown as DocumentDto,
    ];

    service.updateVFSState(folders, documents, 'f-root');

    expect(service.getPathByDocumentId('doc-1')).toBe('package.json');
    expect(service.getPathByDocumentId('doc-2')).toBe('src/index.ts');
    expect(service.getPathByDocumentId('doc-3')).toBe('src/utils/math.ts');

    expect(service.getDocumentIdByPath('src/utils/math.ts')).toBe('doc-3');
    expect(service.getDocumentIdByPath('package.json')).toBe('doc-1');
  });

  it('should resolve relative imports across nested folders', () => {
    const folders: FolderDto[] = [
      { id: 'f-root', name: 'app', parentFolderId: undefined } as unknown as FolderDto,
      { id: 'f-src', name: 'src', parentFolderId: 'f-root' } as unknown as FolderDto,
      { id: 'f-components', name: 'components', parentFolderId: 'f-src' } as unknown as FolderDto,
      { id: 'f-utils', name: 'utils', parentFolderId: 'f-src' } as unknown as FolderDto,
    ];

    const documents: DocumentDto[] = [
      { id: 'doc-header', title: 'Header.tsx', folderId: 'f-components' } as unknown as DocumentDto,
      { id: 'doc-math', title: 'math.ts', folderId: 'f-utils' } as unknown as DocumentDto,
    ];

    service.updateVFSState(folders, documents, 'f-root');

    // Inside src/components/Header.tsx: import from "../utils/math"
    const resolved = service.resolveImportPath('src/components/Header.tsx', '../utils/math');
    expect(resolved).toBe('src/utils/math.ts');
  });

  it('should generate normalized project snapshot maps with relative paths', () => {
    const folders: FolderDto[] = [
      { id: 'f-root', name: 'my-project', parentFolderId: undefined } as unknown as FolderDto,
      { id: 'f-src', name: 'src', parentFolderId: 'f-root' } as unknown as FolderDto,
    ];

    const documents: DocumentDto[] = [
      { id: 'doc-1', title: 'main.py', folderId: 'f-src', content: 'print("hello")' } as unknown as DocumentDto,
      { id: 'doc-2', title: 'requirements.txt', folderId: 'f-root', content: 'requests==2.31.0' } as unknown as DocumentDto,
    ];

    service.updateVFSState(folders, documents, 'f-root');
    const snapshot = service.generateProjectSnapshot(documents);

    expect(snapshot['src/main.py']).toBe('print("hello")');
    expect(snapshot['requirements.txt']).toBe('requests==2.31.0');
  });

  it('should immediately update VFS index on optimistic file rename (BUG-10)', () => {
    const folders: FolderDto[] = [
      { id: 'f-root', name: 'my-project', parentFolderId: undefined } as unknown as FolderDto,
      { id: 'f-src', name: 'src', parentFolderId: 'f-root' } as unknown as FolderDto,
    ];
    const documents: DocumentDto[] = [
      { id: 'doc-1', title: 'oldName.ts', folderId: 'f-src' } as unknown as DocumentDto,
    ];

    service.updateVFSState(folders, documents, 'f-root');
    expect(service.getPathByDocumentId('doc-1')).toBe('src/oldName.ts');

    // Rapid consecutive renames
    service.renameItem('file', 'doc-1', 'tempName.ts');
    expect(service.getPathByDocumentId('doc-1')).toBe('src/tempName.ts');
    expect(service.getDocumentIdByPath('src/tempName.ts')).toBe('doc-1');
    expect(service.getDocumentIdByPath('src/oldName.ts')).toBeUndefined();

    service.renameItem('file', 'doc-1', 'finalName.ts');
    expect(service.getPathByDocumentId('doc-1')).toBe('src/finalName.ts');
    expect(service.getDocumentIdByPath('src/finalName.ts')).toBe('doc-1');
  });

  it('should immediately update child paths on optimistic folder rename (BUG-10)', () => {
    const folders: FolderDto[] = [
      { id: 'f-root', name: 'my-project', parentFolderId: undefined } as unknown as FolderDto,
      { id: 'f-components', name: 'components', parentFolderId: 'f-root' } as unknown as FolderDto,
    ];
    const documents: DocumentDto[] = [
      { id: 'doc-btn', title: 'Button.tsx', folderId: 'f-components' } as unknown as DocumentDto,
    ];

    service.updateVFSState(folders, documents, 'f-root');
    expect(service.getPathByDocumentId('doc-btn')).toBe('components/Button.tsx');

    // Rename parent folder
    service.renameItem('folder', 'f-components', 'widgets');
    expect(service.getPathByDocumentId('doc-btn')).toBe('widgets/Button.tsx');
    expect(service.getDocumentIdByPath('widgets/Button.tsx')).toBe('doc-btn');
    expect(service.getDocumentIdByPath('components/Button.tsx')).toBeUndefined();
  });

  it('should immediately update VFS index on file move and cascading deletion (BUG-10)', () => {
    const folders: FolderDto[] = [
      { id: 'f-root', name: 'my-project', parentFolderId: undefined } as unknown as FolderDto,
      { id: 'f-src', name: 'src', parentFolderId: 'f-root' } as unknown as FolderDto,
      { id: 'f-dest', name: 'dest', parentFolderId: 'f-root' } as unknown as FolderDto,
    ];
    const documents: DocumentDto[] = [
      { id: 'doc-file', title: 'util.ts', folderId: 'f-src' } as unknown as DocumentDto,
    ];

    service.updateVFSState(folders, documents, 'f-root');
    expect(service.getPathByDocumentId('doc-file')).toBe('src/util.ts');

    // Move file to dest folder
    service.moveItem('file', 'doc-file', 'f-dest');
    expect(service.getPathByDocumentId('doc-file')).toBe('dest/util.ts');

    // Delete dest folder -> should cascade delete doc-file
    service.deleteItem('folder', 'f-dest');
    expect(service.getPathByDocumentId('doc-file')).toBeUndefined();
    expect(service.getDocumentIdByPath('dest/util.ts')).toBeUndefined();
  });
});
