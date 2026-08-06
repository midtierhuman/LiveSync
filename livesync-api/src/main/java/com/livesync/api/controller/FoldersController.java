package com.livesync.api.controller;

import com.livesync.api.dto.FolderDtos.*;
import com.livesync.api.service.FolderService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/folders")
public class FoldersController {
    private final FolderService folderService;

    public FoldersController(FolderService folderService) {
        this.folderService = folderService;
    }

    private String user(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            throw new AccessDeniedException("User is unauthenticated.");
        }
        return authentication.getName();
    }

    @GetMapping("/my-folders")
    public List<FolderDto> owned(Authentication auth) {
        return folderService.owned(user(auth));
    }

    @GetMapping("/shared-with-me")
    public List<SharedFolderDto> shared(Authentication auth) {
        return folderService.shared(user(auth));
    }

    @GetMapping("/shared-with-me/details")
    public List<FolderDto> sharedDetails(Authentication auth) {
        return folderService.sharedFolderDetails(user(auth));
    }

    @GetMapping("/share/{code}")
    public ResponseEntity<FolderDto> byCode(@PathVariable String code) {
        return folderService.byShareCode(code).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }
    @PostMapping("/{id}/generate-share-code")
    public ResponseEntity<FolderDto> generate(@PathVariable String id, Authentication auth) {
        return folderService.generateShareCode(id, user(auth)).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable String id, Authentication auth) {
        var userId = user(auth);
        var access = folderService.getAccessLevel(id, userId);
        if (access == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Folder not found"));
        }
        return folderService.find(id, userId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Access denied")));
    }

    @PostMapping
    public ResponseEntity<FolderDto> create(@Valid @RequestBody CreateFolderRequest request, Authentication auth) {
        var folder = folderService.create(user(auth), request);
        return ResponseEntity.created(java.net.URI.create("/api/folders/" + folder.id())).body(folder);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @Valid @RequestBody UpdateFolderRequest request, Authentication auth) {
        var userId = user(auth);
        var access = folderService.getAccessLevel(id, userId);
        if (access == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Folder not found"));
        }
        if (!"Edit".equals(access)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "You don't have edit access to this folder"));
        }
        return folderService.update(id, userId, request)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, Authentication auth) {
        var userId = user(auth);
        var access = folderService.getAccessLevel(id, userId);
        if (access == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Folder not found"));
        }
        return folderService.delete(id, userId)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Only the folder owner can delete this folder"));
    }

    @PutMapping("/move-document/{documentId}")
    public ResponseEntity<?> moveDocument(@PathVariable String documentId, @RequestBody MoveDocumentRequest request, Authentication auth) {
        return folderService.moveDocument(documentId, user(auth), request.folderId())
                ? ResponseEntity.ok(Map.of("message", "Document moved successfully"))
                : ResponseEntity.badRequest().body(Map.of("message", "Failed to move document"));
    }

    @PutMapping("/move-folder/{folderId}")
    public ResponseEntity<?> moveFolder(@PathVariable String folderId, @RequestBody Map<String, String> body, Authentication auth) {
        String targetParentFolderId = body.get("targetParentFolderId");
        return folderService.moveFolder(folderId, user(auth), targetParentFolderId)
                ? ResponseEntity.ok(Map.of("message", "Folder moved successfully"))
                : ResponseEntity.badRequest().body(Map.of("message", "Failed to move folder"));
    }

    @PostMapping("/add-shared")
    public ResponseEntity<Map<String, String>> addShared(@RequestBody Map<String, String> body, Authentication auth) {
        String shareCode = body.get("shareCode");
        if (shareCode == null || shareCode.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Share code is required"));
        }
        return folderService.addFolderShare(shareCode, user(auth))
                ? ResponseEntity.ok(Map.of("message", "Folder joined successfully"))
                : ResponseEntity.badRequest().body(Map.of("message", "Invalid share code or already joined"));
    }
}
