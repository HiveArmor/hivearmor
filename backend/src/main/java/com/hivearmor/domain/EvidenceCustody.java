package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the {@code evidence_custody} table.
 *
 * <p>Represents a single event in an evidence item's chain of custody.
 * Custody records are append-only — no UPDATE or DELETE operations are permitted.
 *
 * <p>Sprint 43 — Evidence provenance and custody chain (INC-007).
 *
 * @see com.hivearmor.repository.EvidenceCustodyRepository
 */
@Entity
@Table(name = "evidence_custody")
public class EvidenceCustody implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "evidence_id", length = 64, nullable = false)
    private String evidenceId;

    @Column(name = "incident_id", length = 64, nullable = false)
    private String incidentId;

    @Column(name = "actor", length = 255, nullable = false)
    private String actor;

    @Column(name = "action", length = 64, nullable = false)
    private String action;

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

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

    public String getEvidenceId() { return evidenceId; }
    public void setEvidenceId(String evidenceId) { this.evidenceId = evidenceId; }

    public String getIncidentId() { return incidentId; }
    public void setIncidentId(String incidentId) { this.incidentId = incidentId; }

    public String getActor() { return actor; }
    public void setActor(String actor) { this.actor = actor; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
