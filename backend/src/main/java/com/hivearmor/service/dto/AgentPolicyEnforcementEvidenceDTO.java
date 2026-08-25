package com.hivearmor.service.dto;

import com.hivearmor.service.dto.agent_manager.AgentPolicyStateDTO;

import java.util.ArrayList;
import java.util.List;

/**
 * Honesty projection for agent policy enforcement evidence (POL-001 / STAGING CANDIDATE).
 *
 * <p>Surfaces real assignment from {@code ha_agent_policy} plus any agent-reported
 * rows from {@code hive_agent_policy_state} ({@link AgentPolicyStateDTO} fields).
 * Never invents host enforcement; {@code evidenceAvailability} is only
 * {@code unavailable} or {@code partial} until a production-verified agent path exists.
 */
public class AgentPolicyEnforcementEvidenceDTO {

    private Long policyId;
    private List<String> assignedAgentIds = new ArrayList<>();
    /** {@code unavailable} | {@code partial} — never claim complete host enforcement here. */
    private String evidenceAvailability;
    private String honestyNote;
    private List<AgentPolicyStateDTO> agentStates = new ArrayList<>();

    public Long getPolicyId() {
        return policyId;
    }

    public void setPolicyId(Long policyId) {
        this.policyId = policyId;
    }

    public List<String> getAssignedAgentIds() {
        return assignedAgentIds;
    }

    public void setAssignedAgentIds(List<String> assignedAgentIds) {
        this.assignedAgentIds = assignedAgentIds != null ? assignedAgentIds : new ArrayList<>();
    }

    public String getEvidenceAvailability() {
        return evidenceAvailability;
    }

    public void setEvidenceAvailability(String evidenceAvailability) {
        this.evidenceAvailability = evidenceAvailability;
    }

    public String getHonestyNote() {
        return honestyNote;
    }

    public void setHonestyNote(String honestyNote) {
        this.honestyNote = honestyNote;
    }

    public List<AgentPolicyStateDTO> getAgentStates() {
        return agentStates;
    }

    public void setAgentStates(List<AgentPolicyStateDTO> agentStates) {
        this.agentStates = agentStates != null ? agentStates : new ArrayList<>();
    }
}
