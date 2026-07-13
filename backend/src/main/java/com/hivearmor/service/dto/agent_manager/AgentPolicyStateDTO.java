package com.hivearmor.service.dto.agent_manager;

import com.hivearmor.domain.agents_manager.UtmAgentPolicyState;

import java.time.Instant;

public class AgentPolicyStateDTO {
    private Long id;
    private String agentId;
    private Long policyId;
    private Integer appliedVersion;
    private Integer desiredVersion;
    private String state;
    private Instant lastCheckedAt;
    private Instant lastAppliedAt;
    private String driftDetails;

    public AgentPolicyStateDTO() {}

    public AgentPolicyStateDTO(UtmAgentPolicyState s) {
        this.id = s.getId();
        this.agentId = s.getAgentId();
        this.policyId = s.getPolicyId();
        this.appliedVersion = s.getAppliedVersion();
        this.desiredVersion = s.getDesiredVersion();
        this.state = s.getState();
        this.lastCheckedAt = s.getLastCheckedAt();
        this.lastAppliedAt = s.getLastAppliedAt();
        this.driftDetails = s.getDriftDetails();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAgentId() { return agentId; }
    public void setAgentId(String agentId) { this.agentId = agentId; }
    public Long getPolicyId() { return policyId; }
    public void setPolicyId(Long policyId) { this.policyId = policyId; }
    public Integer getAppliedVersion() { return appliedVersion; }
    public void setAppliedVersion(Integer appliedVersion) { this.appliedVersion = appliedVersion; }
    public Integer getDesiredVersion() { return desiredVersion; }
    public void setDesiredVersion(Integer desiredVersion) { this.desiredVersion = desiredVersion; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public Instant getLastCheckedAt() { return lastCheckedAt; }
    public void setLastCheckedAt(Instant lastCheckedAt) { this.lastCheckedAt = lastCheckedAt; }
    public Instant getLastAppliedAt() { return lastAppliedAt; }
    public void setLastAppliedAt(Instant lastAppliedAt) { this.lastAppliedAt = lastAppliedAt; }
    public String getDriftDetails() { return driftDetails; }
    public void setDriftDetails(String driftDetails) { this.driftDetails = driftDetails; }
}
