package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the {@code finding_notes} table.
 *
 * <p>Stores analyst notes attached to correlated findings, supporting @mentions
 * for collaboration within the finding lifecycle.
 *
 * <p>Sprint 44 — Correlated findings lifecycle mutations (COR-004).
 *
 * @see com.hivearmor.repository.FindingNoteRepository
 */
@Entity
@Table(name = "finding_notes")
public class FindingNote implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "finding_id", length = 64, nullable = false)
    private String findingId;

    @Column(name = "content", columnDefinition = "text", nullable = false)
    private String content;

    @Column(name = "author", length = 255, nullable = false)
    private String author;

    @Column(name = "mentions", columnDefinition = "text")
    private String mentions;

    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // ---- lifecycle ----

    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = Instant.now();
        }
    }

    // ---- getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getFindingId() { return findingId; }
    public void setFindingId(String findingId) { this.findingId = findingId; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }

    public String getMentions() { return mentions; }
    public void setMentions(String mentions) { this.mentions = mentions; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
