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

    @GetMapping("/{id}")
    public ResponseEntity<FolderDto> get(@PathVariable String id, Authentication auth) {
        return folderService.find(id, user(auth))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<FolderDto> create(@Valid @RequestBody CreateFolderRequest request, Authentication auth) {
        var folder = folderService.create(user(auth), request);
        return ResponseEntity.created(java.net.URI.create("/api/folders/" + folder.id())).body(folder);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @Valid @RequestBody UpdateFolderRequest request, Authentication auth) {
        var userId = user(auth);
        if (folderService.find(id, userId).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        return folderService.update(id, userId, request)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("message", "You don't have edit access to this folder")));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, Authentication auth) {
        return folderService.delete(id, user(auth))
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    @PutMapping("/move-document/{documentId}")
    public ResponseEntity<?> moveDocument(@PathVariable String documentId, @RequestBody MoveDocumentRequest request, Authentication auth) {
        return folderService.moveDocument(documentId, user(auth), request.folderId())
                ? ResponseEntity.ok(Map.of("message", "Document moved successfully"))
                : ResponseEntity.badRequest().body(Map.of("message", "Failed to move document"));
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
