package com.hivearmor.web.filter;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class LegacyDetectionApiDeprecationFilterTest {

    private final LegacyDetectionApiDeprecationFilter filter = new LegacyDetectionApiDeprecationFilter();

    @Test
    void addsLifecycleHeadersToLegacyDetectionContracts() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/correlation-rule/search-by-filters");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader("Deprecation")).isEqualTo("version=\"2026-08-11\"");
        assertThat(response.getHeader("Sunset")).isEqualTo(LegacyDetectionApiDeprecationFilter.SUNSET);
        assertThat(response.getHeader("Link")).isEqualTo(LegacyDetectionApiDeprecationFilter.SUCCESSOR);
        assertThat(response.getHeader("Warning")).contains("Deprecated API");
    }

    @Test
    void leavesCanonicalDetectionContractsUnmarked() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/ha-detection-rules");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader("Deprecation")).isNull();
        assertThat(response.getHeader("Sunset")).isNull();
    }
}
