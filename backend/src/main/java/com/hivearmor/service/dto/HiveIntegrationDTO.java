package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.Map;

/**
 * DTO matching the frontend IntegrationDTO TypeScript type (ADM-02).
 *
 * The existing UtmIntegration entity stores module-level catalogue data.
 * This DTO is used by HaIntegrationsResource to expose the integration
 * records in the shape the frontend expects: id as String, status field,
 * config map, tenant context.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveIntegrationDTO {

    private String id;
    private String name;
    private String type;
    /** connected | degraded | disconnected | pending */
    private String status;
    private String lastSeen;
    private Double eventsPerSecond;
    private Long tenantId;
    private Map<String, String> config;
    private Instant createdAt;
    private Instant updatedAt;

    // ---- getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getLastSeen() { return lastSeen; }
    public void setLastSeen(String lastSeen) { this.lastSeen = lastSeen; }

    public Double getEventsPerSecond() { return eventsPerSecond; }
    public void setEventsPerSecond(Double eventsPerSecond) { this.eventsPerSecond = eventsPerSecond; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public Map<String, String> getConfig() { return config; }
    public void setConfig(Map<String, String> config) { this.config = config; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
