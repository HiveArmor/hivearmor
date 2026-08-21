package com.hivearmor.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the ha_alert_view table.
 *
 * Stores saved triage views (filter + sort + column configurations) that SOC
 * analysts create to switch between different alert workload perspectives.
 *
 * IDs 1–10 are reserved for built-in system views and are immutable.
 *
 * Backs GET/POST/PATCH/DELETE /api/ha-alert-views
 */
@Entity
@Table(name = "ha_alert_view")
public class HaAlertView implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "filter_ast", nullable = false, columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String filterAst;

    @Column(name = "sort", length = 512)
    private String sort;

    @Column(name = "visible_columns", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String visibleColumns;

    @Column(name = "density", length = 20)
    private String density;

    @Column(name = "is_shared")
    private Boolean isShared;

    @Column(name = "is_default")
    private Boolean isDefault;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ---- lifecycle ----

    @PrePersist
    public void prePersist() {
        Instant now = Instant.now();
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        if (this.updatedAt == null) {
            this.updatedAt = now;
        }
        if (this.version == null) {
            this.version = 1;
        }
        if (this.density == null) {
            this.density = "default";
        }
        if (this.isShared == null) {
            this.isShared = false;
        }
        if (this.isDefault == null) {
            this.isDefault = false;
        }
    }

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long ownerId) { this.ownerId = ownerId; }

    public String getFilterAst() { return filterAst; }
    public void setFilterAst(String filterAst) { this.filterAst = filterAst; }

    public String getSort() { return sort; }
    public void setSort(String sort) { this.sort = sort; }

    public String getVisibleColumns() { return visibleColumns; }
    public void setVisibleColumns(String visibleColumns) { this.visibleColumns = visibleColumns; }

    public String getDensity() { return density; }
    public void setDensity(String density) { this.density = density; }

    public Boolean getIsShared() { return isShared; }
    public void setIsShared(Boolean isShared) { this.isShared = isShared; }

    public Boolean getIsDefault() { return isDefault; }
    public void setIsDefault(Boolean isDefault) { this.isDefault = isDefault; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
