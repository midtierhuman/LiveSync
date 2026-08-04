package com.livesync.api.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "SharedFolders", uniqueConstraints = @UniqueConstraint(columnNames = {"FolderId", "UserId"}))
public class SharedFolder {
    @Id
    @Column(name = "Id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "FolderId", nullable = false)
    private String folderId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "FolderId", insertable = false, updatable = false)
    @JsonIgnore
    private Folder folder;

    @Column(name = "UserId", nullable = false)
    private String userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "UserId", insertable = false, updatable = false)
    @JsonIgnore
    private ApplicationUser user;

    @Column(name = "SharedAt", nullable = false)
    private Instant sharedAt = Instant.now();

    @Column(name = "AccessLevel", length = 50)
    private String accessLevel = "View";

    public String getId() {
        return id;
    }

    public String getFolderId() {
        return folderId;
    }

    public void setFolderId(String folderId) {
        this.folderId = folderId;
    }

    public Folder getFolder() {
        return folder;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public ApplicationUser getUser() {
        return user;
    }

    public Instant getSharedAt() {
        return sharedAt;
    }

    public void setSharedAt(Instant sharedAt) {
        this.sharedAt = sharedAt;
    }

    public String getAccessLevel() {
        return accessLevel;
    }

    public void setAccessLevel(String accessLevel) {
        this.accessLevel = accessLevel;
    }
}
