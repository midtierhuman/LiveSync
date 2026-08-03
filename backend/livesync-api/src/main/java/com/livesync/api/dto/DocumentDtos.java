package com.livesync.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class DocumentDtos {
    private DocumentDtos() {
    }

    public record DocumentDto(String id, String title, String content, String ownerId, String ownerName,
                              String shareCode,
                              String defaultAccessLevel, Instant createdAt, Instant updatedAt, Instant lastEditedAt,
                              String lastEditedBy, List<SharedDocumentDto> sharedWith) {
    }

    public record SharedDocumentDto(String id, String documentId, String documentTitle, String userId, String userName,
                                    Instant sharedAt, String accessLevel) {
    }

    public record CreateDocumentRequest(@NotBlank @Size(max = 200) String title, String content) {
    }

    public record UpdateDocumentRequest(@Size(max = 200) String title, String content, String lastEditedBy) {
    }

    public record DocumentContentUpdateRequest(@NotNull String content, String lastEditedBy) {
    }

    public record AddSharedDocumentRequest(@NotBlank @Size(max = 50) String shareCode) {
    }

    public record UpdateAccessLevelRequest(@NotBlank String accessLevel) {
    }

    public record ExecuteDocumentRequest(
            @NotBlank @Pattern(regexp = "^(csharp|cs|python|py|javascript|js|node)$", message = "Supported languages: python, javascript, csharp.") String language,
            @Size(max = 4000) String standardInput) {
    }

    public record ExecutionLanguageDescriptor(String id, String name, String displayName) {
    }

    public record DocumentExecutionResponse(String documentId, String language, String status, boolean isSuccess,
                                            String message, String standardOutput, String standardError,
                                            Double executionDurationMs, Long peakMemoryBytes, Double cpuTimeMs,
                                            String timeComplexity, String spaceComplexity, String complexityExplanation,
                                            Instant requestedAt, Instant completedAt) {
    }

    public record AiAnalysisRequest(String action, String language) {
    }

    public record AiAnalysisResponse(String action, String language, String explanation, List<String> suggestions, String generatedCode) {
    }
}
