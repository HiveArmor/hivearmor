package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * DTO matching the frontend TenantDTO TypeScript type.
 * Backed by the existing hive_client table (UtmClient entity).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveTenantDTO {

    private Long id;

    @NotBlank
    @Size(max = 200)
    private String name;

    @Size(max = 253)
    private String domain;

    /** Unique prefix used for data partitioning; immutable after creation. */
    @Size(max = 50)
    @Pattern(regexp = "^[a-z0-9-]*$", message = "must contain only lowercase letters, digits, and hyphens")
    private String prefix;

    /** ACTIVE | SUSPENDED | PROVISIONING | DEPROVISIONED */
    @Pattern(regexp = "ACTIVE|SUSPENDED|PROVISIONING|DEPROVISIONED")
    private String status;
    private Instant licenceExpire;
    private Instant createdAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDomain() { return domain; }
    public void setDomain(String domain) { this.domain = domain; }

    public String getPrefix() { return prefix; }
    public void setPrefix(String prefix) { this.prefix = prefix; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getLicenceExpire() { return licenceExpire; }
    public void setLicenceExpire(Instant licenceExpire) { this.licenceExpire = licenceExpire; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
