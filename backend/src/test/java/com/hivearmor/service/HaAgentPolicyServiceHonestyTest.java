package com.hivearmor.service;

import com.hivearmor.service.dto.AgentPolicyEnforcementEvidenceDTO;
import com.hivearmor.service.dto.agent_manager.AgentPolicyStateDTO;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Honesty derivation for POL-001 — never invents complete host enforcement.
 */
class HaAgentPolicyServiceHonestyTest {

    @Test
    void noStatesYieldsUnavailable() {
        AgentPolicyEnforcementEvidenceDTO evidence = new AgentPolicyEnforcementEvidenceDTO();
        HaAgentPolicyService.applyHonesty(evidence, List.of("agent-a"), List.of());
        assertThat(evidence.getEvidenceAvailability()).isEqualTo("unavailable");
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("not verified");
    }

    @Test
    void statesWithoutFullAssignmentCoverageYieldPartial() {
        AgentPolicyStateDTO state = new AgentPolicyStateDTO();
        state.setAgentId("agent-a");
        state.setAppliedVersion(1);
        state.setDesiredVersion(2);
        state.setState("DRIFT");

        AgentPolicyEnforcementEvidenceDTO evidence = new AgentPolicyEnforcementEvidenceDTO();
        HaAgentPolicyService.applyHonesty(evidence, List.of("agent-a", "agent-b"), List.of(state));
        assertThat(evidence.getEvidenceAvailability()).isEqualTo("partial");
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("partial");
    }

    @Test
    void fullReportedCoverageStillPartialStagingCandidate() {
        AgentPolicyStateDTO a = new AgentPolicyStateDTO();
        a.setAgentId("agent-a");
        a.setAppliedVersion(3);
        a.setDesiredVersion(3);
        a.setState("APPLIED");

        AgentPolicyEnforcementEvidenceDTO evidence = new AgentPolicyEnforcementEvidenceDTO();
        HaAgentPolicyService.applyHonesty(evidence, List.of("agent-a"), List.of(a));
        assertThat(evidence.getEvidenceAvailability()).isEqualTo("partial");
        assertThat(evidence.getHonestyNote()).contains("STAGING CANDIDATE");
        assertThat(evidence.getEvidenceAvailability()).isNotEqualTo("complete");
    }
}
