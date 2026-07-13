package com.hivearmor.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.filter.CorsFilter;
import tech.jhipster.config.JHipsterProperties;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class CorsConfigTest {

    private CorsFilter corsFilterFor(String... allowedOrigins) {
        JHipsterProperties props = new JHipsterProperties();
        props.getCors().setAllowedOrigins(Arrays.asList(allowedOrigins));
        props.getCors().setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        props.getCors().setAllowedHeaders(Arrays.asList(
            "Authorization", "Content-Type", "X-Requested-With", "Accept", "Origin", "Cache-Control"
        ));
        props.getCors().setMaxAge(1800L);
        return new WebConfigurer(null, props).corsFilter();
    }

    @Test
    void corsRequest_fromAllowedOrigin_hasCorrectHeaders() throws Exception {
        CorsFilter filter = corsFilterFor("https://allowed.example.com");

        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/authenticate");
        request.addHeader("Origin", "https://allowed.example.com");
        request.addHeader("Access-Control-Request-Method", "POST");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertThat(response.getHeader("Access-Control-Allow-Origin")).isEqualTo("https://allowed.example.com");
        assertThat(response.getHeader("Access-Control-Allow-Methods")).isNotNull();
    }

    @Test
    void corsRequest_fromUnknownOrigin_isRejected() throws Exception {
        CorsFilter filter = corsFilterFor("https://allowed.example.com");

        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/authenticate");
        request.addHeader("Origin", "https://evil.attacker.com");
        request.addHeader("Access-Control-Request-Method", "POST");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertThat(response.getHeader("Access-Control-Allow-Origin")).isNull();
    }

    @Test
    void corsRequest_wildcardBlocked_exactOriginRequired() throws Exception {
        CorsFilter filter = corsFilterFor("https://hivearmor.yourdomain.com");

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/users");
        request.addHeader("Origin", "https://other.example.com");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertThat(response.getHeader("Access-Control-Allow-Origin")).isNull();
    }
}
