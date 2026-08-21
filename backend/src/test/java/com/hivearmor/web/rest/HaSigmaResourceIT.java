package com.hivearmor.web.rest;

import com.hivearmor.HiveArmorApp;
import com.hivearmor.domain.HaSigmaRule;
import com.hivearmor.repository.HaSigmaRuleRepository;
import com.hivearmor.service.HaSigmaSyncService;
import com.hivearmor.service.dto.SigmaSyncResultDTO;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Controller integration tests for {@link HaSigmaResource}.
 *
 * Covers Properties 8, 9, and 10 from the Sprint 14 Sigma Detection spec,
 * plus the unauthenticated (401) and ANALYST-on-sync (403) security cases.
 *
 * Both {@link HaSigmaSyncService} and {@link HaSigmaRuleRepository} are
 * mocked via {@code @MockBean} so no live database connection is required.
 *
 * The two air-gap states require separate Spring test contexts; they are
 * implemented as {@code @Nested} inner classes each annotated with their own
 * {@code @TestPropertySource} so that {@code @Value("${app.air-gap}")} is
 * set correctly before the controller bean is wired.
 *
 * Validates: Requirements 2.11, 2.12, 2.13, 2.14
 *
 * Run with: cd backend && mvn -s settings.xml test -Dtest=HaSigmaResourceIT
 */
class HaSigmaResourceIT {

    /**
     * Fixed 409 body per Requirement 2.12 — byte-for-byte identical to the
     * constant in {@link HaSigmaResource}.
     */
    private static final String AIR_GAP_409_BODY =
        "{\"error\":\"Sigma sync unavailable in air-gap mode\","
            + "\"processed\":0,\"inserted\":0,\"updated\":0,\"errors\":0}";

    // ── Property 8: Air-gap sync API returns fixed 409 and makes no outbound call ──────────

    /**
     * Tests that run with {@code app.air-gap=true}.
     * Each test gets the shared Spring context that has air-gap enabled.
     */
    @Nested
    @SpringBootTest(classes = HiveArmorApp.class)
    @AutoConfigureMockMvc
    @TestPropertySource(properties = "app.air-gap=true")
    class WhenAirGapEnabled {

        @Autowired
        MockMvc mockMvc;

        @MockBean
        HaSigmaSyncService syncService;

        @MockBean
        HaSigmaRuleRepository ruleRepository;

        /**
         * Property 8 — POST /api/ha-sigma/sync as ADMIN with air-gap enabled.
         *
         * MUST return HTTP 409 with the fixed JSON body and MUST NOT invoke
         * {@code syncFromGithub()} (hence zero outbound HTTP calls).
         *
         * Validates: Requirements 2.12
         */
        @Test
        @WithMockUser(username = "admin", authorities = {"ROLE_ADMIN"})
        void sync_returns409WithFixedBody() throws Exception {
            mockMvc.perform(post("/api/ha-sigma/sync")
                    .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json(AIR_GAP_409_BODY, true)); // strict key-order match

            // syncFromGithub() is the only method that builds HttpClient; it must not be called.
            verify(syncService, never()).syncFromGithub();
        }
    }

    // ── Property 9: Sync API response mirrors service counts (air-gap disabled) ────────────
    // ── Property 10: GET /api/ha-sigma/rules honours filter predicates ────────────────────
    // ── Security: 401 / 403 cases ─────────────────────────────────────────────────────────

    /**
     * Tests that run with {@code app.air-gap=false} (the default, but made explicit
     * here so the context is unambiguous and independent of environment defaults).
     */
    @Nested
    @SpringBootTest(classes = HiveArmorApp.class)
    @AutoConfigureMockMvc
    @TestPropertySource(properties = "app.air-gap=false")
    class WhenAirGapDisabled {

        @Autowired
        MockMvc mockMvc;

        @MockBean
        HaSigmaSyncService syncService;

        @MockBean
        HaSigmaRuleRepository ruleRepository;

        // ── Property 9 ──────────────────────────────────────────────────────────

        /**
         * Property 9 — POST /api/ha-sigma/sync as ADMIN with air-gap disabled.
         *
         * MUST call {@code syncFromGithub()}, return HTTP 200, and the body
         * MUST contain the four integer fields returned by the service.
         *
         * Validates: Requirements 2.13
         */
        @Test
        @WithMockUser(username = "admin", authorities = {"ROLE_ADMIN"})
        void sync_returns200WithServiceCounts() throws Exception {
            SigmaSyncResultDTO result = new SigmaSyncResultDTO(150, 140, 10, 0);
            when(syncService.syncFromGithub()).thenReturn(result);

            mockMvc.perform(post("/api/ha-sigma/sync")
                    .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.processed", is(150)))
                .andExpect(jsonPath("$.inserted",  is(140)))
                .andExpect(jsonPath("$.updated",   is(10)))
                .andExpect(jsonPath("$.errors",    is(0)));

            verify(syncService, times(1)).syncFromGithub();
        }

        // ── Property 10 — product filter ────────────────────────────────────────

        /**
         * Property 10 (product filter) — GET /api/ha-sigma/rules?logsourceProduct=windows
         *
         * Every rule in the paged response MUST have logsourceProduct == "windows".
         *
         * Validates: Requirements 2.14
         */
        @Test
        @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
        void getRules_productFilter_returnsOnlyMatchingRules() throws Exception {
            HaSigmaRule r1 = buildRule(1L, "win-rule-a", "Windows Cred Dump",    "windows", 4);
            HaSigmaRule r2 = buildRule(2L, "win-rule-b", "Windows Lateral Move", "windows", 3);
            PageImpl<HaSigmaRule> page =
                new PageImpl<>(List.of(r1, r2), PageRequest.of(0, 25), 2);

            when(ruleRepository.findByLogsourceProduct(eq("windows"), any(Pageable.class)))
                .thenReturn(page);

            mockMvc.perform(get("/api/ha-sigma/rules")
                    .param("logsourceProduct", "windows")
                    .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(2)))
                .andExpect(jsonPath("$.content[*].logsourceProduct",
                    everyItem(is("windows"))));
        }

