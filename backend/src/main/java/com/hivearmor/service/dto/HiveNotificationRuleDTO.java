package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.Map;

/**
 * DTO matching the frontend NotificationRuleDTO TypeScript type (ADM-03).
 * destinationConfig is exposed as a typed map; the entity stores it as JSON text.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveNotificationRuleDTO {

    private String id;

    @NotBlank
    @Size(max = 200)
    private String name;

    @NotNull
    @Min(0)
    @Max(4)
    private Integer severityThreshold;

    @NotBlank
    private String destinationType;
    private Map<String, String> destinationConfig;
    private Boolean enabled;
    private Instant createdAt;
    private Instant updatedAt;
    private Long tenantId;

    // ---- getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Integer getSeverityThreshold() { return severityThreshold; }
    public void setSeverityThreshold(Integer severityThreshold) { this.severityThreshold = severityThreshold; }

    public String getDestinationType() { return destinationType; }
    public void setDestinationType(String destinationType) { this.destinationType = destinationType; }

    public Map<String, String> getDestinationConfig() { return destinationConfig; }
    public void setDestinationConfig(Map<String, String> destinationConfig) { this.destinationConfig = destinationConfig; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }
}
