package com.livesync.api.controller;

import com.livesync.api.dto.DocumentDtos.*;
import com.livesync.api.service.DocumentService;
import com.livesync.api.service.SandboxExecutionClient;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/documents")
public class DocumentsController {
    private final DocumentService documents;
    private final SandboxExecutionClient sandbox;

    public DocumentsController(DocumentService documents, SandboxExecutionClient sandbox) {
        this.documents = documents;
        this.sandbox = sandbox;
    }

    private String user(Authentication authentication) {
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

    @GetMapping("/execution-languages")
    public List<ExecutionLanguageDescriptor> languages() {
        return sandbox.languages();
    }

    @GetMapping("/{id}")
    public ResponseEntity<DocumentDto> get(@PathVariable String id, Authentication auth) {
        return documents.find(id, user(auth)).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
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
        if (!documents.canEdit(id, user(auth)))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "You don't have edit access to this document"));
        return documents.update(id, user(auth), request).<ResponseEntity<?>>map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/content")
    public ResponseEntity<?> content(@PathVariable String id, @Valid @RequestBody DocumentContentUpdateRequest request, Authentication auth) {
        if (!documents.canEdit(id, user(auth)))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "You don't have edit access to this document"));
        return documents.updateContent(id, user(auth), request).<ResponseEntity<?>>map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, Authentication auth) {
        return documents.delete(id, user(auth)) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
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

    @PostMapping("/{id}/execute")
    public ResponseEntity<?> execute(@PathVariable String id, @Valid @RequestBody ExecuteDocumentRequest request, Authentication auth) {
        var document = documents.find(id, user(auth));
        if (document.isEmpty()) return ResponseEntity.notFound().build();
        if (!documents.canEdit(id, user(auth)))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "You don't have edit access to this document"));
        Instant requested = Instant.now();
        try {
            var result = sandbox.execute(new SandboxExecutionClient.SandboxRequest("cs".equals(request.language()) ? "csharp" : request.language(), document.get().content(), request.standardInput()));
            return ResponseEntity.ok(new DocumentExecutionResponse(id, result.language(), result.status(), result.isSuccess(), result.message(), result.standardOutput(), result.standardError(), result.executionDurationMs(), result.peakMemoryBytes(), result.cpuTimeMs(), result.timeComplexity(), result.spaceComplexity(), result.complexityExplanation(), result.requestedAt(), result.completedAt()));
        } catch (IllegalStateException exception) {
            Instant completed = Instant.now();
            String detail = rootCauseMessage(exception);
            return ResponseEntity.ok(new DocumentExecutionResponse(id, request.language(), "Failed", false, detail, null, detail, null, null, null, null, null, null, requested, completed));
        }
    }

    @PostMapping("/{id}/ai-assistant")
    public ResponseEntity<?> aiAssistant(@PathVariable String id, @RequestBody AiAnalysisRequest request, Authentication auth) {
        var document = documents.find(id, user(auth));
        if (document.isEmpty()) return ResponseEntity.notFound().build();
        var result = sandbox.analyzeAi(
            request.action() == null ? "explain" : request.action(),
            request.language() == null ? "python" : request.language(),
            document.get().content()
        );
        return ResponseEntity.ok(result);
    }

    private boolean valid(String value) {
        return "View".equals(value) || "Edit".equals(value);
    }

    private String rootCauseMessage(Throwable throwable) {
        Throwable current = throwable;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }

        String message = current.getMessage();
        return (message == null || message.isBlank()) ? "Sandbox execution request failed." : message;
    }
}
