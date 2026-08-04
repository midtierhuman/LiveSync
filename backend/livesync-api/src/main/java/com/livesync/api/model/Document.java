package com.livesync.api.model;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "Documents")
public class Document {
    @Id
    @Column(name = "Id")
    private String id = UUID.randomUUID().toString();
    @Column(name = "Title", nullable = false, length = 200)
    private String title;
    @Column(name = "Content", nullable = false, columnDefinition = "TEXT")
    private String content;
    @Column(name = "OwnerId", nullable = false)
    private String ownerId;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "OwnerId", insertable = false, updatable = false)
    private ApplicationUser owner;
    @Column(name = "FolderId")
    private String folderId;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "FolderId", insertable = false, updatable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Folder folder;
    @Column(name = "ShareCode", unique = true, length = 50)
    private String shareCode;
    @Column(name = "DefaultAccessLevel", nullable = false, length = 50)
    private String defaultAccessLevel = "View";
    @Column(name = "CreatedAt", nullable = false)
    private Instant createdAt;
    @Column(name = "UpdatedAt", nullable = false)
    private Instant updatedAt;
    @Column(name = "LastEditedAt")
    private Instant lastEditedAt;
    @Column(name = "LastEditedBy")
    private String lastEditedBy;
    @OneToMany(mappedBy = "document", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SharedDocument> sharedWith = new ArrayList<>();

    public String getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String value) {
        title = value;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String value) {
        content = value;
    }

    public String getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(String value) {
        ownerId = value;
    }

    public ApplicationUser getOwner() {
        return owner;
    }

    public void setOwner(ApplicationUser value) {
        owner = value;
    }

    public String getShareCode() {
        return shareCode;
    }

    public void setShareCode(String value) {
        shareCode = value;
    }

    public String getDefaultAccessLevel() {
        return defaultAccessLevel;
    }

    public void setDefaultAccessLevel(String value) {
        defaultAccessLevel = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant value) {
        updatedAt = value;
    }

    public Instant getLastEditedAt() {
        return lastEditedAt;
    }

    public void setLastEditedAt(Instant value) {
        lastEditedAt = value;
    }

    public String getLastEditedBy() {
        return lastEditedBy;
    }

    public void setLastEditedBy(String value) {
        lastEditedBy = value;
    }

    public List<SharedDocument> getSharedWith() {
        return sharedWith;
    }

    public String getFolderId() {
        return folderId;
    }

    public void setFolderId(String value) {
        folderId = value;
    }

    public Folder getFolder() {
        return folder;
    }

    public void setFolder(Folder value) {
        folder = value;
    }
}

