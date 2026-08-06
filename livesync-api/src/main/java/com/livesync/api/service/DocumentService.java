package com.livesync.api.service;

import com.livesync.api.dto.DocumentDtos.*;
import com.livesync.api.model.Document;
import com.livesync.api.model.SharedDocument;
import com.livesync.api.repository.ApplicationUserRepository;
import com.livesync.api.repository.DocumentRepository;
import com.livesync.api.repository.FolderRepository;
import com.livesync.api.repository.SharedDocumentRepository;
import com.livesync.api.repository.SharedFolderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import com.livesync.api.dto.FolderDtos;

@Service
public class DocumentService {
    private static final String SHARE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private final DocumentRepository documents;
    private final SharedDocumentRepository shares;
    private final ApplicationUserRepository users;
    private final FolderRepository folders;
    private final SharedFolderRepository sharedFolders;

    public DocumentService(
            DocumentRepository documents,
            SharedDocumentRepository shares,
            ApplicationUserRepository users,
            FolderRepository folders,
            SharedFolderRepository sharedFolders
    ) {
        this.documents = documents;
        this.shares = shares;
        this.users = users;
        this.folders = folders;
        this.sharedFolders = sharedFolders;
    }

    @Transactional(readOnly = true)
    public Optional<DocumentDto> find(String id, String userId) {
        return documents.findById(id).filter(d -> canAccess(d, userId)).map(d -> dto(d, userId));
    }

    @Transactional(readOnly = true)
    public List<DocumentDto> owned(String userId) {
        return documents.findByOwnerIdOrderByUpdatedAtDesc(userId).stream().map(d -> dto(d, userId)).toList();
    }

    @Transactional(readOnly = true)
    public List<SharedDocumentDto> shared(String userId) {
        return shares.findByUserIdOrderBySharedAtDesc(userId).stream().map(this::sharedDto).toList();
    }

    @Transactional
    public DocumentDto create(String userId, CreateDocumentRequest request) {
        var now = Instant.now();
        var document = new Document();
        document.setTitle(request.title().trim());
        document.setContent(request.content() == null ? "" : request.content());
        document.setOwnerId(userId);
        document.setOwner(users.getReferenceById(userId));
        document.setCreatedAt(now);
        document.setUpdatedAt(now);
        return dto(documents.save(document), userId);
    }

    @Transactional
    public Optional<DocumentDto> update(String id, String userId, UpdateDocumentRequest request) {
        return documents.findById(id).filter(d -> canEdit(d, userId)).map(d -> {
            if (request.title() != null) d.setTitle(request.title().trim());
            if (request.content() != null) d.setContent(request.content());
            edited(d, request.lastEditedBy(), userId);
            return dto(d, userId);
        });
    }

    @Transactional
    public Optional<DocumentDto> updateContent(String id, String userId, DocumentContentUpdateRequest request) {
        return documents.findById(id).filter(d -> canEdit(d, userId)).map(d -> {
            d.setContent(request.content());
            edited(d, request.lastEditedBy(), userId);
            return dto(d, userId);
        });
    }

    @Transactional
    public boolean updateContentInternal(String id, String content, String userId) {
        return documents.findById(id).map(d -> {
            d.setContent(content);
            edited(d, null, userId == null || userId.isBlank() ? "system" : userId);
            return true;
        }).orElse(false);
    }

    @Transactional
    public boolean delete(String id, String userId) {
        return documents.findById(id).filter(d -> d.getOwnerId().equals(userId)).map(d -> {
            shares.deleteByDocumentId(id);
            documents.delete(d);
            return true;
        }).orElse(false);
    }

    @Transactional
    public Optional<DocumentDto> generateShareCode(String id, String userId) {
        return documents.findById(id).filter(d -> d.getOwnerId().equals(userId)).map(d -> {
            String code;
            do {
                code = code();
            } while (documents.existsByShareCode(code) || folders.existsByShareCode(code));
            d.setShareCode(code);
            return dto(d, userId);
        });
    }

    @Transactional(readOnly = true)
    public Optional<DocumentDto> byShareCode(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        return documents.findByShareCode(code.trim().toUpperCase()).map(d -> dto(d, d.getOwnerId()));
    }

    @Transactional
    public boolean addShare(String code, String userId) {
        var document = documents.findByShareCode(code);
        if (document.isEmpty() || document.get().getOwnerId().equals(userId) || shares.findByDocumentIdAndUserId(document.get().getId(), userId).isPresent()) {
            return false;
        }
        var share = new SharedDocument();
        share.setDocumentId(document.get().getId());
        share.setUserId(userId);
        share.setSharedAt(Instant.now());
        share.setAccessLevel(document.get().getDefaultAccessLevel());
        shares.save(share);
        return true;
    }

    @Transactional
    public boolean removeShare(String documentId, String userId, String sharedUserId) {
        if (documents.findById(documentId).filter(d -> d.getOwnerId().equals(userId)).isEmpty()) return false;
        return shares.findByDocumentIdAndUserId(documentId, sharedUserId).map(s -> {
            shares.delete(s);
            return true;
        }).orElse(false);
    }

