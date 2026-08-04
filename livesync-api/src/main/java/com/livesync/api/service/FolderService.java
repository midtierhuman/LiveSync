package com.livesync.api.service;

import com.livesync.api.dto.DocumentDtos.DocumentDto;
import com.livesync.api.dto.FolderDtos.*;
import com.livesync.api.model.Document;
import com.livesync.api.model.Folder;
import com.livesync.api.model.SharedFolder;
import com.livesync.api.repository.DocumentRepository;
import com.livesync.api.repository.FolderRepository;
import com.livesync.api.repository.SharedFolderRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

@Service
@Transactional
public class FolderService {
    private static final String SHARE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private final FolderRepository folders;
    private final SharedFolderRepository sharedFolders;
    private final DocumentRepository documents;
    private final DocumentService documentService;

    public FolderService(FolderRepository folders, SharedFolderRepository sharedFolders, DocumentRepository documents, DocumentService documentService) {
        this.folders = folders;
        this.sharedFolders = sharedFolders;
        this.documents = documents;
        this.documentService = documentService;
    }

    public FolderDto create(String userId, CreateFolderRequest request) {
        var folder = new Folder();
        folder.setName(request.name().trim());
        folder.setOwnerId(userId);
        if (request.parentFolderId() != null && !request.parentFolderId().isBlank()) {
            var parent = folders.findById(request.parentFolderId())
                    .orElseThrow(() -> new IllegalArgumentException("Parent folder not found"));
            if (!"Edit".equals(accessLevel(parent, userId))) {
                throw new AccessDeniedException("No edit access to parent folder.");
            }
            folder.setParentFolderId(parent.getId());
        }
        folder.setShareCode(generateUniqueShareCode());
        folder.setCreatedAt(Instant.now());
        folder.setUpdatedAt(Instant.now());

        var saved = folders.save(folder);
        return toDto(saved, false);
    }

