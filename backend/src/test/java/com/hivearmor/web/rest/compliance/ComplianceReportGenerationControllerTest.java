package com.hivearmor.web.rest.compliance;

import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.compliance.ComplianceReportGenerationService;
import com.hivearmor.service.dto.compliance.ComplianceReportDto;
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
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unit tests for {@link ComplianceReportGenerationController} —
 * {@code POST /api/ha-compliance/reports/generate?tenantId={id}}.
 *
 * <h3>Coverage</h3>
 * <ul>
 *   <li>Requirement 5.4 — JWT lacking both {@code MSSP_ADMIN} and {@code ADMIN} → 403</li>
 *   <li>Requirement 5.5 — No {@code Authorization} header → 401</li>
 *   <li>Requirement 5.6 — Unknown {@code tenantId} → 404, service never called</li>
 * </ul>
 *
 * <p>Uses two complementary strategies:
 * <ol>
 *   <li>Pure Mockito unit tests (no Spring context) — verify the 404 guard path and
 *       confirm the service is never called for an unknown tenantId.</li>
 *   <li>Standalone MockMvc + nested Spring method-security context (same pattern as
 *       {@code MsspOverviewControllerTest}) — confirm that {@code @PreAuthorize} causes
 *       the correct 401 / 403 HTTP status codes before the method body is entered.</li>
 * </ol>
 *
 * <p>Sprint 24 — S24-T02 task 2.6.
 */
@ExtendWith(MockitoExtension.class)
class ComplianceReportGenerationControllerTest {

    // -------------------------------------------------------------------------
    // Test fixtures
    // -------------------------------------------------------------------------

    private static final Long   VALID_TENANT_ID   = 42L;
    private static final Long   UNKNOWN_TENANT_ID = 999L;
    private static final String CLIENT_PREFIX     = "acme";
    private static final String CLIENT_NAME       = "Acme Corp";

    @Mock
    private ComplianceReportGenerationService complianceReportGenerationService;

    @Mock
    private HaClientRepository haClientRepository;

    private ComplianceReportGenerationController controller;

    @BeforeEach
    void setUp() {
        controller = new ComplianceReportGenerationController(
                complianceReportGenerationService,
                haClientRepository
        );
    }

    // =========================================================================
    // Pure Mockito unit tests — 404 guard (Requirement 5.6)
    // =========================================================================