    @Transactional
    public boolean updateShareAccess(String id, String ownerId, String sharedUserId, String access) {
        if (!validAccess(access) || documents.findById(id).filter(d -> d.getOwnerId().equals(ownerId)).isEmpty()) return false;
        return shares.findByDocumentIdAndUserId(id, sharedUserId).map(s -> {
            s.setAccessLevel(access);
            return true;
        }).orElse(false);
    }

    @Transactional
    public boolean updateCodeAccess(String id, String ownerId, String access) {
        if (!validAccess(access)) return false;
        return documents.findById(id).filter(d -> d.getOwnerId().equals(ownerId)).map(d -> {
            d.setDefaultAccessLevel(access);
            return true;
        }).orElse(false);
    }

    @Transactional(readOnly = true)
    public String access(String id, String userId) {
        return documents.findById(id).map(d -> {
            if (d.getOwnerId().equals(userId)) return "Edit";
            var directShare = shares.findByDocumentIdAndUserId(id, userId);
            if (directShare.isPresent()) return directShare.get().getAccessLevel();
            if (d.getFolderId() != null) return folderAccess(d.getFolderId(), userId);
            return null;
        }).orElse(null);
    }

    @Transactional(readOnly = true)
    public boolean canEdit(String id, String userId) {
        return "Edit".equals(access(id, userId));
    }

    private String folderAccess(String folderId, String userId) {
        if (folderId == null) return null;
        var folderOpt = folders.findById(folderId);
        if (folderOpt.isEmpty()) return null;
        var folder = folderOpt.get();
        if (folder.getOwnerId().equals(userId)) return "Edit";
        var shareOpt = sharedFolders.findByFolderIdAndUserId(folderId, userId);
        if (shareOpt.isPresent()) return shareOpt.get().getAccessLevel();
        if (folder.getParentFolderId() != null) return folderAccess(folder.getParentFolderId(), userId);
        return null;
    }

    public boolean canAccess(Document d, String user) {
        if (d.getOwnerId().equals(user)) return true;
        if (shares.findByDocumentIdAndUserId(d.getId(), user).isPresent()) return true;
        return d.getFolderId() != null && folderAccess(d.getFolderId(), user) != null;
    }

    public boolean canEdit(Document d, String user) {
        if (d.getOwnerId().equals(user)) return true;
        if (shares.findByDocumentIdAndUserId(d.getId(), user).map(s -> "Edit".equals(s.getAccessLevel())).orElse(false)) return true;
        return d.getFolderId() != null && "Edit".equals(folderAccess(d.getFolderId(), user));
    }

    private void edited(Document d, String editor, String user) {
        d.setUpdatedAt(Instant.now());
        d.setLastEditedAt(Instant.now());
        d.setLastEditedBy(editor == null ? user : editor);
    }

    private boolean validAccess(String value) {
        return "View".equals(value) || "Edit".equals(value);
    }

    private String code() {
        var random = new SecureRandom();
        var value = new StringBuilder(10);
        for (int i = 0; i < 10; i++) {
            value.append(SHARE_CHARS.charAt(random.nextInt(SHARE_CHARS.length())));
        }
        return value.toString();
    }

    public DocumentDto dto(Document d) {
        return dto(d, d.getOwnerId());
    }

    public DocumentDto dto(Document d, String viewerUserId) {
        String ownerName = "Unknown";
        try {
            if (d.getOwner() != null) {
                ownerName = d.getOwner().getUserName();
            }
        } catch (Exception ignored) {}

        boolean isShared = viewerUserId != null && !d.getOwnerId().equals(viewerUserId);
        String permission = isShared ? access(d.getId(), viewerUserId) : "Edit";
        if (permission == null) permission = "View";

        return new DocumentDto(
                d.getId(),
                d.getTitle(),
                d.getContent(),
                d.getOwnerId(),
                d.getFolderId(),
                ownerName,
                d.getShareCode(),
                d.getDefaultAccessLevel(),
                d.getCreatedAt(),
                d.getUpdatedAt(),
                d.getLastEditedAt(),
                d.getLastEditedBy(),
                d.getSharedWith() == null ? Collections.emptyList() : d.getSharedWith().stream().map(this::sharedDto).toList(),
                isShared,
                permission
        );
    }

    private SharedDocumentDto sharedDto(SharedDocument s) {
        var folderPath = buildDocFolderPath(s.getDocument());
        return new SharedDocumentDto(
                s.getId(),
                s.getDocumentId(),
                s.getDocument() == null ? "Unknown" : s.getDocument().getTitle(),
                s.getUserId(),
                s.getUser() == null ? "Unknown" : s.getUser().getUserName(),
                s.getSharedAt(),
                s.getAccessLevel(),
                folderPath
        );
    }

    private java.util.List<FolderDtos.FolderPathNode> buildDocFolderPath(Document doc) {
        if (doc == null || doc.getFolderId() == null) return Collections.emptyList();
        var path = new ArrayList<FolderDtos.FolderPathNode>();
        String currentId = doc.getFolderId();
        while (currentId != null) {
            var folderOpt = folders.findById(currentId);
            if (folderOpt.isEmpty()) break;
            var folder = folderOpt.get();
            path.add(0, new FolderDtos.FolderPathNode(folder.getId(), folder.getName()));
            currentId = folder.getParentFolderId();
        }
        return path;
    }
}
