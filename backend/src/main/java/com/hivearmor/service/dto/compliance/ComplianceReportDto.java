package com.hivearmor.service.dto.compliance;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Data-transfer object returned by
 * {@link com.hivearmor.web.rest.compliance.ComplianceReportGenerationController}.
 *
 * <p>The {@code tenantPrefix} and {@code tenantName} fields are populated by
 * {@link com.hivearmor.service.compliance.ComplianceReportGenerationService}
 * from the {@code ha_client} row identified by the caller-supplied {@code tenantId}.
 * They may be {@code null} when the client row has no {@code client_prefix} set.
 *
 * <p>All other fields default to {@code null}, permitting a "stub" construction
 * (as used during task 2.1) without compiler errors.
 *
 * <p>Sprint 24 — S24-T02: per-tenant compliance report generation endpoint.
 *
 * @see com.hivearmor.web.rest.compliance.ComplianceReportGenerationController
 * @see com.hivearmor.service.compliance.ComplianceReportGenerationService
 */
public class ComplianceReportDto {

    private Long id;

    private Long tenantId;

    /**
     * Owning tenant's {@code ha_client.client_prefix}; {@code null} when the
     * row has no prefix set.
     *
     * <p>Serialised as exactly {@code "tenantPrefix"} — Requirement 7.4.
     */
    @JsonProperty("tenantPrefix")
    private String tenantPrefix;

    /**
     * Owning tenant's display name ({@code ha_client.name}); {@code null} when
     * the row has no name set.
     *
     * <p>Serialised as exactly {@code "tenantName"} — Requirement 7.4.
     */
    @JsonProperty("tenantName")
    private String tenantName;

    // -------------------------------------------------------------------------
    // Getters and setters
    // -------------------------------------------------------------------------

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }

    public String getTenantPrefix() {
        return tenantPrefix;
    }

    public void setTenantPrefix(String tenantPrefix) {
        this.tenantPrefix = tenantPrefix;
    }

    public String getTenantName() {
        return tenantName;
    }

    public void setTenantName(String tenantName) {
        this.tenantName = tenantName;
    }
}
