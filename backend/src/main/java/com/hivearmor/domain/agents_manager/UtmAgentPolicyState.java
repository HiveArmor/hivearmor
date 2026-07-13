package com.hivearmor.domain.agents_manager;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_agent_policy_state")
public class UtmAgentPolicyState implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "agent_id", length = 150, nullable = false)
    private String agentId;

    @Column(name = "policy_id", nullable = false)
    private Long policyId;

    @Column(name = "applied_version")
    private Integer appliedVersion;

    @Column(name = "desired_version")
    private Integer desiredVersion;

    @Column(name = "state", length = 30, nullable = false)
    private String state;

    @Column(name = "last_checked_at")
    private Instant lastCheckedAt;

    @Column(name = "last_applied_at")
    private Instant lastAppliedAt;

    @Column(name = "drift_details", columnDefinition = "TEXT")
    private String driftDetails;

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
