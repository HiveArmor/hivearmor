package com.hivearmor.web.rest.mssp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspTenantResolver;
import com.hivearmor.service.mssp.DuplicatePrefixException;
import com.hivearmor.service.mssp.MsspProvisioningService;
import com.hivearmor.service.mssp.MsspTenantService;
import com.hivearmor.service.mssp.dto.NewTenantRequest;
import com.hivearmor.service.mssp.dto.NewTenantResponse;
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
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
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
import java.time.Instant;
import java.util.Collections;

import static org.hamcrest.Matchers.endsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for {@link MsspTenantController#createTenant} — standalone MockMvc.
 *
 * <p>Follows the same pattern as {@link MsspOverviewControllerTest}:
 * <ul>
 *   <li>Outer class uses {@code MockitoExtension} and {@code standaloneSetup} with
 *       an auth-filter stub for happy-path and input-validation tests.</li>
 *   <li>Nested {@link MsspAdminContextTest} uses {@code SpringExtension} +
 *       {@code @ContextConfiguration} + {@code @EnableMethodSecurity} to properly
 *       evaluate the class-level {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")}
 *       annotation for the 403 and 401 cases.</li>
 * </ul>
 *
 * <p>Covered scenarios:
 * <ol>
 *   <li>MSSP_ADMIN + valid body → 201 + Location header</li>
 *   <li>MSSP_ADMIN + invalid prefix ({@code "INVALID PREFIX"}) → 400</li>
 *   <li>Non-admin authenticated user → 403</li>
 *   <li>Unauthenticated → 401</li>
 *   <li>MSSP_ADMIN + service throws {@link DuplicatePrefixException} → 409</li>
 * </ol>
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
@ExtendWith(MockitoExtension.class)
class MsspTenantControllerCreateTest {

    @Mock
    private MsspProvisioningService provisioningService;

    @Mock
    private MsspTenantService tenantService;

    @Mock
    private MsspTenantResolver tenantResolver;

    private MsspTenantController controller;

    private MockMvc mockMvcAdmin;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    // -------------------------------------------------------------------------
    // Stub filter — installs MSSP_ADMIN authority
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

    @BeforeEach
    void setUp() {
        controller = new MsspTenantController(provisioningService, tenantService, tenantResolver);

        mockMvcAdmin = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(MSSP_ADMIN_AUTH_FILTER)
                .setControllerAdvice(new MsspProblemHandler())
                .build();

        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Test 1 — MSSP_ADMIN + valid body → 201 + Location header
    // =========================================================================

    /**
     * A valid request from an MSSP_ADMIN must result in HTTP 201 with a
     * {@code Location} header pointing to the new tenant resource.
     *
     * <p>Validates: Requirements 8.1, 8.2
     */
    @Test
    @DisplayName("POST /api/ha-mssp/tenants with valid body as MSSP_ADMIN → 201 + Location")
    void createTenant_validRequest_returns201WithLocation() throws Exception {
        NewTenantResponse response = new NewTenantResponse(
                42L, "Acme Corp", "acme", "acme-admin", Instant.now());
        when(provisioningService.provisionTenant(any())).thenReturn(response);

        String body = objectMapper.writeValueAsString(new NewTenantRequest(
                "Acme Corp", "acme", "admin@acme.example.com", "acme-admin", 25, "standard"));

        mockMvcAdmin.perform(post("/api/ha-mssp/tenants")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", endsWith("/api/ha-mssp/tenants/42")));
    }

    // =========================================================================
    // Test 2 — invalid prefix → 400 Bad Request
    // =========================================================================

    /**
     * A {@code clientPrefix} of {@code "INVALID PREFIX"} (uppercase letters and
     * a space) must fail bean validation and return HTTP 400 before the service
     * is ever invoked.
     *
     * <p>Validates: Requirements 8.5, 10.4
     */
    @Test
    @DisplayName("POST /api/ha-mssp/tenants with clientPrefix='INVALID PREFIX' → 400")
    void createTenant_invalidPrefix_returns400() throws Exception {
        String body = objectMapper.writeValueAsString(new NewTenantRequest(
                "Acme Corp",
                "INVALID PREFIX",       // fails ^[a-z0-9-]{2,20}$
                "admin@acme.example.com",
                "acme-admin",
                25,
                "standard"));

        mockMvcAdmin.perform(post("/api/ha-mssp/tenants")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());

        // Service must not be called when input is invalid
        verify(provisioningService, never()).provisionTenant(any());
    }

    // =========================================================================
    // Test 5 — service throws DuplicatePrefixException → 409 Conflict
    // =========================================================================

    /**
     * When the service throws {@link DuplicatePrefixException}, the
     * {@link MsspProblemHandler} must map it to HTTP 409 with
     * {@code field = "clientPrefix"} in the RFC-7807 problem-detail body.
     *
     * <p>Validates: Requirements 8.7, 10.11
     */
    @Test
    @DisplayName("POST /api/ha-mssp/tenants — service throws DuplicatePrefixException → 409")
    void createTenant_duplicatePrefix_returns409() throws Exception {
        when(provisioningService.provisionTenant(any()))
                .thenThrow(new DuplicatePrefixException("acme"));

        String body = objectMapper.writeValueAsString(new NewTenantRequest(
                "Acme Corp", "acme", "admin@acme.example.com", "acme-admin", 25, "standard"));

        mockMvcAdmin.perform(post("/api/ha-mssp/tenants")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.field").value("clientPrefix"));
    }

    // =========================================================================
    // Nested class — @EnableMethodSecurity for 403 and 401 tests
    // =========================================================================

    /**
     * Nested class that uses a real Spring AOP context with
     * {@link EnableMethodSecurity} so that the class-level
     * {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")} is actually evaluated.
     */
    @Nested
    @ExtendWith(SpringExtension.class)
    @ContextConfiguration(classes = MsspAdminContextTest.SecurityConfig.class)
    static class MsspAdminContextTest {

        @Autowired
        private MsspTenantController securedController;

        private MockMvc mockMvc;

        private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

        @BeforeEach
        void setUp() {
            SecurityContextHolder.clearContext();
            mockMvc = MockMvcBuilders
                    .standaloneSetup(securedController)
                    .setControllerAdvice(new SecurityAdvice())
                    .build();
        }

        /**
         * Test 3 — authenticated user with {@code ROLE_USER} (no {@code MSSP_ADMIN})
         * must receive HTTP 403 Forbidden.
         *
         * <p>Validates: Requirement 5.2
         */
        @Test
        @DisplayName("POST /api/ha-mssp/tenants with ROLE_USER → 403 Forbidden")
        void createTenant_withRoleUser_returns403() throws Exception {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "regular-user", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

            String body = objectMapper.writeValueAsString(new NewTenantRequest(
                    "Acme Corp", "acme", "admin@acme.example.com", "acme-admin", 25, "standard"));

            mockMvc.perform(post("/api/ha-mssp/tenants")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isForbidden());
        }

        /**
         * Test 4 — unauthenticated request (empty security context) must receive
         * HTTP 401 Unauthorized.
         *
         * <p>Validates: Requirement 5.3
         */
        @Test
        @DisplayName("POST /api/ha-mssp/tenants unauthenticated → 401 Unauthorized")
        void createTenant_unauthenticated_returns401() throws Exception {
            SecurityContextHolder.clearContext();

            String body = objectMapper.writeValueAsString(new NewTenantRequest(
                    "Acme Corp", "acme", "admin@acme.example.com", "acme-admin", 25, "standard"));

            mockMvc.perform(post("/api/ha-mssp/tenants")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isUnauthorized());
        }

        // -------------------------------------------------------------------------
        // Minimal Spring configuration
        // -------------------------------------------------------------------------

        @Configuration
        @EnableMethodSecurity(prePostEnabled = true)
        static class SecurityConfig {

            @Bean
            MsspProvisioningService msspProvisioningService() {
                return mock(MsspProvisioningService.class);
            }

            @Bean
            MsspTenantService msspTenantService() {
                return mock(MsspTenantService.class);
            }

            @Bean
            MsspTenantController msspTenantController(MsspProvisioningService ps,
                                                       MsspTenantService ts) {
                return new MsspTenantController(ps, ts, mock(com.hivearmor.multitenancy.MsspTenantResolver.class));
            }
        }
    }

    // =========================================================================
    // Controller advice — maps Spring Security AOP exceptions to HTTP codes
    // =========================================================================

    @RestControllerAdvice
    static class SecurityAdvice {

        @ExceptionHandler({
            AccessDeniedException.class,
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
