package com.livesync.api.repository;

import com.livesync.api.model.Folder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FolderRepository extends JpaRepository<Folder, String> {
    List<Folder> findByOwnerIdOrderByUpdatedAtDesc(String ownerId);

    List<Folder> findByOwnerIdAndParentFolderIdIsNullOrderByUpdatedAtDesc(String ownerId);

    List<Folder> findByOwnerIdAndParentFolderIdOrderByUpdatedAtDesc(String ownerId, String parentFolderId);

    List<Folder> findByParentFolderIdOrderByUpdatedAtDesc(String parentFolderId);

    Optional<Folder> findByShareCode(String shareCode);

    boolean existsByShareCode(String shareCode);
}
