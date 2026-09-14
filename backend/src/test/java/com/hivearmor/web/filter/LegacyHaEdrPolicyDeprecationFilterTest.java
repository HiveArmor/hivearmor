package com.hivearmor.web.filter;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.ServletException;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * SPEC-06 W5 — verifies the legacy EDR agent-policy plane (Plane B) is marked
 * deprecated (RFC 8594 lifecycle headers pointing at the canonical
 * {@code /api/agent-policies} plane) while remaining fully callable, and that
 * the canonical successor plane is left unmarked.
 */
class LegacyHaEdrPolicyDeprecationFilterTest {

    private final LegacyHaEdrPolicyDeprecationFilter filter = new LegacyHaEdrPolicyDeprecationFilter();

    @Test
    void marksLegacyPlaneBPolicyEndpoints() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/ha-edr/policies");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader("Deprecation")).isEqualTo(LegacyHaEdrPolicyDeprecationFilter.DEPRECATION);
        assertThat(response.getHeader("Sunset")).isEqualTo(LegacyHaEdrPolicyDeprecationFilter.SUNSET);
        assertThat(response.getHeader("Link")).isEqualTo(LegacyHaEdrPolicyDeprecationFilter.SUCCESSOR);
        assertThat(response.getHeader("Warning")).contains("/api/agent-policies");
    }

    @Test
    void marksLegacyPlaneBSubResources() throws ServletException, IOException {
        // /{id}, /assign, /enforcement all live under the /policies prefix.
        MockHttpServletRequest request =
            new MockHttpServletRequest("POST", "/api/ha-edr/policies/42/assign");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader("Deprecation")).isEqualTo(LegacyHaEdrPolicyDeprecationFilter.DEPRECATION);
        assertThat(response.getHeader("Link")).isEqualTo(LegacyHaEdrPolicyDeprecationFilter.SUCCESSOR);
    }

    @Test
    void leavesCanonicalAgentPoliciesPlaneUnmarked() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/agent-policies");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader("Deprecation")).isNull();
        assertThat(response.getHeader("Sunset")).isNull();
        assertThat(response.getHeader("Link")).isNull();
        assertThat(response.getHeader("Warning")).isNull();
    }

    @Test
    void leavesOtherHaEdrEndpointsUnmarked() throws ServletException, IOException {
        // Only the policies plane is deprecated — other ha-edr endpoints stay clean.
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/ha-edr/quarantine");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader("Deprecation")).isNull();
        assertThat(response.getHeader("Link")).isNull();
    }
}
