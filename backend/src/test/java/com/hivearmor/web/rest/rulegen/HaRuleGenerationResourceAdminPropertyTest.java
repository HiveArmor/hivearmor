package com.hivearmor.web.rest.rulegen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.rulegen.HaRuleGenerationService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Property-based test verifying the ADMIN authority guard on HaRuleGenerationResource.
 *
 * <p><strong>Property 7: Every /api/ha-rules endpoint requires ADMIN</strong><br>
 * For every endpoint on {@code HaRuleGenerationResource}, a caller without the
 * {@code ADMIN} authority receives 403 and no service method is invoked.
 *
 * <p>Uses a minimal Spring AOP context with {@link EnableMethodSecurity} to properly
 * evaluate {@code @PreAuthorize("hasAuthority('ROLE_ADMIN')")} on the controller.
 * The service mock verifies zero interactions when authorization is denied.
 * jqwik generates random non-ADMIN authority strings across all five endpoints.
 *
 * <p><strong>Validates: Requirements 4.3, 6.2</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 7: Every /api/ha-rules endpoint requires ADMIN")
class HaRuleGenerationResourceAdminPropertyTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * The five endpoint descriptors: method + path + optional JSON body.
     */
    private static final List<EndpointDescriptor> ENDPOINTS = List.of(
        new EndpointDescriptor("GET", "/api/ha-rules/signals?minCount=3", null),
        new EndpointDescriptor("POST", "/api/ha-rules/sessions",
            Map.of("signalKey", "test", "minCount", 3)),
        new EndpointDescriptor("POST", "/api/ha-rules/sessions/1/approve", null),
        new EndpointDescriptor("POST", "/api/ha-rules/sessions/1/reject", null),
        new EndpointDescriptor("POST", "/api/ha-rules/sessions/1/regenerate",
            Map.of("signalKey", "test", "minCount", 3))
    );

    /** Shared mock service — reset before each trial. */
    private static final HaRuleGenerationService MOCK_SERVICE = mock(HaRuleGenerationService.class);

    private AnnotationConfigApplicationContext ctx;
    private MockMvc mockMvc;

    @BeforeTry
    void setUp() {
        reset(MOCK_SERVICE);
        SecurityContextHolder.clearContext();

        // Bootstrap a minimal Spring AOP context with method security enabled.
        ctx = new AnnotationConfigApplicationContext(AdminGuardConfig.class);
        HaRuleGenerationResource proxiedController = ctx.getBean(HaRuleGenerationResource.class);

        // Build standalone MockMvc with the AOP-proxied controller and a
        // ControllerAdvice that maps AccessDeniedException → 403.
        mockMvc = MockMvcBuilders
            .standaloneSetup(proxiedController)
            .setControllerAdvice(new AccessDenied403Advice())
            .build();
    }

    @AfterTry
    void tearDown() {
        if (ctx != null) {
            ctx.close();
        }
        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Property 7: Non-ADMIN callers get 403 and service is never invoked
    // =========================================================================

    /**
     * For any endpoint index (0-4) and any non-ADMIN authority string, a caller
     * without the {@code ROLE_ADMIN} authority receives HTTP 403 and no service
     * method is invoked.
     *
     * <p><strong>Validates: Requirements 4.3, 6.2</strong>
     */
    @Property(tries = 50)
    @Label("Property 7: Non-ADMIN caller gets 403 on all /api/ha-rules endpoints")
    void nonAdminCallerGets403AndServiceNotInvoked(
            @ForAll("endpointIndices") int endpointIndex,
            @ForAll("nonAdminAuthorities") String authority) throws Exception {

        EndpointDescriptor endpoint = ENDPOINTS.get(endpointIndex);

        // Build a filter that injects the non-ADMIN authority into SecurityContext.
        OncePerRequestFilter authFilter = buildAuthFilter(authority);

        // Rebuild MockMvc with this specific filter for the trial.
        HaRuleGenerationResource proxiedController = ctx.getBean(HaRuleGenerationResource.class);
        MockMvc trialMvc = MockMvcBuilders
            .standaloneSetup(proxiedController)
            .setControllerAdvice(new AccessDenied403Advice())
            .addFilter(authFilter)
            .build();

        MvcResult result = performRequest(trialMvc, endpoint);

        assertThat(result.getResponse().getStatus())
            .as("Endpoint %s %s must return 403 for authority '%s'",
                endpoint.method(), endpoint.path(), authority)
            .isEqualTo(403);

        verifyNoInteractions(MOCK_SERVICE);
    }

    // =========================================================================
    // Providers
    // =========================================================================

    /**
     * Generates endpoint indices 0-4 corresponding to the five endpoints.
     */
    @Provide
    Arbitrary<Integer> endpointIndices() {
        return Arbitraries.integers().between(0, ENDPOINTS.size() - 1);
    }

    /**
     * Generates non-ADMIN authority strings. These are authority values that are
     * NOT "ROLE_ADMIN" — covering known non-admin roles, near-miss strings, and
     * arbitrary random authority values.
     */
    @Provide
    Arbitrary<String> nonAdminAuthorities() {
        return Arbitraries.oneOf(
            // Known non-admin authorities from AuthoritiesConstants
            Arbitraries.of(
                "ROLE_USER",
                "ROLE_ANALYST",
                "ROLE_SOC_MANAGER",
                "ROLE_READ_ONLY",
                "ROLE_ANONYMOUS",
                "ROLE_PRE_VERIFICATION_USER"
            ),
            // Near-miss strings that look like ADMIN but aren't
            Arbitraries.of(
                "ADMIN",             // without ROLE_ prefix
                "ROLE_ADMIN2",
                "ROLE_admin",        // wrong case
                "ROLE_SUPER_ADMIN",
                "role_admin",        // all wrong case
                "ROLE_ADMINS"
            ),
            // Random authority strings (non-empty, never ROLE_ADMIN)
            Arbitraries.strings()
                .withCharRange('A', 'z')
                .ofMinLength(1)
                .ofMaxLength(30)
                .filter(s -> !s.equals("ROLE_ADMIN"))
        );
    }

    // =========================================================================
    // Configuration
    // =========================================================================

    /**
     * Minimal Spring configuration that activates method security and registers
     * the controller with its mock service dependency.
     */
    @Configuration
    @EnableMethodSecurity
    static class AdminGuardConfig {

        @Bean
        HaRuleGenerationService haRuleGenerationService() {
            return MOCK_SERVICE;
        }

        @Bean
        HaRuleGenerationResource haRuleGenerationResource(HaRuleGenerationService service) {
            return new HaRuleGenerationResource(service);
        }
    }

    /**
     * Controller advice that maps Spring Security access-denied exceptions to HTTP 403,
     * enabling standalone MockMvc assertions on forbidden status.
     */
    @RestControllerAdvice
    static class AccessDenied403Advice {

        @ExceptionHandler({
            org.springframework.security.access.AccessDeniedException.class,
            org.springframework.security.authorization.AuthorizationDeniedException.class
        })
        public void handleAccessDenied(HttpServletResponse response) throws IOException {
            response.sendError(HttpServletResponse.SC_FORBIDDEN);
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Builds a filter that sets the given authority in the SecurityContext.
     */
    private static OncePerRequestFilter buildAuthFilter(String authority) {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest req,
                                            HttpServletResponse resp,
                                            FilterChain chain)
                    throws ServletException, IOException {
                SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(
                        "non-admin-user", null,
                        Collections.singletonList(new SimpleGrantedAuthority(authority))));
                chain.doFilter(req, resp);
            }
        };
    }

    /**
     * Performs the appropriate HTTP request for the given endpoint descriptor.
     */
    private MvcResult performRequest(MockMvc mvc, EndpointDescriptor endpoint) throws Exception {
        if ("GET".equals(endpoint.method())) {
            return mvc.perform(get(endpoint.path())
                    .accept(MediaType.APPLICATION_JSON))
                .andReturn();
        } else {
            var request = post(endpoint.path())
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON);
            if (endpoint.body() != null) {
                request.content(MAPPER.writeValueAsString(endpoint.body()));
            }
            return mvc.perform(request).andReturn();
        }
    }

    /**
     * Describes a single endpoint: HTTP method, path, and optional JSON body.
     */
    private record EndpointDescriptor(String method, String path, Object body) {}
}
