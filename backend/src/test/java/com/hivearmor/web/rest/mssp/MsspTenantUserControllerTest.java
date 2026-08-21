package com.hivearmor.web.rest.mssp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.mssp.DuplicateMembershipException;
import com.hivearmor.service.mssp.MsspMembershipService;
import com.hivearmor.service.mssp.NotFoundException;
import com.hivearmor.service.mssp.dto.AddTenantMemberRequest;
import com.hivearmor.service.mssp.dto.PatchTenantMemberRequest;
import com.hivearmor.service.mssp.dto.TenantMemberDTO;
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
import java.util.Collections;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for {@link MsspTenantUserController} — standalone MockMvc.
 *
 * <p>Follows the exact pattern established by {@link MsspTenantControllerCreateTest}:
 * <ul>
 *   <li>Outer class uses {@code MockitoExtension} + {@code standaloneSetup} with an
 *       auth-filter stub for happy-path and input-validation tests.</li>
 *   <li>Nested {@link AuthorizationTest} uses {@code SpringExtension} +
 *       {@code @ContextConfiguration} + {@code @EnableMethodSecurity} to properly
 *       evaluate the class-level {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")}
 *       annotation for the 403 and 401 cases.</li>
 * </ul>
 *
 * <p>Covered scenarios:
 * <ol>
 *   <li>(a) DELETE happy path → 204 No Content</li>
 *   <li>(b) POST with duplicate membership → 409 Conflict, {@code field: "membership"}</li>
 *   <li>(c) POST with invalid {@code tenantRole} → 400 Bad Request (bean validation)</li>
 *   <li>(d) PATCH with invalid {@code tenantRole} → 400 Bad Request (bean validation)</li>
 *   <li>(e) DELETE unknown membership → 404 Not Found</li>
 *   <li>(f) Non-admin → 403, unauthenticated → 401</li>
 * </ol>
 *
 * <p>Sprint 23 — MSSP portal backend (S23-T05).
 *
 * <p><strong>Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.6, 14.8, 17.2, 17.3</strong>
 */
@ExtendWith(MockitoExtension.class)
class MsspTenantUserControllerTest {

    @Mock
    private MsspMembershipService membershipService;

    private MsspTenantUserController controller;

    private MockMvc mockMvcAdmin;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    // -------------------------------------------------------------------------
    // Stub filter — installs MSSP_ADMIN authority for happy-path tests
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
        controller = new MsspTenantUserController(membershipService);

        mockMvcAdmin = MockMvcBuilders
                .standaloneSetup(controller)
                .addFilter(MSSP_ADMIN_AUTH_FILTER)
                .setControllerAdvice(new MsspProblemHandler())
                .build();

        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // (a) DELETE happy path → 204 No Content
    // =========================================================================

    /**
     * A well-formed DELETE from an MSSP_ADMIN must return HTTP 204 with no body
     * when the membership service succeeds.
     *
     * <p>Validates: Requirements 14.4, 14.8
     */
    @Test
    @DisplayName("DELETE /api/ha-mssp/tenants/1/users/2 as MSSP_ADMIN → 204 No Content")
    void removeMember_happyPath_returns204NoContent() throws Exception {
        doNothing().when(membershipService).remove(1L, 2L);

        mockMvcAdmin.perform(delete("/api/ha-mssp/tenants/1/users/2"))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
    }

    // =========================================================================
    // (b) POST with duplicate → 409 Conflict, field: "membership"
    // =========================================================================

    /**
     * When the service throws {@link DuplicateMembershipException}, the
     * {@link MsspProblemHandler} must map it to HTTP 409 with
     * {@code field: "membership"} in the RFC-7807 problem-detail body.
     *
     * <p>Validates: Requirements 14.3, 14.9
     */
    @Test
    @DisplayName("POST /api/ha-mssp/tenants/1/users — duplicate membership → 409 with field:membership")
    void addMember_duplicateMembership_returns409WithFieldMembership() throws Exception {
        when(membershipService.add(eq(1L), any(AddTenantMemberRequest.class)))
                .thenThrow(new DuplicateMembershipException(1L, 2L));

        String body = objectMapper.writeValueAsString(
                Map.of("userId", 2, "tenantRole", "TENANT_VIEWER"));

        mockMvcAdmin.perform(post("/api/ha-mssp/tenants/1/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.field").value("membership"));
    }

    // =========================================================================
    // (c) POST with invalid tenantRole → 400 Bad Request (bean validation)
    // =========================================================================

    /**
     * A {@code tenantRole} of {@code "INVALID"} does not match the allowed regex
     * and must be rejected by bean validation before the service is invoked.
     *
     * <p>Validates: Requirement 14.1
     */
    @Test
    @DisplayName("POST /api/ha-mssp/tenants/1/users — invalid tenantRole='INVALID' → 400")
    void addMember_invalidTenantRole_returns400() throws Exception {
        String body = objectMapper.writeValueAsString(
                Map.of("userId", 1, "tenantRole", "INVALID"));

        mockMvcAdmin.perform(post("/api/ha-mssp/tenants/1/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());

        verify(membershipService, never()).add(any(), any());
    }

    // =========================================================================
    // (d) PATCH with invalid tenantRole → 400 Bad Request (bean validation)
    // =========================================================================

    /**
     * A {@code tenantRole} of {@code "BAD"} does not match the allowed regex and
     * must be rejected by bean validation before the service is invoked.
     *
     * <p>Validates: Requirement 14.2
     */
    @Test
    @DisplayName("PATCH /api/ha-mssp/tenants/1/users/2 — invalid tenantRole='BAD' → 400")
    void updateMemberRole_invalidTenantRole_returns400() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("tenantRole", "BAD"));

        mockMvcAdmin.perform(patch("/api/ha-mssp/tenants/1/users/2")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());

        verify(membershipService, never()).updateRole(any(), any(), any());
    }

    // =========================================================================
    // (e) DELETE unknown membership → 404 Not Found
    // =========================================================================

    /**
     * When the service throws {@link NotFoundException}, the handler must map it
     * to HTTP 404.
     *
     * <p>Validates: Requirement 14.6
     */
    @Test
    @DisplayName("DELETE /api/ha-mssp/tenants/1/users/2 — membership not found → 404")
    void removeMember_notFound_returns404() throws Exception {
        doThrow(new NotFoundException("membership", "1/2"))
                .when(membershipService).remove(1L, 2L);

        mockMvcAdmin.perform(delete("/api/ha-mssp/tenants/1/users/2"))
                .andExpect(status().isNotFound());
    }

    // =========================================================================
    // (f) Authorization — 403 for non-admin, 401 for unauthenticated
    // =========================================================================

    /**
     * Nested class that uses a real Spring AOP context with
     * {@link EnableMethodSecurity} so that the class-level
     * {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")} is actually evaluated.
     *
     * <p>Validates: Requirements 17.2, 17.3
     */
    @Nested
    @ExtendWith(SpringExtension.class)
    @ContextConfiguration(classes = AuthorizationTest.SecurityConfig.class)
    static class AuthorizationTest {

        @Autowired
        private MsspTenantUserController securedController;

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
         * An authenticated user with {@code ROLE_USER} (no {@code MSSP_ADMIN})
         * must receive HTTP 403 Forbidden.
         *
         * <p>Validates: Requirement 17.2
         */
        @Test
        @DisplayName("DELETE /api/ha-mssp/tenants/1/users/2 with ROLE_USER → 403 Forbidden")
        void removeMember_withRoleUser_returns403() throws Exception {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "regular-user", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

            mockMvc.perform(delete("/api/ha-mssp/tenants/1/users/2"))
                    .andExpect(status().isForbidden());
        }

        /**
         * An unauthenticated request (empty security context) must receive
         * HTTP 401 Unauthorized.
         *
         * <p>Validates: Requirement 17.3
         */
        @Test
        @DisplayName("DELETE /api/ha-mssp/tenants/1/users/2 unauthenticated → 401 Unauthorized")
        void removeMember_unauthenticated_returns401() throws Exception {
            SecurityContextHolder.clearContext();

            mockMvc.perform(delete("/api/ha-mssp/tenants/1/users/2"))
                    .andExpect(status().isUnauthorized());
        }

        // -------------------------------------------------------------------------
        // Minimal Spring configuration
        // -------------------------------------------------------------------------

        @Configuration
        @EnableMethodSecurity(prePostEnabled = true)
        static class SecurityConfig {

            @Bean
            MsspMembershipService msspMembershipService() {
                return mock(MsspMembershipService.class);
            }

            @Bean
            MsspTenantUserController msspTenantUserController(MsspMembershipService ms) {
                return new MsspTenantUserController(ms);
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
