package com.livesync.api.repository;

import com.livesync.api.model.SharedDocument;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SharedDocumentRepository extends JpaRepository<SharedDocument, String> {
    Optional<SharedDocument> findByDocumentIdAndUserId(String documentId, String userId);
    @EntityGraph(attributePaths = {"document", "document.owner", "user"})
    List<SharedDocument> findByUserIdOrderBySharedAtDesc(String userId);
}
