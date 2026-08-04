package com.livesync.api.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "Folders")
public class Folder {
    @Id
    @Column(name = "Id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "Name", nullable = false, length = 200)
    private String name;

    @Column(name = "OwnerId", nullable = false)
    private String ownerId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "OwnerId", insertable = false, updatable = false)
    @JsonIgnore
    private ApplicationUser owner;

    @Column(name = "ParentFolderId")
    private String parentFolderId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ParentFolderId", insertable = false, updatable = false)
    @JsonIgnore
    private Folder parentFolder;

    @OneToMany(mappedBy = "parentFolder", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<Folder> subfolders = new ArrayList<>();

    @Column(name = "ShareCode", unique = true, length = 50)
    private String shareCode;

    @Column(name = "DefaultAccessLevel", nullable = false, length = 50)
    private String defaultAccessLevel = "View";

    @Column(name = "CreatedAt", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "UpdatedAt", nullable = false)
    private Instant updatedAt = Instant.now();

    @OneToMany(mappedBy = "folder", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<Document> documents = new ArrayList<>();

    @OneToMany(mappedBy = "folder", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<SharedFolder> sharedWith = new ArrayList<>();

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(String ownerId) {
        this.ownerId = ownerId;
    }

    public ApplicationUser getOwner() {
        return owner;
    }

    public void setOwner(ApplicationUser owner) {
        this.owner = owner;
    }

    public String getParentFolderId() {
        return parentFolderId;
    }

    public void setParentFolderId(String parentFolderId) {
        this.parentFolderId = parentFolderId;
    }

    public Folder getParentFolder() {
        return parentFolder;
    }

    public void setParentFolder(Folder parentFolder) {
        this.parentFolder = parentFolder;
    }

    public List<Folder> getSubfolders() {
        return subfolders;
    }

    public String getShareCode() {
        return shareCode;
    }

    public void setShareCode(String shareCode) {
        this.shareCode = shareCode;
    }

    public String getDefaultAccessLevel() {
        return defaultAccessLevel;
    }

    public void setDefaultAccessLevel(String defaultAccessLevel) {
        this.defaultAccessLevel = defaultAccessLevel;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public List<Document> getDocuments() {
        return documents;
    }

    public List<SharedFolder> getSharedWith() {
        return sharedWith;
    }
}
