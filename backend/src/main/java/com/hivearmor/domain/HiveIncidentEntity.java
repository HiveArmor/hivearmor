package com.hivearmor.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * Join table: links a named entity (by entityId + entityType) to an incident.
 * Backs POST /api/ha-incidents/{incidentId}/entities
 */
@Entity
@Table(name = "hive_incident_entity",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_incident_entity",
        columnNames = {"incident_id", "entity_id"}
    ))
public class HiveIncidentEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "incident_id", nullable = false)
    private Long incidentId;

    /** String key matching hive_uba_entity_risk.entity_id */
    @Column(name = "entity_id", nullable = false, length = 150)
    private String entityId;

    /** host | user | ip | process | file | domain */
    @Column(name = "entity_type", nullable = false, length = 20)
    private String entityType;

    @Column(name = "added_by", nullable = false, length = 255)
    private String addedBy;

    @Column(name = "added_at", nullable = false)
    private Instant addedAt = Instant.now();

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getIncidentId() { return incidentId; }
    public void setIncidentId(Long incidentId) { this.incidentId = incidentId; }

    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }

    public String getEntityType() { return entityType; }
    public void setEntityType(String entityType) { this.entityType = entityType; }

    public String getAddedBy() { return addedBy; }
    public void setAddedBy(String addedBy) { this.addedBy = addedBy; }

    public Instant getAddedAt() { return addedAt; }
    public void setAddedAt(Instant addedAt) { this.addedAt = addedAt; }
}