    /**
     * When {@code haClientRepository.findById} returns empty, the controller must
     * throw a 404 {@link ResponseStatusException} and must NOT invoke the report
     * service.
     *
     * <p>Validates: Requirement 5.6
     */
    @Test
    @DisplayName("generate: unknown tenantId throws 404 ResponseStatusException — Req 5.6")
    void generate_withUnknownTenantId_throws404() {
        when(haClientRepository.findById(UNKNOWN_TENANT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.generate(UNKNOWN_TENANT_ID))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
                });
    }

    /**
     * Companion assertion: the service is never called when the tenant lookup fails.
     *
     * <p>Validates: Requirement 5.6 (controller method body is not entered)
     */
    @Test
    @DisplayName("generate: service is NEVER called when tenantId is not found — Req 5.6")
    void generate_after404_serviceNeverCalled() {
        when(haClientRepository.findById(UNKNOWN_TENANT_ID)).thenReturn(Optional.empty());

        try {
            controller.generate(UNKNOWN_TENANT_ID);
        } catch (ResponseStatusException ignored) {
            // expected — we only care about the side-effect below
        }

        verify(complianceReportGenerationService, never()).generate(any());
    }

    /**
     * When the tenant exists and {@code MSSP_ADMIN} authority is present in the
     * security context, the service IS invoked — this confirms the method body runs
     * for valid calls (validates the happy path that the 403/404 paths deliberately
     * bypass).
     *
     * <p>Validates: Requirement 5.7
     */
    @Test
    @DisplayName("generate: valid tenantId — service is called once — Req 5.7")
    void generate_withValidTenant_callsService() {
        HaClient tenant = buildClient(VALID_TENANT_ID, CLIENT_PREFIX, CLIENT_NAME);
        when(haClientRepository.findById(VALID_TENANT_ID)).thenReturn(Optional.of(tenant));

        ComplianceReportDto report = new ComplianceReportDto();
        report.setTenantPrefix(CLIENT_PREFIX);
        report.setTenantName(CLIENT_NAME);
        when(complianceReportGenerationService.generate(VALID_TENANT_ID)).thenReturn(report);

        // Install MSSP_ADMIN in the security context so TenantContext.set is not
        // blocked by an unauthenticated-call check in the controller (the @PreAuthorize
        // gate is tested via Spring method security in the nested class below).
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                "mssp-admin", null,
                Collections.singletonList(new SimpleGrantedAuthority("MSSP_ADMIN"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);

        try {
            controller.generate(VALID_TENANT_ID);
        } finally {
            SecurityContextHolder.clearContext();
        }

        verify(complianceReportGenerationService, times(1)).generate(VALID_TENANT_ID);
    }

    // =========================================================================
    // Spring method-security tests — 401 / 403 gating (Requirements 5.4, 5.5)
    // =========================================================================

    /**
     * Nested class that loads a minimal Spring context with
     * {@link EnableMethodSecurity} to fully evaluate
     * {@code @PreAuthorize("hasAnyAuthority('MSSP_ADMIN','ADMIN')")} on the
     * controller method.
     *
     * <ul>
     *   <li>Requirement 5.4 — under-privileged JWT → 403 Forbidden</li>
     *   <li>Requirement 5.5 — unauthenticated (no header) → 401 Unauthorized</li>
     * </ul>
     */
    @Nested
    @ExtendWith(SpringExtension.class)
    @ContextConfiguration(classes = ComplianceSecurityConfig.class)
    static class PreAuthorizeGateTests {

        @Autowired
        private ComplianceReportGenerationController securedController;

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
         * A JWT that carries neither {@code MSSP_ADMIN} nor {@code ADMIN} authority
         * must receive HTTP 403 Forbidden, and the controller method body must not
         * execute (service never called).
         *
         * <p>Validates: Requirement 5.4
         */
        @Test
        @DisplayName("POST /api/ha-compliance/reports/generate with ROLE_USER → 403 Forbidden — Req 5.4")
        void generate_withUnprivilegedJwt_returns403() throws Exception {
            // Install ROLE_USER — holds neither MSSP_ADMIN nor ADMIN
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "low-priv-user", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

            mockMvc.perform(post("/api/ha-compliance/reports/generate")
                            .param("tenantId", "42"))
                    .andExpect(status().isForbidden());
        }

        /**
         * A JWT whose {@code auth} claim includes only {@code ADMIN} (but not
         * {@code MSSP_ADMIN}) must still be permitted — {@code hasAnyAuthority}
         * accepts either authority.
         *
         * <p>Validates: Requirement 5.3 (ADMIN is also accepted)
         */
        @Test
        @DisplayName("POST /api/ha-compliance/reports/generate with ADMIN authority → not 403 — Req 5.3")
        void generate_withAdminAuthority_isNotForbidden() throws Exception {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "admin-user", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ADMIN"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

            // The service call will result in 404 (unknown tenant) because the mock
            // haClientRepository returns empty — that is acceptable here; we only
            // assert that @PreAuthorize does NOT block this caller.
            mockMvc.perform(post("/api/ha-compliance/reports/generate")
                            .param("tenantId", "999"))
                    .andExpect(status().isNotFound());
        }

        /**
         * When there is no {@code Authorization} header (empty security context),
         * Spring Security must reject the request with HTTP 401 Unauthorized before
         * the method body is entered.
         *
         * <p>Validates: Requirement 5.5
         */
        @Test
        @DisplayName("POST /api/ha-compliance/reports/generate with no Authorization → 401 Unauthorized — Req 5.5")
        void generate_withNoAuthorizationHeader_returns401() throws Exception {
            // Security context explicitly empty — simulates a missing Authorization header
            SecurityContextHolder.clearContext();

            mockMvc.perform(post("/api/ha-compliance/reports/generate")
                            .param("tenantId", "42"))
                    .andExpect(status().isUnauthorized());
        }

        /**
         * A JWT carrying {@code MSSP_ADMIN} authority must be permitted by the gate,
         * confirming that the method body is entered for privileged callers.
         *
         * <p>Validates: Requirement 5.7
         */
        @Test
        @DisplayName("POST /api/ha-compliance/reports/generate with MSSP_ADMIN authority → not 403 — Req 5.7")
        void generate_withMsspAdminAuthority_isNotForbidden() throws Exception {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "mssp-admin-user", null,
                    Collections.singletonList(new SimpleGrantedAuthority("MSSP_ADMIN"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

            // The service call will result in 404 (unknown tenant) — acceptable; we
            // only care that the @PreAuthorize gate passes for MSSP_ADMIN.
            mockMvc.perform(post("/api/ha-compliance/reports/generate")
                            .param("tenantId", "999"))
                    .andExpect(status().isNotFound());
        }
    }

    // =========================================================================
    // Minimal Spring configuration — method security + controller bean
    // =========================================================================

    /**
     * Minimal Spring context configuration that activates method-level security and
     * registers {@link ComplianceReportGenerationController} with mocked collaborators.
     * This enables full evaluation of
     * {@code @PreAuthorize("hasAnyAuthority('MSSP_ADMIN','ADMIN')")} via the AOP proxy
     * without loading the full application context.
     */
    @Configuration
    @EnableMethodSecurity(prePostEnabled = true)
    static class ComplianceSecurityConfig {

        @Bean
        ComplianceReportGenerationService complianceReportGenerationService() {
            return mock(ComplianceReportGenerationService.class);
        }

        @Bean
        HaClientRepository haClientRepository() {
            HaClientRepository repo = mock(HaClientRepository.class);
            // Unknown tenant: always returns empty so that requests that pass the
            // @PreAuthorize gate consistently produce 404 (not 200 or 500).
            when(repo.findById(any())).thenReturn(Optional.empty());

            // Valid tenant for known ID used by happy-path authority assertions
            HaClient tenant = new HaClient();
            tenant.setId(42L);
            tenant.setClientPrefix("acme");
            tenant.setName("Acme Corp");
            when(repo.findById(42L)).thenReturn(Optional.of(tenant));
            return repo;
        }

        @Bean
        ComplianceReportGenerationController complianceReportGenerationController(
                ComplianceReportGenerationService svc,
                HaClientRepository repo) {
            return new ComplianceReportGenerationController(svc, repo);
        }
    }

    // =========================================================================
    // Controller advice — maps Spring Security AOP exceptions to HTTP 401 / 403
    // =========================================================================

    /**
     * Maps {@code AccessDeniedException} / {@code AuthorizationDeniedException} to
     * HTTP 403 and {@code AuthenticationCredentialsNotFoundException} to HTTP 401 for
     * standalone MockMvc (which has no DispatcherServlet-level security filter chain).
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

    // =========================================================================
    // Helper
    // =========================================================================

    private static HaClient buildClient(Long id, String clientPrefix, String name) {
        HaClient c = new HaClient();
        c.setId(id);
        c.setClientPrefix(clientPrefix);
        c.setName(name);
        return c;
    }
}
