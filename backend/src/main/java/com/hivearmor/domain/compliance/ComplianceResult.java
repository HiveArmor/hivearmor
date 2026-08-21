package com.hivearmor.domain.compliance;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the {@code ha_compliance_result} table.
 *
 * <p>Stores the outcome of a single compliance-control evaluation for a given
 * framework. The {@code client_id} column (added by Liquibase changeset
 * {@code 20260724051}) links this result to an MSSP-managed tenant in
 * {@code ha_client}. A {@code null} value indicates a non-tenant-scoped result
 * (single-tenant deployment or a global compliance run).
 *
 * <p>Sprint 24 — S24-T01: per-tenant compliance layer.
 *
 * @see com.hivearmor.repository.compliance.ComplianceResultRepository
 */
@Entity
@Table(name = "ha_compliance_result")
public class ComplianceResult implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "control_id", nullable = false)
    private Long controlId;

    @Column(name = "control_name", nullable = false, length = 255)
    private String controlName;

    @Column(name = "framework", nullable = false, length = 100)
    private String framework;

    @Column(name = "status", nullable = false, length = 50)
    private String status;

    @Column(name = "evaluated_at", nullable = false)
    private Instant evaluatedAt;

    /**
     * Owning tenant's {@code ha_client.id}; {@code null} for non-tenant-scoped results.
     * Added by Liquibase changeset {@code 20260724051}.
     * No foreign-key constraint is declared in that changeset.
     */
    @Column(name = "client_id")
    private Long clientId;

    // -------------------------------------------------------------------------
    // Getters and setters
    // -------------------------------------------------------------------------

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getControlId() {
        return controlId;
    }

    public void setControlId(Long controlId) {
        this.controlId = controlId;
    }

    public String getControlName() {
        return controlName;
    }

    public void setControlName(String controlName) {
        this.controlName = controlName;
    }

    public String getFramework() {
        return framework;
    }

    public void setFramework(String framework) {
        this.framework = framework;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getEvaluatedAt() {
        return evaluatedAt;
    }

    public void setEvaluatedAt(Instant evaluatedAt) {
        this.evaluatedAt = evaluatedAt;
    }

    public Long getClientId() {
        return clientId;
    }

    public void setClientId(Long clientId) {
        this.clientId = clientId;
    }
}
