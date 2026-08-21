package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the ha_saved_hunt table.
 *
 * Stores saved hunt queries created by analysts. A hunt can be private
 * (isShared = false) or shared with all users (isShared = true).
 *
 * Backs GET/POST/PUT/DELETE /api/ha-saved-hunts
 */
@Entity
@Table(name = "ha_saved_hunt")
public class HaSavedHunt implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "hunt_name", nullable = false)
    private String huntName;

    @Column(name = "query_dsl", columnDefinition = "TEXT")
    private String queryDsl;

    @Column(name = "nl_query", columnDefinition = "TEXT")
    private String nlQuery;

    @Column(name = "filter_json", columnDefinition = "TEXT")
    private String filterJson;

    @Column(name = "created_by", nullable = false)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "is_shared", nullable = false)
    private Boolean isShared;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getHuntName() { return huntName; }
    public void setHuntName(String huntName) { this.huntName = huntName; }

    public String getQueryDsl() { return queryDsl; }
    public void setQueryDsl(String queryDsl) { this.queryDsl = queryDsl; }

    public String getNlQuery() { return nlQuery; }
    public void setNlQuery(String nlQuery) { this.nlQuery = nlQuery; }

    public String getFilterJson() { return filterJson; }
    public void setFilterJson(String filterJson) { this.filterJson = filterJson; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Boolean getIsShared() { return isShared; }
    public void setIsShared(Boolean isShared) { this.isShared = isShared; }

    public Instant getLastUsedAt() { return lastUsedAt; }
    public void setLastUsedAt(Instant lastUsedAt) { this.lastUsedAt = lastUsedAt; }
}
