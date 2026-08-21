package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the saved_hunts table.
 *
 * Stores saved hunt queries with full metadata including tags, schedule,
 * sharing, and run statistics. Supports multi-tenant isolation via tenant_id.
 *
 * Backs GET/POST/PATCH/DELETE /api/ha-hunts/saved
 */
@Entity
@Table(name = "saved_hunts")
public class SavedHunt implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "query", nullable = false, columnDefinition = "TEXT")
    private String query;

    @Column(name = "filters", columnDefinition = "TEXT")
    private String filters;

    @Column(name = "schedule", length = 64)
    private String schedule;

    @Column(name = "tags", columnDefinition = "TEXT")
    private String tags;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    @Column(name = "shared", nullable = false)
    private Boolean shared = false;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "last_run_at")
    private Instant lastRunAt;

    @Column(name = "run_count", nullable = false)
    private Integer runCount = 0;

    // ---- getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getQuery() { return query; }
    public void setQuery(String query) { this.query = query; }

    public String getFilters() { return filters; }
    public void setFilters(String filters) { this.filters = filters; }

    public String getSchedule() { return schedule; }
    public void setSchedule(String schedule) { this.schedule = schedule; }

    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public Boolean getShared() { return shared; }
    public void setShared(Boolean shared) { this.shared = shared; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public Instant getLastRunAt() { return lastRunAt; }
    public void setLastRunAt(Instant lastRunAt) { this.lastRunAt = lastRunAt; }

    public Integer getRunCount() { return runCount; }
    public void setRunCount(Integer runCount) { this.runCount = runCount; }
}
