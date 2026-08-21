package com.hivearmor.web.filter;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class LegacySoarApiDeprecationFilterTest {

    private final LegacySoarApiDeprecationFilter filter = new LegacySoarApiDeprecationFilter();

    @Test
    void marksLegacySoarRoutesWithLifecycleHeaders() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/soar/playbooks");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> { });

        assertThat(response.getHeader("Deprecation")).isEqualTo("version=\"2026-08-11\"");
        assertThat(response.getHeader("Sunset")).isEqualTo("Fri, 31 Dec 2027 23:59:59 GMT");
        assertThat(response.getHeader("Link"))
                .isEqualTo("</api/ha-playbooks>; rel=\"successor-version\"");
        assertThat(response.getHeader("Warning")).contains("/api/ha-playbooks");
    }

    @Test
    void leavesCanonicalPlaybookRoutesUnmarked() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/ha-playbooks");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> { });

        assertThat(response.getHeader("Deprecation")).isNull();
        assertThat(response.getHeader("Sunset")).isNull();
        assertThat(response.getHeader("Link")).isNull();
    }
}
