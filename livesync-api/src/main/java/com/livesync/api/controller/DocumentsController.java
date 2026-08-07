package com.livesync.api.controller;

import com.livesync.api.dto.DocumentDtos.*;
import com.livesync.api.service.DocumentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/documents")
public class DocumentsController {
    private final DocumentService documents;

    public DocumentsController(DocumentService documents) {
        this.documents = documents;
    }

    private String user(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            throw new org.springframework.security.access.AccessDeniedException("User is unauthenticated.");
        }
        return authentication.getName();
    }

    @GetMapping("/my-documents")
    public List<DocumentDto> owned(Authentication auth) {
        return documents.owned(user(auth));
    }

    @GetMapping("/shared-with-me")
    public List<SharedDocumentDto> shared(Authentication auth) {
        return documents.shared(user(auth));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable String id, Authentication auth) {
        var userId = user(auth);
        var access = documents.access(id, userId);
        if (access == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Document not found"));
        }
        return documents.find(id, userId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Access denied")));
    }

    @GetMapping("/{id}/access")
    public ResponseEntity<Map<String, String>> access(@PathVariable String id, Authentication auth) {
        var value = documents.access(id, user(auth));
        return value == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(Map.of("accessLevel", value));
    }

    @PostMapping
    public ResponseEntity<DocumentDto> create(@Valid @RequestBody CreateDocumentRequest request, Authentication auth) {
        var document = documents.create(user(auth), request);
        return ResponseEntity.created(java.net.URI.create("/api/documents/" + document.id())).body(document);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @Valid @RequestBody UpdateDocumentRequest request, Authentication auth) {
        var userId = user(auth);
        var access = documents.access(id, userId);
        if (access == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Document not found"));
        }
        if (!"Edit".equals(access)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "You don't have edit access to this document"));
        }
        return documents.update(id, userId, request).<ResponseEntity<?>>map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/content")
    public ResponseEntity<?> content(@PathVariable String id, @Valid @RequestBody DocumentContentUpdateRequest request, Authentication auth) {
        var userId = user(auth);
        var access = documents.access(id, userId);
        if (access == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Document not found"));
        }
        if (!"Edit".equals(access)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "You don't have edit access to this document"));
        }
        return documents.updateContent(id, userId, request).<ResponseEntity<?>>map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, Authentication auth) {
        var userId = user(auth);
        var access = documents.access(id, userId);
        if (access == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Document not found"));
        }
        return documents.delete(id, userId)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Only the document owner can delete this document"));
    }

    @PostMapping("/{id}/generate-share-code")
    public ResponseEntity<DocumentDto> generate(@PathVariable String id, Authentication auth) {
        return documents.generateShareCode(id, user(auth)).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/share/{code}")
    public ResponseEntity<DocumentDto> byCode(@PathVariable String code) {
        return documents.byShareCode(code).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/add-shared")
    public ResponseEntity<Map<String, String>> add(@Valid @RequestBody AddSharedDocumentRequest request, Authentication auth) {
        return documents.addShare(request.shareCode(), user(auth)) ? ResponseEntity.ok(Map.of("message", "Document added successfully")) : ResponseEntity.badRequest().body(Map.of("message", "Invalid share code or already added"));
    }

    @DeleteMapping("/{id}/shared/{sharedUserId}")
    public ResponseEntity<Void> remove(@PathVariable String id, @PathVariable String sharedUserId, Authentication auth) {
        return documents.removeShare(id, user(auth), sharedUserId) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @PutMapping("/{id}/shared/{sharedUserId}/access-level")
    public ResponseEntity<?> shareAccess(@PathVariable String id, @PathVariable String sharedUserId, @Valid @RequestBody UpdateAccessLevelRequest request, Authentication auth) {
        if (!valid(request.accessLevel()))
            return ResponseEntity.badRequest().body(Map.of("message", "Invalid access level. Must be 'View' or 'Edit'"));
        if (documents.find(id, user(auth)).filter(d -> d.ownerId().equals(user(auth))).isEmpty())
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Only the document owner can change access levels"));
        return documents.updateShareAccess(id, user(auth), sharedUserId, request.accessLevel()) ? ResponseEntity.ok(Map.of("message", "Access level updated successfully")) : ResponseEntity.notFound().build();
    }

    @PutMapping("/{id}/share-code-access-level")
    public ResponseEntity<?> codeAccess(@PathVariable String id, @Valid @RequestBody UpdateAccessLevelRequest request, Authentication auth) {
        if (!valid(request.accessLevel()))
            return ResponseEntity.badRequest().body(Map.of("message", "Invalid access level. Must be 'View' or 'Edit'"));
        return documents.updateCodeAccess(id, user(auth), request.accessLevel()) ? ResponseEntity.ok(Map.of("message", "Share code access level updated successfully")) : ResponseEntity.notFound().build();
    }

    private boolean valid(String value) {
        return "View".equals(value) || "Edit".equals(value);
    }
}
