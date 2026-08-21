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
}
