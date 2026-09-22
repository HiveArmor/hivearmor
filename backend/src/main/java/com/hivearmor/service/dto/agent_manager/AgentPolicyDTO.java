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
    // PT-1 (template library) — visibility scope (GLOBAL|ORG), optional org qualifier,
    // and the flag marking a reusable library template vs an ad-hoc policy.
    private String scope;
    private String orgId;
    private Boolean isTemplate;
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
        this.scope = p.getScope();
        this.orgId = p.getOrgId();
        this.isTemplate = p.getIsTemplate();
        this.createdBy = p.getCreatedBy();
        this.createdAt = p.getCreatedAt();
        this.updatedAt = p.getUpdatedAt();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getPolicyName() { return policyName; }
    public void setPolicyName(String policyName) { this.policyName = policyName; }

    /**
     * PT-1 — {@code name} is the PT-0 template-envelope alias of {@code policyName}.
     * Accepting both lets a raw PT-0 template document round-trip through create/clone.
     * On read we do NOT emit {@code name} (canonical serialized key stays {@code policyName});
     * this alias is write-only to avoid duplicate keys in responses.
     */
    @com.fasterxml.jackson.annotation.JsonProperty("name")
    public void setName(String name) { if (name != null) this.policyName = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }
    public String getPolicyConfig() { return policyConfig; }
    public void setPolicyConfig(String policyConfig) { this.policyConfig = policyConfig; }
    public Integer getVersionNum() { return versionNum; }
    public void setVersionNum(Integer versionNum) { this.versionNum = versionNum; }

    /**
     * PT-1 — {@code version} is the PT-0 template-envelope alias of {@code versionNum}
     * (write-only, so a raw PT-0 template document round-trips). The server owns the
     * authoritative version counter and bumps it on edit; a supplied value is a hint only
     * and never trusted for the stored version (see UtmAgentPolicyService).
     */
    @com.fasterxml.jackson.annotation.JsonProperty("version")
    public void setVersion(Integer version) { if (version != null) this.versionNum = version; }

    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public String getOrgId() { return orgId; }
    public void setOrgId(String orgId) { this.orgId = orgId; }
    public Boolean getIsTemplate() { return isTemplate; }
    public void setIsTemplate(Boolean isTemplate) { this.isTemplate = isTemplate; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public List<Long> getAssignedGroupIds() { return assignedGroupIds; }
    public void setAssignedGroupIds(List<Long> assignedGroupIds) { this.assignedGroupIds = assignedGroupIds; }
}
