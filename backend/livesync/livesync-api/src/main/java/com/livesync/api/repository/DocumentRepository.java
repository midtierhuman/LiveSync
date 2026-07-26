package com.livesync.api.repository;

import com.livesync.api.model.Document;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentRepository extends JpaRepository<Document, String> {
    @EntityGraph(attributePaths = {"owner", "sharedWith", "sharedWith.user"})
    Optional<Document> findById(String id);
    @EntityGraph(attributePaths = {"owner", "sharedWith", "sharedWith.user"})
    List<Document> findByOwnerIdOrderByUpdatedAtDesc(String ownerId);
    @EntityGraph(attributePaths = {"owner", "sharedWith", "sharedWith.user"})
    Optional<Document> findByShareCode(String shareCode);
    boolean existsByShareCode(String shareCode);
}
