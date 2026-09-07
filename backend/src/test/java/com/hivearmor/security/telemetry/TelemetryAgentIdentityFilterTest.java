package com.hivearmor.security.telemetry;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class TelemetryAgentIdentityFilterTest {

    @Test
    void matchesScaAndSbomPostsAndVitalsPutsOnly() {
        MockHttpServletRequest sca = new MockHttpServletRequest("POST", "/api/ha-telemetry/sca");
        sca.setServletPath("/api/ha-telemetry/sca");
        assertThat(TelemetryAgentIdentityFilter.isTelemetryIngest(sca)).isTrue();

        MockHttpServletRequest getVitals = new MockHttpServletRequest("GET", "/api/ha-telemetry/vitals/1");
        getVitals.setServletPath("/api/ha-telemetry/vitals/1");
        assertThat(TelemetryAgentIdentityFilter.isTelemetryIngest(getVitals)).isFalse();

        MockHttpServletRequest putVitals = new MockHttpServletRequest("PUT", "/api/ha-telemetry/vitals/1");
        putVitals.setServletPath("/api/ha-telemetry/vitals/1");
        assertThat(TelemetryAgentIdentityFilter.isTelemetryIngest(putVitals)).isTrue();
    }

    @Test
    void matchesAgentPolicyFetchAndReportState() {
        MockHttpServletRequest getPolicy = new MockHttpServletRequest("GET", "/api/agent-policies/42");
        getPolicy.setServletPath("/api/agent-policies/42");
        assertThat(TelemetryAgentIdentityFilter.isAgentPolicyPath(getPolicy)).isTrue();
        assertThat(TelemetryAgentIdentityFilter.isAgentDeviceAuthPath(getPolicy)).isTrue();

        MockHttpServletRequest report = new MockHttpServletRequest("POST", "/api/agent-policies/report-state");
        report.setServletPath("/api/agent-policies/report-state");
        assertThat(TelemetryAgentIdentityFilter.isAgentPolicyPath(report)).isTrue();

        MockHttpServletRequest sync = new MockHttpServletRequest("POST", "/api/agent-policies/sync-on-connect");
        sync.setServletPath("/api/agent-policies/sync-on-connect");
        assertThat(TelemetryAgentIdentityFilter.isAgentPolicyPath(sync)).isTrue();
        assertThat(TelemetryAgentIdentityFilter.isAgentDeviceAuthPath(sync)).isTrue();

        MockHttpServletRequest list = new MockHttpServletRequest("GET", "/api/agent-policies");
        list.setServletPath("/api/agent-policies");
        assertThat(TelemetryAgentIdentityFilter.isAgentPolicyPath(list)).isFalse();

        MockHttpServletRequest states = new MockHttpServletRequest("GET", "/api/agent-policies/42/states");
        states.setServletPath("/api/agent-policies/42/states");
        assertThat(TelemetryAgentIdentityFilter.isAgentPolicyPath(states)).isFalse();
    }

    @Test
    void matchesRulePushAckPath() {
        MockHttpServletRequest ack = new MockHttpServletRequest(
            "POST", "/api/alert-response-rules/push-status/7/ack");
        ack.setServletPath("/api/alert-response-rules/push-status/7/ack");
        assertThat(TelemetryAgentIdentityFilter.isRulePushAckPath(ack)).isTrue();
        assertThat(TelemetryAgentIdentityFilter.isAgentDeviceAuthPath(ack)).isTrue();

        MockHttpServletRequest statusGet = new MockHttpServletRequest(
            "GET", "/api/alert-response-rules/push-status/7");
        statusGet.setServletPath("/api/alert-response-rules/push-status/7");
        assertThat(TelemetryAgentIdentityFilter.isRulePushAckPath(statusGet)).isFalse();

        MockHttpServletRequest push = new MockHttpServletRequest(
            "POST", "/api/alert-response-rules/push");
        push.setServletPath("/api/alert-response-rules/push");
        assertThat(TelemetryAgentIdentityFilter.isRulePushAckPath(push)).isFalse();
    }
}
