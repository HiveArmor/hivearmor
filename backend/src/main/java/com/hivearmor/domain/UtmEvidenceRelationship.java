package com.hivearmor.domain;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

/**
 * A directed typed relationship (edge) between two evidence items on a board.
 * relationship_type: RELATED | CAUSED_BY | LEADS_TO | CONTRADICTS
 * S-4A
 */
@Entity
@Table(name = "hive_evidence_relationship")
@EntityListeners(AuditingEntityListener.class)
public class UtmEvidenceRelationship implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "incident_id", nullable = false)
    private Long incidentId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_item_id", nullable = false)
    private UtmEvidenceItem sourceItem;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "target_item_id", nullable = false)
    private UtmEvidenceItem targetItem;

    /**
     * RELATED | CAUSED_BY | LEADS_TO | CONTRADICTS
     */
    @Column(name = "relationship_type", nullable = false, length = 64)
    private String relationshipType;

    @Column(name = "label", length = 255)
    private String label;

    @Column(name = "created_by", nullable = false, length = 255, updatable = false)
    private String createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // ── Getters & setters ───────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getIncidentId() { return incidentId; }
    public void setIncidentId(Long incidentId) { this.incidentId = incidentId; }

    public UtmEvidenceItem getSourceItem() { return sourceItem; }
    public void setSourceItem(UtmEvidenceItem sourceItem) { this.sourceItem = sourceItem; }

    public UtmEvidenceItem getTargetItem() { return targetItem; }
    public void setTargetItem(UtmEvidenceItem targetItem) { this.targetItem = targetItem; }

    public String getRelationshipType() { return relationshipType; }
    public void setRelationshipType(String relationshipType) { this.relationshipType = relationshipType; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
