package com.livesync.api.repository;

import com.livesync.api.model.SharedFolder;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SharedFolderRepository extends JpaRepository<SharedFolder, String> {
    @EntityGraph(attributePaths = {"folder", "folder.owner", "user"})
    List<SharedFolder> findByUserIdOrderBySharedAtDesc(String userId);

    @EntityGraph(attributePaths = {"folder", "folder.owner", "user"})
    Optional<SharedFolder> findByFolderIdAndUserId(String folderId, String userId);

    @EntityGraph(attributePaths = {"user"})
    List<SharedFolder> findByFolderId(String folderId);

    boolean existsByFolderIdAndUserId(String folderId, String userId);

    void deleteByFolderIdAndUserId(String folderId, String userId);
}
