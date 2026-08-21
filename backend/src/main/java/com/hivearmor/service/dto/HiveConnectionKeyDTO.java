package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/**
 * DTO matching the frontend ConnectionKeyDTO TypeScript type (ADM-06).
 * Backed by the existing api_keys table (ApiKey entity).
 * id is String in the frontend; we serialise the Long as a String here.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveConnectionKeyDTO {

    /** String id to match frontend contract. */
    private String id;
    private String name;
    private Instant createdDate;
    private Instant lastUsed;
    private Instant expiryDate;
    /** active | revoked | expired */
    private String status;
    private Long tenantId;

    // ---- getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Instant getCreatedDate() { return createdDate; }
    public void setCreatedDate(Instant createdDate) { this.createdDate = createdDate; }

    public Instant getLastUsed() { return lastUsed; }
    public void setLastUsed(Instant lastUsed) { this.lastUsed = lastUsed; }

    public Instant getExpiryDate() { return expiryDate; }
    public void setExpiryDate(Instant expiryDate) { this.expiryDate = expiryDate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }
}
