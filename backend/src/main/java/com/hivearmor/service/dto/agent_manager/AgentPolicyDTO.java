package com.hivearmor.service.dto.agent_manager;

import com.hivearmor.domain.agents_manager.UtmAgentPolicy;

import java.time.Instant;
import java.util.List;

public class AgentPolicyDTO {
    private Long id;
    private String policyName;
    private String description;
    private String platform;
    private String policyConfig;
    private Integer versionNum;
    private Boolean isActive;
    private String createdBy;
    private Instant createdAt;
    private Instant updatedAt;
    private List<Long> assignedGroupIds;

    public AgentPolicyDTO() {}

    public AgentPolicyDTO(UtmAgentPolicy p) {
        this.id = p.getId();
        this.policyName = p.getPolicyName();
        this.description = p.getDescription();
        this.platform = p.getPlatform();
        this.policyConfig = p.getPolicyConfig();
        this.versionNum = p.getVersionNum();
        this.isActive = p.getIsActive();
        this.createdBy = p.getCreatedBy();
        this.createdAt = p.getCreatedAt();
        this.updatedAt = p.getUpdatedAt();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getPolicyName() { return policyName; }
    public void setPolicyName(String policyName) { this.policyName = policyName; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }
    public String getPolicyConfig() { return policyConfig; }
    public void setPolicyConfig(String policyConfig) { this.policyConfig = policyConfig; }
    public Integer getVersionNum() { return versionNum; }
    public void setVersionNum(Integer versionNum) { this.versionNum = versionNum; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public List<Long> getAssignedGroupIds() { return assignedGroupIds; }
    public void setAssignedGroupIds(List<Long> assignedGroupIds) { this.assignedGroupIds = assignedGroupIds; }
}
