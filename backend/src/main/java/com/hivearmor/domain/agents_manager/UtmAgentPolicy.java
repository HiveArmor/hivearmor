package com.hivearmor.domain.agents_manager;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_agent_policy")
public class UtmAgentPolicy implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "policy_name", length = 200, nullable = false, unique = true)
    private String policyName;

    // SPEC-04 (W1b) — authoritative tenant, assigned server-side at create (never
    // from payload). Nullable during rollout; single-tenant NOT NULL by 20260913004.
    @Column(name = "tenant_id")
    private Long tenantId;

    @Column(name = "description", length = 500)
    private String description;

    @Column(name = "platform", length = 50)
    private String platform;

    @Column(name = "policy_config", columnDefinition = "TEXT", nullable = false)
    private String policyConfig;

    @Column(name = "version_num", nullable = false)
    private Integer versionNum = 1;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "created_by", length = 100, nullable = false)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }
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
}
