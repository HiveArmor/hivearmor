package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the {@code rule_versions} table.
 *
 * <p>Stores version history snapshots for detection rules, capturing the
 * expression and filters at each version for diff and revert operations.
 *
 * <p>Sprint 47 — Detection Rules (DET-016).
 *
 * @see com.hivearmor.repository.RuleVersionRepository
 */
@Entity
@Table(name = "rule_versions")
public class RuleVersion implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "rule_id", length = 36, nullable = false)
    private String ruleId;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "expression", columnDefinition = "text", nullable = false)
    private String expression;

    @Column(name = "filters", columnDefinition = "text")
    private String filters;

    @Column(name = "changes", columnDefinition = "text")
    private String changes;

    @Column(name = "author", length = 255, nullable = false)
    private String author;

    @Column(name = "status", length = 32, nullable = false)
    private String status;

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

    public String getExpression() { return expression; }
    public void setExpression(String expression) { this.expression = expression; }

    public String getFilters() { return filters; }
    public void setFilters(String filters) { this.filters = filters; }

    public String getChanges() { return changes; }
    public void setChanges(String changes) { this.changes = changes; }

    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
