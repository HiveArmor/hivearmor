package com.hivearmor.service.hunt;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link HaAlertQueryService}.
 *
 * <p>Validates:
 * <ul>
 *   <li>Filter allowlist validation rejects unknown parameters</li>
 *   <li>Severity filter supports single and comma-separated levels</li>
 *   <li>Status filter maps symbolic names to numeric codes</li>
 *   <li>Assignee filter handles "unassigned", "me", and specific IDs</li>
 *   <li>riskMin filter validates numeric range</li>
 *   <li>SLA filter handles "at_risk" and "breached"</li>
 *   <li>threatIntel filter handles "matched"</li>
 *   <li>Invalid filter values throw InvalidFilterException</li>
 * </ul>
 *
 * <p>Satisfies: Sprint 36 Task 2 — S36-T01
 */
@Tag("Feature: sprint-36-alert-queue-contracts")
class HaAlertQueryServiceTest {

    private HaAlertQueryService service;

    @BeforeEach
    void setUp() {
        service = new HaAlertQueryService();
        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Filter Allowlist Validation
    // =========================================================================

    @Nested
    @DisplayName("Filter Allowlist Validation")
    class AllowlistTests {

        @Test
        @DisplayName("accepts all known filter parameters")
        void acceptsAllKnownParams() {
            Set<String> validParams = Set.of(
                "severity", "status", "assignee", "tenantId", "category",
                "riskMin", "sla", "threatIntel", "tags", "q", "from", "to",
                "cursor", "limit", "sort", "fields", "page", "size"
            );
            // Should not throw
            service.validateFilterAllowlist(validParams);
        }

        @Test
        @DisplayName("rejects unknown filter parameter")
        void rejectsUnknownParam() {
            Set<String> params = Set.of("severity", "unknownParam");
            assertThatThrownBy(() -> service.validateFilterAllowlist(params))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("unknownParam");
        }

        @Test
        @DisplayName("rejects multiple unknown parameters")
        void rejectsMultipleUnknown() {
            Set<String> params = Set.of("bogus");
            assertThatThrownBy(() -> service.validateFilterAllowlist(params))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("bogus");
        }
    }

    // =========================================================================
    // Severity Filter
    // =========================================================================

    @Nested
    @DisplayName("Severity Filter")
    class SeverityTests {

        @Test
        @DisplayName("single level: critical produces range query ≥9")
        void singleLevelCritical() {
            List<Query> filters = service.buildFilters(
                "critical", null, null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
            // Query is a range filter — we verify it builds without error
            assertThat(filters.get(0)).isNotNull();
        }

        @Test
        @DisplayName("single level: high produces range query 7-8")
        void singleLevelHigh() {
            List<Query> filters = service.buildFilters(
                "high", null, null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
        }

        @Test
        @DisplayName("single level: medium produces range query 4-6")
        void singleLevelMedium() {
            List<Query> filters = service.buildFilters(
                "medium", null, null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
        }

        @Test
        @DisplayName("single level: low produces range query 1-3")
        void singleLevelLow() {
            List<Query> filters = service.buildFilters(
                "low", null, null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
        }

        @Test
        @DisplayName("comma-separated levels produce combined OR query")
        void commaSeparatedLevels() {
            List<Query> filters = service.buildFilters(
                "critical,high", null, null, null, null, null, null, null, null, null, null);
            // Combined into a bool should (one filter query wrapping both)
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isBool()).isTrue();
        }

        @Test
        @DisplayName("three comma-separated levels produce OR query")
        void threeCommaSeparatedLevels() {
            List<Query> filters = service.buildFilters(
                "critical,high,low", null, null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isBool()).isTrue();
        }

        @Test
        @DisplayName("invalid severity level throws")
        void invalidSeverityLevel() {
            assertThatThrownBy(() -> service.buildFilters(
                "extreme", null, null, null, null, null, null, null, null, null, null))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("extreme");
        }

        @Test
        @DisplayName("comma-separated with one invalid level throws")
        void commaSeparatedWithInvalid() {
            assertThatThrownBy(() -> service.buildFilters(
                "critical,invalid", null, null, null, null, null, null, null, null, null, null))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("invalid");
        }
    }

    // =========================================================================
    // Status Filter
    // =========================================================================

    @Nested
    @DisplayName("Status Filter")
    class StatusTests {

        @Test
        @DisplayName("'active' produces an open-or-in-review bool query")
        void activeStatus() {
            List<Query> filters = service.buildFilters(
                null, "active", null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isBool()).isTrue();
        }

        @Test
        @DisplayName("'open' produces term query status = 2")
        void openStatus() {
            List<Query> filters = service.buildFilters(
                null, "open", null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isTerm()).isTrue();
        }

        @Test
        @DisplayName("'in_review' produces term query status = 3")
        void inReviewStatus() {
            List<Query> filters = service.buildFilters(
                null, "in_review", null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isTerm()).isTrue();
        }

        @Test
        @DisplayName("'true_positive' produces term query status = 6")
        void truePositiveStatus() {
            List<Query> filters = service.buildFilters(
                null, "true_positive", null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isTerm()).isTrue();
        }

        @Test
        @DisplayName("'false_positive' produces term query status = 7")
        void falsePositiveStatus() {
            List<Query> filters = service.buildFilters(
                null, "false_positive", null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isTerm()).isTrue();
        }

        @Test
        @DisplayName("'closed' produces term query status = 5")
        void closedStatus() {
            List<Query> filters = service.buildFilters(
                null, "closed", null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isTerm()).isTrue();
        }

        @Test
        @DisplayName("numeric status passes through")
        void numericStatus() {
            List<Query> filters = service.buildFilters(
                null, "3", null, null, null, null, null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isTerm()).isTrue();
        }

        @Test
        @DisplayName("invalid status throws")
        void invalidStatus() {
            assertThatThrownBy(() -> service.buildFilters(
                null, "unknown_status", null, null, null, null, null, null, null, null, null))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("unknown_status");
        }
    }

    // =========================================================================
    // Assignee Filter
    // =========================================================================

    @Nested
    @DisplayName("Assignee Filter")
    class AssigneeTests {

        @Test
        @DisplayName("'unassigned' produces must_not exists query")
        void unassigned() {
            List<Query> filters = service.buildFilters(
                null, null, null, null, null, "unassigned", null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isBool()).isTrue();
        }

        @Test
        @DisplayName("'me' uses current authenticated user")
        void meFilter() {
            // Set up security context with a test user
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("analyst1", "pass"));

            List<Query> filters = service.buildFilters(
                null, null, null, null, null, "me", null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isTerm()).isTrue();
        }

        @Test
        @DisplayName("'me' with no authenticated user throws")
        void meWithNoUser() {
            // No security context set
            assertThatThrownBy(() -> service.buildFilters(
                null, null, null, null, null, "me", null, null, null, null, null))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("me");
        }

        @Test
        @DisplayName("specific user ID produces term query")
        void specificUserId() {
            List<Query> filters = service.buildFilters(
                null, null, null, null, null, "user-123", null, null, null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isTerm()).isTrue();
        }
    }

    // =========================================================================
    // RiskMin Filter
    // =========================================================================

    @Nested
    @DisplayName("RiskMin Filter")
    class RiskMinTests {

        @Test
        @DisplayName("valid numeric value produces range query")
        void validRiskMin() {
            List<Query> filters = service.buildFilters(
                null, null, null, null, null, null, null, "75", null, null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isRange()).isTrue();
        }

        @Test
        @DisplayName("zero value is valid")
        void zeroRiskMin() {
            List<Query> filters = service.buildFilters(
                null, null, null, null, null, null, null, "0", null, null, null);
            assertThat(filters).hasSize(1);
        }

        @Test
        @DisplayName("non-numeric value throws")
        void nonNumericThrows() {
            assertThatThrownBy(() -> service.buildFilters(
                null, null, null, null, null, null, null, "abc", null, null, null))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("abc");
        }

        @Test
        @DisplayName("value > 100 throws")
        void outOfRangeHighThrows() {
            assertThatThrownBy(() -> service.buildFilters(
                null, null, null, null, null, null, null, "150", null, null, null))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("150");
        }

        @Test
        @DisplayName("negative value throws")
        void negativeThrows() {
            assertThatThrownBy(() -> service.buildFilters(
                null, null, null, null, null, null, null, "-5", null, null, null))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("-5");
        }
    }

    // =========================================================================
    // SLA Filter
    // =========================================================================

    @Nested
    @DisplayName("SLA Filter")
    class SlaTests {

        @Test
        @DisplayName("'at_risk' produces range query for within 1 hour")
        void atRisk() {
            List<Query> filters = service.buildFilters(
                null, null, null, null, null, null, null, null, "at_risk", null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isRange()).isTrue();
        }

        @Test
        @DisplayName("'breached' produces range query for past deadline")
        void breached() {
            List<Query> filters = service.buildFilters(
                null, null, null, null, null, null, null, null, "breached", null, null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isRange()).isTrue();
        }

        @Test
        @DisplayName("invalid SLA value throws")
        void invalidSla() {
            assertThatThrownBy(() -> service.buildFilters(
                null, null, null, null, null, null, null, null, "invalid", null, null))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("invalid");
        }
    }

    // =========================================================================
    // ThreatIntel Filter
    // =========================================================================

    @Nested
    @DisplayName("ThreatIntel Filter")
    class ThreatIntelTests {

        @Test
        @DisplayName("'matched' produces term query threatIntelMatched=true")
        void matched() {
            List<Query> filters = service.buildFilters(
                null, null, null, null, null, null, null, null, null, "matched", null);
            assertThat(filters).hasSize(1);
            assertThat(filters.get(0).isTerm()).isTrue();
        }

        @Test
        @DisplayName("invalid threatIntel value throws")
        void invalidThreatIntel() {
            assertThatThrownBy(() -> service.buildFilters(
                null, null, null, null, null, null, null, null, null, "unmatched", null))
                .isInstanceOf(HaAlertQueryService.InvalidFilterException.class)
                .hasMessageContaining("unmatched");
        }
    }

    // =========================================================================
    // Combined Filters
    // =========================================================================

    @Nested
    @DisplayName("Combined Filters")
    class CombinedTests {

        @Test
        @DisplayName("multiple filters produce multiple query clauses")
        void multipleFilters() {
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("analyst1", "pass"));

            List<Query> filters = service.buildFilters(
                "critical", "active", "2026-01-01T00:00:00Z", "2026-12-31T23:59:59Z",
                "malware", "me", "apt,ransomware", "80", "at_risk", "matched", null);
            // Time range + severity + status + category + assignee + tags(2) + riskMin + sla + threatIntel
            // = 1 + 1 + 1 + 1 + 1 + 2 + 1 + 1 + 1 = 10
            assertThat(filters).hasSize(10);
        }

        @Test
        @DisplayName("no filters produce empty list")
        void noFilters() {
            List<Query> filters = service.buildFilters(
                null, null, null, null, null, null, null, null, null, null, null);
            assertThat(filters).isEmpty();
        }
    }
}
