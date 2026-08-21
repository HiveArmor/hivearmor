package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * DTO matching the frontend RetentionPolicyDTO TypeScript type.
 * archivePath is nullable (null when archiveTarget == NONE).
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public class HiveRetentionPolicyDTO {

    private Long id;

    @NotBlank
    @Size(max = 200)
    private String name;

    @NotBlank
    private String dataType;

    @NotNull
    @Min(1)
    private Integer retentionDays;
    private Boolean compressionEnabled;
    private String archiveTarget;
    private String archivePath;     // null when archiveTarget == NONE
    private Instant createdAt;
    private Instant updatedAt;
    /**
     * True when the backing store rejects UPDATE/DELETE. retentionDays then describes
     * operator export-copy hold, not source-table deletion.
     */
    private Boolean sourceImmutable;

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

    public Boolean getSourceImmutable() { return sourceImmutable; }
    public void setSourceImmutable(Boolean sourceImmutable) { this.sourceImmutable = sourceImmutable; }
}
