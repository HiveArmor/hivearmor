package com.hivearmor.domain;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

/**
 * Data retention policy for a specific data type.
 * One row per DataType enum value; seeded by Liquibase.
 *
 * Backs /api/ha-retention-policies/{dataType}
 */
@Entity
@Table(name = "hive_retention_policy")
@EntityListeners(AuditingEntityListener.class)
public class HiveRetentionPolicy implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 255)
    private String name;

    /**
     * ALERT | INCIDENT | AUDIT | AUTH_LOG | NETWORK_FLOW |
     * ENDPOINT_EVENT | VULNERABILITY | COMPLIANCE | CUSTOM
     */
    @Column(name = "data_type", nullable = false, unique = true, length = 64)
    private String dataType;

    /** 1 – 3650 (days). */
    @Column(name = "retention_days", nullable = false)
    private Integer retentionDays = 90;

    @Column(name = "compression_enabled", nullable = false)
    private Boolean compressionEnabled = false;

    /** NONE | S3 | LOCAL */
    @Column(name = "archive_target", nullable = false, length = 16)
    private String archiveTarget = "NONE";

    @Column(name = "archive_path", length = 1024)
    private String archivePath;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDataType() { return dataType; }
    public void setDataType(String dataType) { this.dataType = dataType; }

    public Integer getRetentionDays() { return retentionDays; }
    public void setRetentionDays(Integer retentionDays) { this.retentionDays = retentionDays; }

    public Boolean getCompressionEnabled() { return compressionEnabled; }
    public void setCompressionEnabled(Boolean compressionEnabled) { this.compressionEnabled = compressionEnabled; }

    public String getArchiveTarget() { return archiveTarget; }
    public void setArchiveTarget(String archiveTarget) { this.archiveTarget = archiveTarget; }

    public String getArchivePath() { return archivePath; }
    public void setArchivePath(String archivePath) { this.archivePath = archivePath; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
