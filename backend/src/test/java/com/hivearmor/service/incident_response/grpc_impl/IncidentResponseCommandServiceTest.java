package com.hivearmor.service.incident_response.grpc_impl;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * BE-SEC-01 unstructured shell classification (STAGING CANDIDATE).
 */
class IncidentResponseCommandServiceTest {

    @Test
    void structuredEdrIsNotUnstructured() {
        assertThat(IncidentResponseCommandService.isUnstructuredShell("EDR_KILL:123", null)).isFalse();
        assertThat(IncidentResponseCommandService.isUnstructuredShell("APPLY_POLICY:1:2", "")).isFalse();
        assertThat(IncidentResponseCommandService.isUnstructuredShell("SYNC_RULES:9", null)).isFalse();
    }

    @Test
    void shellFieldMarksUnstructured() {
        assertThat(IncidentResponseCommandService.isUnstructuredShell("whoami", "bash")).isTrue();
        assertThat(IncidentResponseCommandService.isUnstructuredShell("EDR_KILL:1", "powershell")).isTrue();
    }

    @Test
    void rawCommandWithoutPrefixIsUnstructured() {
        assertThat(IncidentResponseCommandService.isUnstructuredShell("rm -rf /tmp/x", null)).isTrue();
    }
}
