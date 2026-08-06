package com.livesync.api.dto;

import com.livesync.api.dto.DocumentDtos.DocumentDto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public class FolderDtos {
    public record CreateFolderRequest(
            @NotBlank(message = "Folder name is required")
            @Size(max = 200, message = "Folder name cannot exceed 200 characters")
            String name,
            String parentFolderId
    ) {}

    public record UpdateFolderRequest(
            @NotBlank(message = "Folder name is required")
            @Size(max = 200, message = "Folder name cannot exceed 200 characters")
            String name
    ) {}

    public record MoveDocumentRequest(
            String folderId
    ) {}

    public record FolderDto(
            String id,
            String name,
            String ownerId,
            String parentFolderId,
            String shareCode,
            String defaultAccessLevel,
            Instant createdAt,
            Instant updatedAt,
            int subfoldersCount,
            int documentsCount,
            List<FolderDto> subfolders,
            List<DocumentDto> documents,
            List<FolderPathNode> folderPath
    ) {}

    public record SharedFolderDto(
            String id,
            String folderId,
            String folderName,
            String ownerId,
            String ownerEmail,
            Instant sharedAt,
            String accessLevel,
            List<String> pathIds,
            List<String> pathNames
    ) {}

    public record FolderPathNode(
            String id,
            String name
    ) {}
}
