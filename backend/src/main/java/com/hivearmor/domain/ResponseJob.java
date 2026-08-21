package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the {@code response_jobs} table.
 *
 * <p>Tracks asynchronous response action jobs through their lifecycle:
 * queued → running → completed/failed/cancelled/rolled_back.
 *
 * <p>Sprint 41 — Response action execution and status tracking (ALT-010).
 *
 * @see com.hivearmor.repository.ResponseJobRepository
 */
@Entity
@Table(name = "response_jobs")
public class ResponseJob implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "action_id", length = 64, nullable = false)
    private String actionId;

    @Column(name = "target_id", length = 255, nullable = false)
    private String targetId;

    @Column(name = "target_type", length = 32, nullable = false)
    private String targetType;

    @Column(name = "parameters", columnDefinition = "text")
    private String parameters;

    @Column(name = "status", length = 32, nullable = false)
    private String status;

    @Column(name = "created_by", length = 255, nullable = false)
    private String createdBy;

    @Column(name = "approved_by", length = 255)
    private String approvedBy;

    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "result", columnDefinition = "text")
    private String result;

    @Column(name = "error_code", length = 64)
    private String errorCode;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    @Column(name = "alert_id", length = 64)
    private String alertId;

    // ---- lifecycle ----

    @PrePersist
    public void prePersist() {
        if (this.status == null) {
            this.status = "queued";
        }
        if (this.createdAt == null) {
            this.createdAt = Instant.now();
        }
    }

    // ---- getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getActionId() { return actionId; }
    public void setActionId(String actionId) { this.actionId = actionId; }

    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }

    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }

    public String getParameters() { return parameters; }
    public void setParameters(String parameters) { this.parameters = parameters; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }

    public String getResult() { return result; }
    public void setResult(String result) { this.result = result; }

    public String getErrorCode() { return errorCode; }
    public void setErrorCode(String errorCode) { this.errorCode = errorCode; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public String getAlertId() { return alertId; }
    public void setAlertId(String alertId) { this.alertId = alertId; }
}
