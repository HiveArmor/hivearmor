package com.hivearmor.web.rest.mssp;

import com.hivearmor.service.mssp.MsspAggregateReportService;
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
import org.springframework.http.HttpHeaders;
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

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collections;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Integration tests for {@link MsspAggregateReportController}.
 *
 * <p>Validates Requirements 11.3, 11.4, 11.5, 11.6, 11.7:
 * <ul>
 *   <li>11.3 / 11.4 — Correct {@code Content-Type} and {@code Content-Disposition} headers on success</li>
 *   <li>11.5 — {@code MSSP_ADMIN} authority grants access (HTTP 200)</li>
 *   <li>11.6 — Unprivileged users receive HTTP 403</li>
 *   <li>11.7 — Unauthenticated requests receive HTTP 401</li>
 * </ul>
 *
 * <p>Uses a standalone MockMvc setup with Spring method security enabled so that
 * {@code @PreAuthorize} on the controller is evaluated properly without standing
 * up a full application context.
 *
 * <p>Sprint 24 — S24-T03 task 3.8.
 */
@ExtendWith(MockitoExtension.class)
class MsspAggregateReportControllerTest {

    @Mock
    private MsspAggregateReportService msspAggregateReportService;

    @BeforeEach
    void setup() {
        when(msspAggregateReportService.buildAggregateWorkbook()).thenReturn(new byte[]{1, 2, 3});
    }

    // -------------------------------------------------------------------------
    // Nested Spring context tests — method security via @EnableMethodSecurity
    // -------------------------------------------------------------------------

    @Nested
    @ExtendWith(SpringExtension.class)
    @ContextConfiguration(classes = AggregateSecurityConfig.class)
    @DisplayName("MsspAggregateReportController — authorization and response headers")
    static class AuthorizationTests {

        @Autowired
        private MsspAggregateReportController controller;

        private MockMvc mockMvc;

        @BeforeEach
        void setUp() {
            SecurityContextHolder.clearContext();
            mockMvc = MockMvcBuilders
                    .standaloneSetup(controller)
                    .setControllerAdvice(new SecurityAdvice())
                    .build();
        }

        /**
         * Requirement 11.3, 11.4, 11.5 — a caller with the {@code MSSP_ADMIN} authority
         * receives HTTP 200 with the correct XLSX {@code Content-Type} and a
         * {@code Content-Disposition} header whose filename embeds the current UTC date in
         * {@code yyyy-MM-dd} format.
         */
        @Test
        @DisplayName("GET /api/ha-mssp/reports/aggregate with MSSP_ADMIN -> 200 with correct headers")
        void aggregate_withMsspAdmin_returns200WithHeaders() throws Exception {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "mssp-admin", null,
                    Collections.singletonList(new SimpleGrantedAuthority("MSSP_ADMIN"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

            mockMvc.perform(get("/api/ha-mssp/reports/aggregate"))
                    .andExpect(status().isOk())
                    .andExpect(header().string(
                            HttpHeaders.CONTENT_TYPE,
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .andExpect(header().string(
                            HttpHeaders.CONTENT_DISPOSITION,
                            org.hamcrest.Matchers.matchesPattern(
                                    "attachment; filename=\"hivearmor-mssp-aggregate-[0-9]{4}-[0-9]{2}-[0-9]{2}\\.xlsx\"")));
        }

        /**
         * Requirement 11.6 — a caller with only {@code ROLE_USER} (no {@code MSSP_ADMIN})
         * receives HTTP 403 Forbidden.
         */
        @Test
        @DisplayName("GET /api/ha-mssp/reports/aggregate with ROLE_USER -> 403")
        void aggregate_withUnprivilegedUser_returns403() throws Exception {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    "user", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

            mockMvc.perform(get("/api/ha-mssp/reports/aggregate"))
                    .andExpect(status().isForbidden());
        }

        /**
         * Requirement 11.7 — a request with no {@code Authorization} header (no
         * authentication context in the {@link SecurityContextHolder}) receives HTTP 401.
         */
        @Test
        @DisplayName("GET /api/ha-mssp/reports/aggregate without auth -> 401")
        void aggregate_withoutAuth_returns401() throws Exception {
            SecurityContextHolder.clearContext();

            mockMvc.perform(get("/api/ha-mssp/reports/aggregate"))
                    .andExpect(status().isUnauthorized());
        }
    }

    // -------------------------------------------------------------------------
    // Spring configuration — method security + mock beans
    // -------------------------------------------------------------------------

    /**
     * Minimal Spring configuration that enables {@code @PreAuthorize} evaluation and
     * wires a fixed-clock {@link MsspAggregateReportController} bean.
     *
     * <p>The {@link Clock} is fixed to {@code 2026-07-24T12:00:00Z} so the filename
     * date in the {@code Content-Disposition} header is deterministic in tests.
     */
    @Configuration
    @EnableMethodSecurity(prePostEnabled = true)
    static class AggregateSecurityConfig {

        @Bean
        MsspAggregateReportService msspAggregateReportService() {
            MsspAggregateReportService svc = mock(MsspAggregateReportService.class);
            when(svc.buildAggregateWorkbook()).thenReturn(new byte[]{1, 2, 3});
            return svc;
        }

        @Bean
        Clock clock() {
            // Fixed clock so filename date is deterministic in tests (→ "2026-07-24")
            return Clock.fixed(Instant.parse("2026-07-24T12:00:00Z"), ZoneOffset.UTC);
        }

        @Bean
        MsspAggregateReportController msspAggregateReportController(
                MsspAggregateReportService svc, Clock clock) {
            return new MsspAggregateReportController(svc, clock);
        }
    }

    // -------------------------------------------------------------------------
    // Controller advice — maps Spring Security exceptions to HTTP status codes
    // -------------------------------------------------------------------------

    /**
     * Translates Spring Security exceptions thrown during {@code @PreAuthorize}
     * evaluation into the appropriate HTTP error codes.
     *
     * <p>In a full application context these would be handled by the global
     * {@code SecurityConfiguration}, but standalone MockMvc requires explicit advice.
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
