package com.hivearmor.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * DTO for the HiveArmor EDR agent monitoring policy (T05).
 * Transferred across the REST boundary for GET /api/ha-edr/policies,
 * POST /api/ha-edr/policies, and PUT /api/ha-edr/policies/{id}.
 * No Lombok — every accessor is an explicit public method.
 */
public class AgentPolicyDTO {

    private Long id;

    @NotBlank
    @Size(max = 200)
    private String name;

    @NotBlank
    private String osType;
    private List<String> filePaths;
    private List<String> registryPaths;
    private Boolean networkMonitor;
    private Boolean processMonitor;
    private List<String> assignedAgentIds;
    private String createdAt;
    private String updatedAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getOsType() { return osType; }
    public void setOsType(String osType) { this.osType = osType; }

    public List<String> getFilePaths() { return filePaths; }
    public void setFilePaths(List<String> filePaths) { this.filePaths = filePaths; }

    public List<String> getRegistryPaths() { return registryPaths; }
    public void setRegistryPaths(List<String> registryPaths) { this.registryPaths = registryPaths; }

    public Boolean getNetworkMonitor() { return networkMonitor; }
    public void setNetworkMonitor(Boolean networkMonitor) { this.networkMonitor = networkMonitor; }

    public Boolean getProcessMonitor() { return processMonitor; }
    public void setProcessMonitor(Boolean processMonitor) { this.processMonitor = processMonitor; }

    public List<String> getAssignedAgentIds() { return assignedAgentIds; }
    public void setAssignedAgentIds(List<String> assignedAgentIds) { this.assignedAgentIds = assignedAgentIds; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
