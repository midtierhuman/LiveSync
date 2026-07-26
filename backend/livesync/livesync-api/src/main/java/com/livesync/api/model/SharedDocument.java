package com.livesync.api.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "SharedDocuments", uniqueConstraints = @UniqueConstraint(columnNames = {"DocumentId", "UserId"}))
public class SharedDocument {
    @Id @Column(name = "Id") private String id = UUID.randomUUID().toString();
    @Column(name = "DocumentId", nullable = false) private String documentId;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "DocumentId", insertable = false, updatable = false) private Document document;
    @Column(name = "UserId", nullable = false) private String userId;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "UserId", insertable = false, updatable = false) private ApplicationUser user;
    @Column(name = "SharedAt", nullable = false) private Instant sharedAt;
    @Column(name = "AccessLevel", length = 50) private String accessLevel = "View";
    public String getId() { return id; } public String getDocumentId() { return documentId; } public void setDocumentId(String value) { documentId = value; }
    public Document getDocument() { return document; } public String getUserId() { return userId; } public void setUserId(String value) { userId = value; }
    public ApplicationUser getUser() { return user; } public Instant getSharedAt() { return sharedAt; } public void setSharedAt(Instant value) { sharedAt = value; }
    public String getAccessLevel() { return accessLevel; } public void setAccessLevel(String value) { accessLevel = value; }
}
