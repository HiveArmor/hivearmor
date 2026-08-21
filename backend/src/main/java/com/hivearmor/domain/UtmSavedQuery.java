package com.hivearmor.domain;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

/**
 * A user-owned saved query persisted to the backend.
 * S-5B
 */
@Entity
@Table(name = "hive_saved_query")
@EntityListeners(AuditingEntityListener.class)
public class UtmSavedQuery implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "hive_saved_query_seq")
    @SequenceGenerator(name = "hive_saved_query_seq", sequenceName = "hive_saved_query_id_seq", allocationSize = 1)
    private Long id;

    @Column(name = "user_login", nullable = false, length = 255, updatable = false)
    private String userLogin;

    @Column(name = "query_name", nullable = false, length = 256)
    private String queryName;

    @Column(name = "query_text", nullable = false, columnDefinition = "TEXT")
    private String queryText;

    @Column(name = "index_pattern", length = 512)
    private String indexPattern;

    /**
     * Stored as JSONB in PostgreSQL; serialised as a JSON string in Java.
     */
    @Column(name = "time_range", columnDefinition = "jsonb")
    private String timeRange;

    /**
     * Stored as JSONB in PostgreSQL; serialised as a JSON string in Java.
     */
    @Column(name = "filters", columnDefinition = "jsonb")
    private String filters;

    @Column(name = "is_shared", nullable = false)
    private Boolean isShared = false;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ── Getters & setters ───────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUserLogin() { return userLogin; }
    public void setUserLogin(String userLogin) { this.userLogin = userLogin; }

    public String getQueryName() { return queryName; }
    public void setQueryName(String queryName) { this.queryName = queryName; }

    public String getQueryText() { return queryText; }
    public void setQueryText(String queryText) { this.queryText = queryText; }

    public String getIndexPattern() { return indexPattern; }
    public void setIndexPattern(String indexPattern) { this.indexPattern = indexPattern; }

    public String getTimeRange() { return timeRange; }
    public void setTimeRange(String timeRange) { this.timeRange = timeRange; }

    public String getFilters() { return filters; }
    public void setFilters(String filters) { this.filters = filters; }

    public Boolean getIsShared() { return isShared; }
    public void setIsShared(Boolean isShared) { this.isShared = isShared != null ? isShared : false; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
