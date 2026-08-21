package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the hunt_history table.
 *
 * Records each search query execution for per-user query history.
 * Auto-pruned to keep a maximum of 100 entries per user.
 *
 * Backs GET/DELETE /api/ha-hunts/history
 */
@Entity
@Table(name = "hunt_history")
public class HuntHistory implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "query", nullable = false, columnDefinition = "TEXT")
    private String query;

    @Column(name = "filters", columnDefinition = "TEXT")
    private String filters;

    @Column(name = "executed_at", nullable = false)
    private Instant executedAt;

    @Column(name = "duration")
    private Long duration;

    @Column(name = "result_count")
    private Integer resultCount;

    @Column(name = "status", length = 32)
    private String status;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    @Column(name = "saved_hunt_id", length = 36)
    private String savedHuntId;

    // ---- getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getQuery() { return query; }
    public void setQuery(String query) { this.query = query; }

    public String getFilters() { return filters; }
    public void setFilters(String filters) { this.filters = filters; }

    public Instant getExecutedAt() { return executedAt; }
    public void setExecutedAt(Instant executedAt) { this.executedAt = executedAt; }

    public Long getDuration() { return duration; }
    public void setDuration(Long duration) { this.duration = duration; }

    public Integer getResultCount() { return resultCount; }
    public void setResultCount(Integer resultCount) { this.resultCount = resultCount; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public String getSavedHuntId() { return savedHuntId; }
    public void setSavedHuntId(String savedHuntId) { this.savedHuntId = savedHuntId; }
}
