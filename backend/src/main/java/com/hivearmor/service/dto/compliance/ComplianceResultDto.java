package com.hivearmor.service.dto.compliance;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

/**
 * Data-transfer object for {@link com.hivearmor.domain.compliance.ComplianceResult}.
 *
 * <p>The {@code tenantPrefix} field is populated from {@code ha_client.client_prefix}
 * via a lookup on {@code client_id}. It is {@code null} when the underlying entity
 * has no {@code client_id} (non-tenant-scoped row).
 *
 * <p>All consumers that were constructed before Sprint 24 continue to compile unchanged
 * because the {@code tenantPrefix} field is entirely optional — it has no constructor
 * parameter and defaults to {@code null}.
 *
 * <p>Sprint 24 — S24-T01: per-tenant compliance layer.
 */
public class ComplianceResultDto {

    private Long id;

    private Long controlId;

    private String controlName;

    private String framework;

    private String status;

    private Instant evaluatedAt;

    /**
     * Owning tenant's {@code client_prefix}; {@code null} for non-tenant-scoped rows.
     *
     * <p>JSON property name is exactly {@code "tenantPrefix"} as required by
     * Requirement 4.4.
     */
    @JsonProperty("tenantPrefix")
    private String tenantPrefix;

    // -------------------------------------------------------------------------
    // Getters and setters
    // -------------------------------------------------------------------------

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getControlId() {
        return controlId;
    }

    public void setControlId(Long controlId) {
        this.controlId = controlId;
    }

    public String getControlName() {
        return controlName;
    }

    public void setControlName(String controlName) {
        this.controlName = controlName;
    }

    public String getFramework() {
        return framework;
    }

    public void setFramework(String framework) {
        this.framework = framework;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getEvaluatedAt() {
        return evaluatedAt;
    }

    public void setEvaluatedAt(Instant evaluatedAt) {
        this.evaluatedAt = evaluatedAt;
    }

    public String getTenantPrefix() {
        return tenantPrefix;
    }

    public void setTenantPrefix(String tenantPrefix) {
        this.tenantPrefix = tenantPrefix;
    }
}
