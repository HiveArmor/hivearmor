package com.hivearmor.service;

import com.hivearmor.service.dto.AgentPolicyEnforcementEvidenceDTO;
import com.hivearmor.service.dto.agent_manager.AgentPolicyStateDTO;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Honesty derivation for POL-001 / POL-003 — never invents complete host enforcement
 * or green “enforced on host” when apply/ack fields are missing.
 */
class HaAgentPolicyServiceHonestyTest {

    @Test
    void noStatesYieldsUnavailableAndApplyAckPathFalse() {
        AgentPolicyEnforcementEvidenceDTO evidence = new AgentPolicyEnforcementEvidenceDTO();
        HaAgentPolicyService.applyHonesty(evidence, List.of("agent-a"), List.of());
        assertThat(evidence.getEvidenceAvailability()).isEqualTo("unavailable");
        assertThat(evidence.isApplyAckPathAvailable()).isFalse();
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("apply/ack path unavailable");
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("never treat as enforced on host");
    }

    @Test
    void stateWithoutAppliedVersionOrLastAppliedAtYieldsUnavailable() {
        AgentPolicyStateDTO state = new AgentPolicyStateDTO();
        state.setAgentId("agent-a");
        state.setDesiredVersion(2);
        state.setState("PENDING");
        // deliberately no appliedVersion / lastAppliedAt

        AgentPolicyEnforcementEvidenceDTO evidence = new AgentPolicyEnforcementEvidenceDTO();
        HaAgentPolicyService.applyHonesty(evidence, List.of("agent-a"), List.of(state));
        assertThat(evidence.getEvidenceAvailability()).isEqualTo("unavailable");
        assertThat(evidence.isApplyAckPathAvailable()).isFalse();
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("apply/ack path unavailable");
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("never treat as enforced");
    }

    @Test
    void statesWithoutFullApplyAckCoverageYieldPartial() {
        AgentPolicyStateDTO state = new AgentPolicyStateDTO();
        state.setAgentId("agent-a");
        state.setAppliedVersion(1);
        state.setDesiredVersion(2);
        state.setState("DRIFT");

        AgentPolicyEnforcementEvidenceDTO evidence = new AgentPolicyEnforcementEvidenceDTO();
        HaAgentPolicyService.applyHonesty(evidence, List.of("agent-a", "agent-b"), List.of(state));
        assertThat(evidence.getEvidenceAvailability()).isEqualTo("partial");
        assertThat(evidence.isApplyAckPathAvailable()).isTrue();
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("partial");
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("apply/ack path unavailable");
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("never treat as enforced");
    }

    @Test
    void lastAppliedAtAloneCountsAsApplyAckEvidence() {
        AgentPolicyStateDTO state = new AgentPolicyStateDTO();
        state.setAgentId("agent-a");
        state.setLastAppliedAt(Instant.parse("2026-08-25T05:00:00Z"));
        state.setState("APPLIED");

        assertThat(HaAgentPolicyService.hasApplyAckEvidence(state)).isTrue();

        AgentPolicyEnforcementEvidenceDTO evidence = new AgentPolicyEnforcementEvidenceDTO();
        HaAgentPolicyService.applyHonesty(evidence, List.of("agent-a"), List.of(state));
        assertThat(evidence.getEvidenceAvailability()).isEqualTo("partial");
        assertThat(evidence.isApplyAckPathAvailable()).isTrue();
        assertThat(evidence.getHonestyNote()).contains("STAGING CANDIDATE");
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("never treat as enforced");
        assertThat(evidence.getEvidenceAvailability()).isNotEqualTo("complete");
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
        assertThat(evidence.isApplyAckPathAvailable()).isTrue();
        assertThat(evidence.getHonestyNote()).contains("STAGING CANDIDATE");
        assertThat(evidence.getHonestyNote()).containsIgnoringCase("never treat as enforced");
        assertThat(evidence.getEvidenceAvailability()).isNotEqualTo("complete");
    }
}
