package com.hivearmor.service.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;

/**
 * Request body for POST /api/ha-edr/policies/{id}/assign (T05).
 * Carries the list of agent IDs to assign to a monitoring policy.
 * No Lombok — every accessor is an explicit public method.
 */
public class AgentPolicyAssignRequest {

    @NotEmpty
    private List<String> agentIds;

    // ---- getters / setters ----

    public List<String> getAgentIds() { return agentIds; }
    public void setAgentIds(List<String> agentIds) { this.agentIds = agentIds; }
}
