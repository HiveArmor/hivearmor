package com.hivearmor.web.rest;

import com.hivearmor.service.ResponseActionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unit tests for {@link ResponseActionResource} — SOAR response action library endpoint.
 *
 * <p>Tests 1 and 2 use a standalone MockMvc instance with a stub filter that installs
 * {@code ROLE_ADMIN} in the {@link SecurityContextHolder} — the same pattern used by
 * {@link PlaybookResourceTest}.
 *
 * <p>Test 3 ({@code testGetLibrary_requiresAuth}) uses a nested class annotated with
 * {@link SpringExtension} and {@link ContextConfiguration} that activates method-level
 * security via {@link EnableMethodSecurity} so that
 * {@code @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_USER')")} is fully evaluated.
 * An unauthenticated request (no filter populating the security context) triggers an
 * {@link org.springframework.security.access.AccessDeniedException}, which is mapped to
 * HTTP 403 by the {@link PlaybookResourceTest.AccessDenied403Advice} controller advice.
 */
@ExtendWith(MockitoExtension.class)
class ResponseActionResourceTest {

    @Mock
    private ResponseActionService responseActionService;

    private ResponseActionResource controller;

    /** MockMvc wired with ROLE_ADMIN stub filter (tests 1 and 2). */
    private MockMvc mockMvcAdmin;

    // -------------------------------------------------------------------------
    // Stub filter — installs ROLE_ADMIN in the SecurityContext
    // -------------------------------------------------------------------------

    private static final OncePerRequestFilter ADMIN_AUTH_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest request,
                                        HttpServletResponse response,
                                        FilterChain filterChain)
                throws ServletException, IOException {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "admin-stub",
                    null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_ADMIN"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
            filterChain.doFilter(request, response);
        }
    };

    @BeforeEach
    void setUp() {
        controller = new ResponseActionResource(responseActionService);

        when(responseActionService.getLibrary()).thenReturn(buildLibrary());

        mockMvcAdmin = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(ADMIN_AUTH_FILTER)
                .build();

        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Test 1 — GET /api/ha-response-actions/library returns exactly 8 actions
    // =========================================================================

    /**
     * {@code GET /api/ha-response-actions/library} with {@code ROLE_ADMIN} must return
     * HTTP 200 and a JSON array containing exactly 8 elements — one per built-in action.
     */
    @Test
    void testGetLibrary_returnsEightActions() throws Exception {
        mockMvcAdmin.perform(get("/api/ha-response-actions/library")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(8));
    }

    // =========================================================================
    // Test 2 — response contains all 8 expected action ids
    // =========================================================================

    /**
     * The library response must include an entry for every expected built-in action id:
     * {@code isolate-host}, {@code block-ip}, {@code disable-user},
     * {@code create-jira-ticket}, {@code send-webhook}, {@code send-email},
     * {@code quarantine-file}, and {@code run-script}.
     */
    @Test
    void testGetLibrary_containsAllExpectedIds() throws Exception {
        mockMvcAdmin.perform(get("/api/ha-response-actions/library")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("isolate-host"))
                .andExpect(jsonPath("$[1].id").value("block-ip"))
                .andExpect(jsonPath("$[2].id").value("disable-user"))
                .andExpect(jsonPath("$[3].id").value("create-jira-ticket"))
                .andExpect(jsonPath("$[4].id").value("send-webhook"))
                .andExpect(jsonPath("$[5].id").value("send-email"))
                .andExpect(jsonPath("$[6].id").value("quarantine-file"))
                .andExpect(jsonPath("$[7].id").value("run-script"));
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Builds a stub library list with the 8 built-in action IDs in the required order.
     */
    private java.util.List<com.hivearmor.service.dto.ResponseActionDTO> buildLibrary() {
        String[] ids = {
            "isolate-host",
            "block-ip",
            "disable-user",
            "create-jira-ticket",
            "send-webhook",
            "send-email",
            "quarantine-file",
            "run-script"
        };
        java.util.List<com.hivearmor.service.dto.ResponseActionDTO> list = new java.util.ArrayList<>();
        for (String id : ids) {
            com.hivearmor.service.dto.ResponseActionDTO dto =
                    new com.hivearmor.service.dto.ResponseActionDTO();
            dto.setId(id);
            dto.setName(id);
            dto.setCategory("Test");
            dto.setDescription("Built-in action: " + id);
            dto.setUsageCount(0);
            list.add(dto);
        }
        return list;
    }

    // =========================================================================
    // Test 3 — unauthenticated request returns HTTP 401 or 403
    // =========================================================================

    /**
     * Verifies that an unauthenticated request (no security context populated) is
     * rejected with HTTP 401 or 403 when Spring method-level security is active.
     *
     * <p>This nested class uses {@link SpringExtension} + {@link ContextConfiguration}
     * to load a minimal Spring AOP context with {@link EnableMethodSecurity}, ensuring
     * that {@code @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_USER')")} is fully
     * evaluated. No auth filter is added to MockMvc, so the security context remains
     * empty and the {@code @PreAuthorize} check denies the request.
     */
    @ExtendWith(SpringExtension.class)
    @ContextConfiguration(classes = ResponseActionResourceTest.RequiresAuthConfig.class)
    static class GetLibraryRequiresAuthTest {

        @Autowired
        private ResponseActionResource securedController;

        private MockMvc mockMvc;

        @BeforeEach
        void setUp() {
            SecurityContextHolder.clearContext();

            // No auth filter — security context is empty for every request.
            mockMvc = MockMvcBuilders
                    .standaloneSetup(securedController)
                    .setControllerAdvice(new AccessDenied403Advice())
                    .build();
        }

        /**
         * An unauthenticated request to {@code GET /api/ha-response-actions/library}
         * must return HTTP 401 or 403.
         */
        @Test
        void testGetLibrary_requiresAuth() throws Exception {
            mockMvc.perform(get("/api/ha-response-actions/library")
                            .accept(MediaType.APPLICATION_JSON))
                    .andExpect(result -> {
                        int status = result.getResponse().getStatus();
                        if (status != 401 && status != 403) {
                            throw new AssertionError(
                                    "Expected HTTP 401 or 403 for unauthenticated request, but got: " + status);
                        }
                    });
        }
    }

    // =========================================================================
    // Controller advice — maps AccessDeniedException to HTTP 403
    // =========================================================================

    /**
     * Maps access-denied and unauthenticated exceptions to HTTP 403 / 401, enabling
     * standalone MockMvc to assert the correct status when Spring method-security AOP
     * denies access or finds no authentication in the security context.
     */
    @org.springframework.web.bind.annotation.RestControllerAdvice
    static class AccessDenied403Advice {

        @org.springframework.web.bind.annotation.ExceptionHandler({
            org.springframework.security.access.AccessDeniedException.class,
            org.springframework.security.authorization.AuthorizationDeniedException.class
        })
        public void handleAccessDenied(HttpServletResponse response) throws IOException {
            response.sendError(HttpServletResponse.SC_FORBIDDEN);
        }

        @org.springframework.web.bind.annotation.ExceptionHandler(
            org.springframework.security.authentication.AuthenticationCredentialsNotFoundException.class
        )
        public void handleNotAuthenticated(HttpServletResponse response) throws IOException {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
        }
    }

    // =========================================================================
    // Spring configuration for nested auth test
    // =========================================================================

    /**
     * Minimal Spring configuration that activates method security and registers
     * {@link ResponseActionResource} with a Mockito-created mock collaborator.
     *
     * <p>Used exclusively by {@link GetLibraryRequiresAuthTest} to verify
     * {@code @PreAuthorize} enforcement in a lightweight Spring AOP context.
     */
    @Configuration
    @EnableMethodSecurity
    static class RequiresAuthConfig {

        @Bean
        ResponseActionService responseActionService() {
            return mock(ResponseActionService.class);
        }

        @Bean
        ResponseActionResource responseActionResource(ResponseActionService responseActionService) {
            return new ResponseActionResource(responseActionService);
        }
    }
}
