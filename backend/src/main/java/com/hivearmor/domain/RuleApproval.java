package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the {@code rule_approvals} table.
 *
 * <p>Stores review/approval records for detection rules. Each approval
 * or rejection is recorded with reviewer, comment, and timestamp.
 *
 * <p>Sprint 47 — Detection Rules (DET-016).
 *
 * @see com.hivearmor.repository.RuleApprovalRepository
 */
@Entity
@Table(name = "rule_approvals")
public class RuleApproval implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "rule_id", length = 36, nullable = false)
    private String ruleId;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "reviewer", length = 255, nullable = false)
    private String reviewer;

    @Column(name = "status", length = 32, nullable = false)
    private String status;

    @Column(name = "comment", columnDefinition = "text")
    private String comment;

    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    @Column(name = "created_at")
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

    public String getRuleId() { return ruleId; }
    public void setRuleId(String ruleId) { this.ruleId = ruleId; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public String getReviewer() { return reviewer; }
    public void setReviewer(String reviewer) { this.reviewer = reviewer; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
