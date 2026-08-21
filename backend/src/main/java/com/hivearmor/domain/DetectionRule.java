package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the {@code detection_rules} table.
 *
 * <p>Stores detection rule definitions including CEL expressions,
 * MITRE ATT&amp;CK mappings, scheduling, and lifecycle state.
 *
 * <p>Sprint 47 — Detection Rules (DET-008 through DET-016).
 *
 * @see com.hivearmor.repository.DetectionRuleRepository
 */
@Entity
@Table(name = "detection_rules")
public class DetectionRule implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "name", length = 500, nullable = false)
    private String name;

    @Column(name = "description", columnDefinition = "text")
    private String description;

    @Column(name = "expression", columnDefinition = "text", nullable = false)
    private String expression;

    @Column(name = "filters", columnDefinition = "text")
    private String filters;

    @Column(name = "schedule", length = 64)
    private String schedule;

    @Column(name = "scope", length = 32, nullable = false)
    private String scope;

    @Column(name = "status", length = 32, nullable = false)
    private String status;

    @Column(name = "severity", length = 32, nullable = false)
    private String severity;

    @Column(name = "mitre_tactics", columnDefinition = "text")
    private String mitreTactics;

    @Column(name = "mitre_techniques", columnDefinition = "text")
    private String mitreTechniques;

    @Column(name = "tags", columnDefinition = "text")
    private String tags;

    @Column(name = "author", length = 255, nullable = false)
    private String author;

    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "sigma_source", columnDefinition = "text")
    private String sigmaSource;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    // ---- lifecycle ----

    @PrePersist
    public void prePersist() {
        if (this.scope == null) {
            this.scope = "custom";
        }
        if (this.status == null) {
            this.status = "draft";
        }
        if (this.version == null) {
            this.version = 1;
        }
        if (this.createdAt == null) {
            this.createdAt = Instant.now();
        }
        if (this.updatedAt == null) {
            this.updatedAt = Instant.now();
        }
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
    }

    // ---- getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getExpression() { return expression; }
    public void setExpression(String expression) { this.expression = expression; }

    public String getFilters() { return filters; }
    public void setFilters(String filters) { this.filters = filters; }

    public String getSchedule() { return schedule; }
    public void setSchedule(String schedule) { this.schedule = schedule; }

    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getMitreTactics() { return mitreTactics; }
    public void setMitreTactics(String mitreTactics) { this.mitreTactics = mitreTactics; }

    public String getMitreTechniques() { return mitreTechniques; }
    public void setMitreTechniques(String mitreTechniques) { this.mitreTechniques = mitreTechniques; }

    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }

    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public String getSigmaSource() { return sigmaSource; }
    public void setSigmaSource(String sigmaSource) { this.sigmaSource = sigmaSource; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
