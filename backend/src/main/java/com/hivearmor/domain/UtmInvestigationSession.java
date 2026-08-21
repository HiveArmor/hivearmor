package com.hivearmor.domain;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

/**
 * An investigation session — a lightweight workspace for hunting/triage before a formal incident is created.
 * Status values: ACTIVE, CLOSED, CONVERTED.
 * S-5C
 */
@Entity
@Table(name = "hive_investigation_session")
@EntityListeners(AuditingEntityListener.class)
public class UtmInvestigationSession implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "hive_inv_session_seq")
    @SequenceGenerator(name = "hive_inv_session_seq", sequenceName = "hive_investigation_session_id_seq", allocationSize = 1)
    private Long id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version = 0L;

    /** Tenant scope captured from the verified request context. Null denotes legacy global data. */
    @Column(name = "tenant_id")
    private Long tenantId;

    @Column(name = "session_name", nullable = false, length = 512)
    private String sessionName;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /** ACTIVE | CLOSED | CONVERTED */
    @Column(name = "status", nullable = false, length = 32)
    private String status = "ACTIVE";

    @Column(name = "created_by", nullable = false, length = 255, updatable = false)
    private String createdBy;

    @Column(name = "assigned_to", length = 255)
    private String assignedTo;

    /**
     * Set when this session is converted to a formal incident.
     * No @ManyToOne — plain Long to avoid requiring the incident to exist.
     */
    @Column(name = "incident_id")
    private Long incidentId;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ── Getters & setters ───────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public String getSessionName() { return sessionName; }
    public void setSessionName(String sessionName) { this.sessionName = sessionName; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public String getAssignedTo() { return assignedTo; }
    public void setAssignedTo(String assignedTo) { this.assignedTo = assignedTo; }

    public Long getIncidentId() { return incidentId; }
    public void setIncidentId(Long incidentId) { this.incidentId = incidentId; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
