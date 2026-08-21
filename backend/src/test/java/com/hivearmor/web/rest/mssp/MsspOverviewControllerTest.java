package com.hivearmor.web.rest.mssp;

import com.hivearmor.service.mssp.MsspOverviewService;
import com.hivearmor.service.mssp.dto.MsspOverviewDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unit tests for {@link MsspOverviewController} — {@code GET /api/ha-mssp/overview}.
 *
 * <p>Tests three authorization scenarios:
 * <ol>
 *   <li>Authenticated user with {@code MSSP_ADMIN} authority → HTTP 200</li>
 *   <li>Authenticated user without {@code MSSP_ADMIN} authority → HTTP 403</li>
 *   <li>Unauthenticated request → HTTP 401</li>
 * </ol>
 *
 * <p>Uses the <em>standalone</em> MockMvc pattern (same as {@code ResponseActionResourceTest})
 * to avoid loading the full Spring Boot application context (which requires live database
 * and OpenSearch connections). The nested class
 * {@link MsspAdminContextTest} loads a minimal Spring AOP context with
 * {@link EnableMethodSecurity} to fully evaluate
 * {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")} on the controller class.
 *
 * <p>Validates: Requirements 5.2, 5.3, 6.1
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
@ExtendWith(MockitoExtension.class)
class MsspOverviewControllerTest {

    @Mock
    private MsspOverviewService overviewService;

    private MsspOverviewController controller;

    /** MockMvc wired with a MSSP_ADMIN stub filter (tests 1). */
    private MockMvc mockMvcMsspAdmin;
    /** MockMvc wired with a ROLE_USER stub filter (test 2). */
    private MockMvc mockMvcRoleUser;

    // -------------------------------------------------------------------------
    // Stub filter — installs MSSP_ADMIN in the SecurityContext
    // -------------------------------------------------------------------------

    private static final OncePerRequestFilter MSSP_ADMIN_AUTH_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest request,
                                        HttpServletResponse response,
                                        FilterChain filterChain)
                throws ServletException, IOException {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "mssp-admin-stub", null,
                    Collections.singletonList(new SimpleGrantedAuthority("MSSP_ADMIN"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
            filterChain.doFilter(request, response);
        }
    };

    /** Stub filter — installs ROLE_USER (no MSSP_ADMIN) in the SecurityContext. */
    private static final OncePerRequestFilter ROLE_USER_AUTH_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest request,
                                        HttpServletResponse response,
                                        FilterChain filterChain)
                throws ServletException, IOException {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "regular-user-stub", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
            filterChain.doFilter(request, response);
        }
    };

    @BeforeEach
    void setUp() {
        controller = new MsspOverviewController(overviewService);
        when(overviewService.compute())
            .thenReturn(new MsspOverviewDTO(0, 0L, 0L, 0, List.of()));

        // MockMvc for MSSP_ADMIN requests (happy path)
        mockMvcMsspAdmin = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(MSSP_ADMIN_AUTH_FILTER)
                .build();

        // MockMvc for ROLE_USER requests (forbidden path)
        mockMvcRoleUser = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(ROLE_USER_AUTH_FILTER)
                .build();

        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Test 1 — MSSP_ADMIN → 200 OK
    // =========================================================================

    /**
     * An authenticated user holding the {@code MSSP_ADMIN} authority must receive
     * HTTP 200 and the response is populated by {@link MsspOverviewService#compute()}.
     *
     * <p>Validates: Requirements 5.2, 6.1
     */
    @Test
    @DisplayName("GET /api/ha-mssp/overview with MSSP_ADMIN → 200 OK")
    void getOverview_withMsspAdmin_returns200() throws Exception {
        mockMvcMsspAdmin.perform(get("/api/ha-mssp/overview"))
                .andExpect(status().isOk());
    }

    // =========================================================================
    // Test 2 — non-MSSP_ADMIN authenticated user → 403 Forbidden
    // =========================================================================

    // Implemented in the nested class below that activates @EnableMethodSecurity.

    // =========================================================================
    // Test 3 — unauthenticated → 401 Unauthorized
    // =========================================================================

    // Implemented in the nested class below that activates @EnableMethodSecurity.

    // =========================================================================
    // Nested class — activates method security for @PreAuthorize evaluation
    // =========================================================================

    /**
     * Nested test class that uses {@link SpringExtension} and {@link ContextConfiguration}
     * to load a minimal Spring AOP context with {@link EnableMethodSecurity}, ensuring
     * that {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")} on the controller class
     * is fully evaluated by the AOP proxy.
     *
     * <p>Test 2: authenticated {@code ROLE_USER} → {@code 403 Forbidden}.<br>
     * Test 3: no authentication in context → {@code 401 Unauthorized}.
     */
    @Nested
    @ExtendWith(SpringExtension.class)
    @ContextConfiguration(classes = MsspAdminContextTest.MsspSecurityConfig.class)
    static class MsspAdminContextTest {

        @Autowired
        private MsspOverviewController securedController;

        private MockMvc mockMvc;

        @BeforeEach
        void setUp() {
            SecurityContextHolder.clearContext();
            mockMvc = MockMvcBuilders
                    .standaloneSetup(securedController)
                    .setControllerAdvice(new SecurityAdvice())
                    .build();
        }

        /**
         * Test 2 — authenticated user with {@code ROLE_USER} (no {@code MSSP_ADMIN})
         * must be rejected with HTTP 403 Forbidden.
         *
         * <p>Validates: Requirement 5.2
         */
        @Test
        @DisplayName("GET /api/ha-mssp/overview with ROLE_USER (no MSSP_ADMIN) → 403 Forbidden")
        void getOverview_withoutMsspAdmin_returns403() throws Exception {
            // Install ROLE_USER in the security context — no MSSP_ADMIN
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "regular-user", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

            mockMvc.perform(get("/api/ha-mssp/overview"))
                    .andExpect(status().isForbidden());
        }

        /**
         * Test 3 — unauthenticated request (empty security context) must be rejected
         * with HTTP 401 Unauthorized.
         *
         * <p>Validates: Requirement 5.3
         */
        @Test
        @DisplayName("GET /api/ha-mssp/overview with no authentication → 401 Unauthorized")
        void getOverview_unauthenticated_returns401() throws Exception {
            // Security context is empty — no authentication
            SecurityContextHolder.clearContext();

            mockMvc.perform(get("/api/ha-mssp/overview"))
                    .andExpect(status().isUnauthorized());
        }

        // -------------------------------------------------------------------------
        // Minimal Spring configuration — method security only
        // -------------------------------------------------------------------------

        /**
         * Minimal Spring configuration that activates method-level security and
         * registers {@link MsspOverviewController} with a mocked collaborator, enabling
         * full evaluation of {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")}.
         */
        @Configuration
        @EnableMethodSecurity(prePostEnabled = true)
        static class MsspSecurityConfig {

            @Bean
            MsspOverviewService msspOverviewService() {
                MsspOverviewService svc = mock(MsspOverviewService.class);
                when(svc.compute()).thenReturn(new MsspOverviewDTO(0, 0L, 0L, 0, List.of()));
                return svc;
            }

            @Bean
            MsspOverviewController msspOverviewController(MsspOverviewService svc) {
                return new MsspOverviewController(svc);
            }
        }
    }

    // =========================================================================
    // Controller advice — maps Spring Security exceptions to HTTP 401 / 403
    // =========================================================================

    /**
     * Maps {@code AccessDeniedException} and {@code AuthorizationDeniedException}
     * to HTTP 403, and {@code AuthenticationCredentialsNotFoundException} to HTTP 401.
     *
     * <p>Required for standalone MockMvc (which has no {@code DispatcherServlet}-level
     * security filter) to translate the Spring Security AOP exceptions to correct
     * HTTP status codes.
     */
    @RestControllerAdvice
    static class SecurityAdvice {

        @ExceptionHandler({
            org.springframework.security.access.AccessDeniedException.class,
            org.springframework.security.authorization.AuthorizationDeniedException.class
        })
        public void handleForbidden(HttpServletResponse response) throws IOException {
            response.sendError(HttpServletResponse.SC_FORBIDDEN);
        }

        @ExceptionHandler(
            org.springframework.security.authentication.AuthenticationCredentialsNotFoundException.class
        )
        public void handleUnauthorized(HttpServletResponse response) throws IOException {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
        }
    }
}