    @Transactional(readOnly = true)
    public List<FolderDto> owned(String userId) {
        return folders.findByOwnerIdAndParentFolderIdIsNullOrderByUpdatedAtDesc(userId)
                .stream()
                .map(f -> toDto(f, true))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<SharedFolderDto> shared(String userId) {
        return sharedFolders.findByUserIdOrderBySharedAtDesc(userId)
                .stream()
                .map(sf -> new SharedFolderDto(
                        sf.getId(),
                        sf.getFolderId(),
                        sf.getFolder() != null ? sf.getFolder().getName() : "Shared Folder",
                        sf.getFolder() != null ? sf.getFolder().getOwnerId() : "",
                        sf.getFolder() != null && sf.getFolder().getOwner() != null ? sf.getFolder().getOwner().getEmail() : "",
                        sf.getSharedAt(),
                        sf.getAccessLevel()
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public Optional<FolderDto> find(String folderId, String userId) {
        var folderOpt = folders.findById(folderId);
        if (folderOpt.isEmpty()) return Optional.empty();
        var folder = folderOpt.get();

        String access = accessLevel(folder, userId);
        if (access == null) return Optional.empty();

        return Optional.of(toDtoWithContents(folder, userId));
    }

    public Optional<FolderDto> update(String folderId, String userId, UpdateFolderRequest request) {
        var folderOpt = folders.findById(folderId);
        if (folderOpt.isEmpty()) return Optional.empty();
        var folder = folderOpt.get();

        if (!folder.getOwnerId().equals(userId) && !"Edit".equals(accessLevel(folder, userId))) {
            return Optional.empty();
        }

        folder.setName(request.name().trim());
        folder.setUpdatedAt(Instant.now());
        return Optional.of(toDto(folders.save(folder), false));
    }

    public boolean delete(String folderId, String userId) {
        var folderOpt = folders.findById(folderId);
        if (folderOpt.isEmpty()) return false;
        var folder = folderOpt.get();

        if (!folder.getOwnerId().equals(userId)) {
            return false;
        }

        // Unassign documents inside folder and all nested subfolders to root
        List<String> allFolderIds = collectSubfolderIds(folderId);
        allFolderIds.add(folderId);

        for (String fId : allFolderIds) {
            var docsInside = documents.findByFolderIdOrderByUpdatedAtDesc(fId);
            for (var doc : docsInside) {
                doc.setFolderId(null);
                documents.save(doc);
            }
        }

        folders.delete(folder);
        return true;
    }

    private List<String> collectSubfolderIds(String parentId) {
        List<String> ids = new ArrayList<>();
        var children = folders.findByParentFolderIdOrderByUpdatedAtDesc(parentId);
        for (var child : children) {
            ids.add(child.getId());
            ids.addAll(collectSubfolderIds(child.getId()));
        }
        return ids;
    }

    public boolean moveDocument(String documentId, String userId, String targetFolderId) {
        var docOpt = documents.findById(documentId);
        if (docOpt.isEmpty()) return false;
        var doc = docOpt.get();

        if (!documentService.canEdit(documentId, userId)) {
            return false;
        }

        if (targetFolderId != null && !targetFolderId.isBlank()) {
            var targetOpt = folders.findById(targetFolderId);
            if (targetOpt.isEmpty()) return false;
            var target = targetOpt.get();
            if (!"Edit".equals(accessLevel(target, userId))) return false;
            doc.setFolderId(targetFolderId);
        } else {
            doc.setFolderId(null);
        }

        doc.setUpdatedAt(Instant.now());
        documents.save(doc);
        return true;
    }

    public boolean addFolderShare(String shareCode, String userId) {
        var folderOpt = folders.findByShareCode(shareCode);
        if (folderOpt.isEmpty()) return false;
        var folder = folderOpt.get();

        if (folder.getOwnerId().equals(userId)) {
            return true; // Owner already has access
        }

        if (sharedFolders.existsByFolderIdAndUserId(folder.getId(), userId)) {
            return true;
        }

        var share = new SharedFolder();
        share.setFolderId(folder.getId());
        share.setUserId(userId);
        share.setAccessLevel(folder.getDefaultAccessLevel());
        share.setSharedAt(Instant.now());
        sharedFolders.save(share);

        return true;
    }

    public String getAccessLevel(String folderId, String userId) {
        if (folderId == null) return null;
        var folderOpt = folders.findById(folderId);
        return folderOpt.map(folder -> accessLevel(folder, userId)).orElse(null);
    }

    public String accessLevel(Folder folder, String userId) {
        if (folder == null) return null;
        if (folder.getOwnerId().equals(userId)) return "Edit";

        var shareOpt = sharedFolders.findByFolderIdAndUserId(folder.getId(), userId);
        if (shareOpt.isPresent()) return shareOpt.get().getAccessLevel();

        // Check parent folder recursively for inherited access level
        if (folder.getParentFolderId() != null) {
            var parentOpt = folders.findById(folder.getParentFolderId());
            if (parentOpt.isPresent()) {
                return accessLevel(parentOpt.get(), userId);
            }
        }

        return null;
    }

    private String generateUniqueShareCode() {
        var random = new SecureRandom();
        String code;
        do {
            var sb = new StringBuilder(10);
            for (int i = 0; i < 10; i++) {
                sb.append(SHARE_CHARS.charAt(random.nextInt(SHARE_CHARS.length())));
            }
            code = sb.toString();
        } while (folders.existsByShareCode(code));
        return code;
    }

    private FolderDto toDto(Folder f, boolean includeSubfolders) {
        var subfolders = includeSubfolders ?
                folders.findByParentFolderIdOrderByUpdatedAtDesc(f.getId()).stream().map(sf -> toDto(sf, true)).toList()
                : Collections.<FolderDto>emptyList();

        long docCount = documents.countByFolderId(f.getId());

        return new FolderDto(
                f.getId(),
                f.getName(),
                f.getOwnerId(),
                f.getParentFolderId(),
                f.getShareCode(),
                f.getDefaultAccessLevel(),
                f.getCreatedAt(),
                f.getUpdatedAt(),
                subfolders.size(),
                (int) docCount,
                subfolders,
                Collections.emptyList()
        );
    }

    private FolderDto toDtoWithContents(Folder f, String userId) {
        var subfolders = folders.findByParentFolderIdOrderByUpdatedAtDesc(f.getId())
                .stream()
                .map(sf -> toDto(sf, true))
                .toList();

        var docs = documents.findByFolderIdOrderByUpdatedAtDesc(f.getId())
                .stream()
                .map(documentService::dto)
                .toList();

        return new FolderDto(
                f.getId(),
                f.getName(),
                f.getOwnerId(),
                f.getParentFolderId(),
                f.getShareCode(),
                f.getDefaultAccessLevel(),
                f.getCreatedAt(),
                f.getUpdatedAt(),
                subfolders.size(),
                docs.size(),
                subfolders,
                docs
        );
    }
}
