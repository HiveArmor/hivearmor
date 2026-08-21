package com.hivearmor.web.rest.mssp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspTenantResolver;
import com.hivearmor.service.mssp.MsspProvisioningService;
import com.hivearmor.service.mssp.MsspTenantService;
import com.hivearmor.service.mssp.NotFoundException;
import com.hivearmor.service.mssp.dto.TenantDetailDTO;
import com.hivearmor.service.mssp.dto.UpdateTenantRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for {@link MsspTenantController#updateTenant} — standalone MockMvc.
 *
 * <p>Follows the same pattern as {@link MsspTenantControllerCreateTest}:
 * <ul>
 *   <li>Outer class uses {@code MockitoExtension} and {@code standaloneSetup} with
 *       an auth-filter stub for happy-path and behavioural tests.</li>
 *   <li>Nested {@link MsspAdminContextTest} uses {@code SpringExtension} +
 *       {@code @ContextConfiguration} + {@code @EnableMethodSecurity} to properly
 *       evaluate the class-level {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")}
 *       annotation for the 403 and 401 cases.</li>
 * </ul>
 *
 * <p>Covered scenarios:
 * <ol>
 *   <li>Happy path PUT → 200, {@code tenantResolver.evict(id)} called exactly once,
 *       {@code tenantService.update} called BEFORE evict (verified with InOrder)</li>
 *   <li>{@code tenantResolver.evict} throws → response still 200 with valid body</li>
 *   <li>PUT body containing {@code clientPrefix: "hacker"} → captured
 *       {@link UpdateTenantRequest} has no such field (Jackson silently drops it)</li>
 *   <li>404 when tenant not found ({@link NotFoundException})</li>
 *   <li>403 for non-admin (nested class with real Spring method security)</li>
 *   <li>401 unauthenticated (nested class with real Spring method security)</li>
 * </ol>
 *
 * <p>Sprint 23 — S23-T04.
 */
@ExtendWith(MockitoExtension.class)
class MsspTenantControllerUpdateTest {

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
    // Test (a) — happy path PUT → 200, evict called once, update before evict
    // =========================================================================

    /**
     * A valid PUT from an MSSP_ADMIN must return 200 with the updated DTO.
     * {@code tenantResolver.evict(id)} must be called exactly once, and
     * {@code tenantService.update} must be called BEFORE {@code tenantResolver.evict}.
     *
     * <p>Validates: Requirements 9.2, 9.6
     */
    @Test
    @DisplayName("PUT /api/ha-mssp/tenants/1 valid body → 200, evict called once, update before evict")
    void updateTenant_validRequest_returns200AndEvictsOnce() throws Exception {
        TenantDetailDTO dto = sampleDetailDTO(1L, "Updated Name", "acme");
        when(tenantService.update(eq(1L), any(UpdateTenantRequest.class))).thenReturn(dto);
        doNothing().when(tenantResolver).evict(1L);

        String body = validUpdateBody();

        mockMvcAdmin.perform(put("/api/ha-mssp/tenants/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.clientPrefix").value("acme"));

        // evict called exactly once
        verify(tenantResolver, times(1)).evict(eq(1L));

        // update must have been called before evict
        InOrder inOrder = inOrder(tenantService, tenantResolver);
        inOrder.verify(tenantService).update(eq(1L), any(UpdateTenantRequest.class));
        inOrder.verify(tenantResolver).evict(eq(1L));
    }

    // =========================================================================
    // Test (b) — tenantResolver.evict throws → response still 200
    // =========================================================================

    /**
     * When {@code tenantResolver.evict(id)} throws a {@link RuntimeException}
     * (e.g. cache infrastructure unavailable), the already-committed update must
     * still be returned as HTTP 200. The evict failure must not roll back or mask
     * the successful update.
     *
     * <p>Validates: Requirement 9.6
     */
    @Test
    @DisplayName("PUT /api/ha-mssp/tenants/1 — evict throws → still returns 200 with body")
    void updateTenant_evictThrows_stillReturns200() throws Exception {
        TenantDetailDTO dto = sampleDetailDTO(1L, "Updated Name", "acme");
        when(tenantService.update(eq(1L), any(UpdateTenantRequest.class))).thenReturn(dto);
        doThrow(new RuntimeException("cache-down")).when(tenantResolver).evict(1L);

        mockMvcAdmin.perform(put("/api/ha-mssp/tenants/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validUpdateBody()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
    }

    // =========================================================================
    // Test (c) — clientPrefix in body is silently dropped; captured record has no such field
    // =========================================================================

    /**
     * A PUT body containing {@code clientPrefix: "hacker"} must not cause
     * {@code clientPrefix} to appear in the {@link UpdateTenantRequest} captured
     * by the service. The record class has no such field; Jackson silently drops
     * the unknown property before the call reaches the service.
     *
     * <p>Validates: Requirements 9.2, 10.5
     */
    @Test
    @DisplayName("PUT body with extra clientPrefix field → UpdateTenantRequest has only 4 fields")
    void updateTenant_extraClientPrefixInBody_isDroppedByJackson() throws Exception {
        TenantDetailDTO dto = sampleDetailDTO(1L, "X", "real-prefix");
        when(tenantService.update(eq(1L), any(UpdateTenantRequest.class))).thenReturn(dto);
        doNothing().when(tenantResolver).evict(1L);

        // Body includes a rogue clientPrefix key
        String body = objectMapper.writeValueAsString(Map.of(
                "name", "X",
                "maxUsers", 10,
                "licenceType", "std",
                "contactEmail", "e@e.com",
                "clientPrefix", "hacker"
        ));

        mockMvcAdmin.perform(put("/api/ha-mssp/tenants/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());

        // Capture what was actually passed to the service
        ArgumentCaptor<UpdateTenantRequest> captor =
                ArgumentCaptor.forClass(UpdateTenantRequest.class);
        verify(tenantService).update(eq(1L), captor.capture());

        UpdateTenantRequest captured = captor.getValue();
        assertThat(captured.name()).isEqualTo("X");
        assertThat(captured.maxUsers()).isEqualTo(10);
        assertThat(captured.licenceType()).isEqualTo("std");
        assertThat(captured.contactEmail()).isEqualTo("e@e.com");
        // UpdateTenantRequest has exactly 4 fields — no clientPrefix accessor exists,
        // which proves by design that Jackson could not have injected one.
    }

    // =========================================================================
    // Test (d) — 404 when tenant not found
    // =========================================================================

    /**
     * When the service throws {@link NotFoundException}, the response must be
     * HTTP 404 (handled by {@link MsspProblemHandler}).
     *
     * <p>Validates: Requirement 9.1
     */
    @Test
    @DisplayName("PUT /api/ha-mssp/tenants/99 — service throws NotFoundException → 404")
    void updateTenant_tenantNotFound_returns404() throws Exception {
        when(tenantService.update(eq(99L), any(UpdateTenantRequest.class)))
                .thenThrow(new NotFoundException("tenant", 99L));

        mockMvcAdmin.perform(put("/api/ha-mssp/tenants/99")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validUpdateBody()))
                .andExpect(status().isNotFound());
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
         * Test (e) — authenticated user with {@code ROLE_USER} (no {@code MSSP_ADMIN})
         * must receive HTTP 403 Forbidden.
         *
         * <p>Validates: Requirement 5.2
         */
        @Test
        @DisplayName("PUT /api/ha-mssp/tenants/1 with ROLE_USER → 403 Forbidden")
        void updateTenant_withRoleUser_returns403() throws Exception {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "regular-user", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

            mockMvc.perform(put("/api/ha-mssp/tenants/1")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(validUpdateBodyStatic()))
                    .andExpect(status().isForbidden());
        }

        /**
         * Test (f) — unauthenticated request (empty security context) must receive
         * HTTP 401 Unauthorized.
         *
         * <p>Validates: Requirement 5.3
         */
        @Test
        @DisplayName("PUT /api/ha-mssp/tenants/1 unauthenticated → 401 Unauthorized")
        void updateTenant_unauthenticated_returns401() throws Exception {
            SecurityContextHolder.clearContext();

            mockMvc.perform(put("/api/ha-mssp/tenants/1")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(validUpdateBodyStatic()))
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
            MsspTenantResolver msspTenantResolver() {
                return mock(MsspTenantResolver.class);
            }

            @Bean
            MsspTenantController msspTenantController(MsspProvisioningService ps,
                                                       MsspTenantService ts,
                                                       MsspTenantResolver tr) {
                return new MsspTenantController(ps, ts, tr);
            }
        }

        private static String validUpdateBodyStatic() {
            return """
                    {"name":"Test Tenant","maxUsers":25,"licenceType":"standard","contactEmail":"admin@test.com"}
                    """;
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

    // =========================================================================
    // Private helpers
    // =========================================================================

    private String validUpdateBody() throws Exception {
        return objectMapper.writeValueAsString(
                new UpdateTenantRequest("Updated Name", 25, "standard", "admin@test.com"));
    }

    private static TenantDetailDTO sampleDetailDTO(Long id, String name, String prefix) {
        return new TenantDetailDTO(
                id, name, prefix,
                25, "standard", "admin@test.com",
                3, 0L,
                new long[60],
                new long[7]);
    }
}