        /**
         * Property 10 (minSeverity filter) — GET /api/ha-sigma/rules?minSeverity=4
         *
         * Every rule in the paged response MUST have haSeverity >= 4.
         *
         * Validates: Requirements 2.14
         */
        @Test
        @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
        void getRules_minSeverityFilter_returnsOnlyHighAndCriticalRules() throws Exception {
            HaSigmaRule r1 = buildRule(3L, "high-rule",     "High Severity",     "windows", 4);
            HaSigmaRule r2 = buildRule(4L, "critical-rule", "Critical Severity", "linux",   5);
            PageImpl<HaSigmaRule> page =
                new PageImpl<>(List.of(r1, r2), PageRequest.of(0, 25), 2);

            when(ruleRepository.findByHaSeverityGreaterThanEqual(eq(4), any(Pageable.class)))
                .thenReturn(page);

            mockMvc.perform(get("/api/ha-sigma/rules")
                    .param("minSeverity", "4")
                    .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(2)))
                .andExpect(jsonPath("$.content[*].haSeverity",
                    everyItem(greaterThanOrEqualTo(4))));
        }

        /**
         * Property 10 (combined product + minSeverity filter).
         *
         * When both parameters are supplied, the combined finder is used and every
         * row in the response satisfies BOTH predicates simultaneously.
         *
         * Validates: Requirements 2.14
         */
        @Test
        @WithMockUser(username = "admin", authorities = {"ROLE_ADMIN"})
        void getRules_combinedFilter_returnsOnlyMatchingRules() throws Exception {
            HaSigmaRule r1 = buildRule(5L, "win-high", "Windows High Severity", "windows", 4);
            PageImpl<HaSigmaRule> page =
                new PageImpl<>(List.of(r1), PageRequest.of(0, 25), 1);

            when(ruleRepository.findByLogsourceProductAndHaSeverityGreaterThanEqual(
                eq("windows"), eq(4), any(Pageable.class)))
                .thenReturn(page);

            mockMvc.perform(get("/api/ha-sigma/rules")
                    .param("logsourceProduct", "windows")
                    .param("minSeverity", "4")
                    .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].logsourceProduct", is("windows")))
                .andExpect(jsonPath("$.content[0].haSeverity", greaterThanOrEqualTo(4)));
        }

        // ── Security cases ────────────────────────────────────────────────────

        /**
         * Unauthenticated request to POST /api/ha-sigma/sync MUST return 401.
         *
         * Validates: Requirements 2.11
         */
        @Test
        void sync_unauthenticated_returns401() throws Exception {
            mockMvc.perform(post("/api/ha-sigma/sync")
                    .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized());
        }

        /**
         * Unauthenticated request to GET /api/ha-sigma/rules MUST return 401.
         *
         * Validates: Requirements 2.11
         */
        @Test
        void getRules_unauthenticated_returns401() throws Exception {
            mockMvc.perform(get("/api/ha-sigma/rules")
                    .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized());
        }

        /**
         * ANALYST role MUST receive 403 on POST /api/ha-sigma/sync (ADMIN-only endpoint).
         *
         * Validates: Requirements 2.11
         */
        @Test
        @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
        void sync_analystRole_returns403() throws Exception {
            mockMvc.perform(post("/api/ha-sigma/sync")
                    .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());

            // The service must never be reached when the role check fails.
            verify(syncService, never()).syncFromGithub();
        }

        /**
         * ANALYST role MUST be permitted to call GET /api/ha-sigma/rules.
         *
         * Validates: Requirements 2.11
         */
        @Test
        @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
        void getRules_analystRole_returns200() throws Exception {
            when(ruleRepository.findAll(any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 25), 0));

            mockMvc.perform(get("/api/ha-sigma/rules")
                    .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk());
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        /**
         * Builds a minimal {@link HaSigmaRule} with all non-nullable fields set.
         */
        private HaSigmaRule buildRule(Long id, String sigmaId, String title,
                                      String product, int severity) {
            HaSigmaRule r = new HaSigmaRule();
            r.setId(id);
            r.setSigmaId(sigmaId);
            r.setRuleTitle(title);
            r.setRuleStatus("stable");
            r.setLogsourceProduct(product);
            r.setLogsourceService(null);
            r.setDetectionYaml(
                "detection:\n  selection:\n    EventID: 4624\n  condition: selection");
            r.setHaSeverity(severity);
            r.setMitreTags("attack.credential_access");
            r.setActive(Boolean.TRUE);
            r.setImportedAt(Instant.parse("2026-07-25T00:00:00Z"));
            r.setUpdatedAt(Instant.parse("2026-07-25T00:00:00Z"));
            return r;
        }
    }
}
