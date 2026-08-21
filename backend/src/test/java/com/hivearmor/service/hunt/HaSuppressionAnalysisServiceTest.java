package com.hivearmor.service.hunt;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.dto.ConditionTuple;
import com.hivearmor.service.hunt.dto.SuppressionPreviewResponse;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.opensearch.client.opensearch._types.aggregations.*;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link HaSuppressionAnalysisService#analyzeImpact(String, List)}.
 *
 * <p>Task 3.20 — Verifies high-impact condition (&gt;50% reduction) triggers highImpactWarning.
 * <p>Task 3.21 — Verifies critical alert overlap generates falseNegativeRiskPrompts.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@Tag("Feature: sprint-37-alert-advanced-contracts")
@DisplayName("HaSuppressionAnalysisService — Impact Analysis")
class HaSuppressionAnalysisServiceTest {

    @Mock
    private OpensearchClientBuilder osClient;

    @Mock
    private MsspIndexResolver indexResolver;

    private HaSuppressionAnalysisService service;

    @BeforeEach
    void setUp() {
        service = new HaSuppressionAnalysisService(osClient, indexResolver);
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-*");

        // Set up SecurityContext so SecurityUtils.getCurrentUserLogin() returns "analyst"
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken("analyst", "password"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Task 3.20 — High-impact condition triggers highImpactWarning flag
    // =========================================================================

    @Nested
    @DisplayName("Task 3.20 — High-impact warning (>50% reduction)")
    class HighImpactWarning {

        @Test
        @DisplayName("60% reduction (60/100) triggers highImpactWarning=true and approvalPolicy=manager_required")
        void highReduction_triggersHighImpactWarning() throws Exception {
            // 60 matching out of 100 total = 60% reduction > 50% threshold
            when(osClient.execute(any())).thenAnswer(invocation ->
                buildSuppressionResponse(100L, 60L, 0L, 0L, 10L));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("category", "is", "Credential Access"));

            SuppressionPreviewResponse response = service.analyzeImpact("alert-001", conditions);

            assertThat(response.highImpactWarning()).isTrue();
            assertThat(response.approvalPolicy()).isEqualTo("manager_required");
            assertThat(response.projectedVolumeReduction()).isEqualTo(60.0);
            assertThat(response.matchingHistoricalAlerts()).isEqualTo(60L);
        }

        @Test
        @DisplayName("20% reduction (20/100) does NOT trigger highImpactWarning")
        void lowReduction_noHighImpactWarning() throws Exception {
            // 20 matching out of 100 total = 20% reduction < 50% threshold
            when(osClient.execute(any())).thenAnswer(invocation ->
                buildSuppressionResponse(100L, 20L, 0L, 0L, 5L));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("source.ip", "starts_with", "10.0."));

            SuppressionPreviewResponse response = service.analyzeImpact("alert-002", conditions);

            assertThat(response.highImpactWarning()).isFalse();
            assertThat(response.approvalPolicy()).isEqualTo("none");
            assertThat(response.projectedVolumeReduction()).isEqualTo(20.0);
        }

        @Test
        @DisplayName("Exactly 50% reduction does NOT trigger highImpactWarning (threshold is >50)")
        void exactlyFiftyPercent_noHighImpactWarning() throws Exception {
            // 50 matching out of 100 = exactly 50% — not strictly greater than
            when(osClient.execute(any())).thenAnswer(invocation ->
                buildSuppressionResponse(100L, 50L, 0L, 0L, 10L));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("category", "is", "Brute Force"));

            SuppressionPreviewResponse response = service.analyzeImpact("alert-003", conditions);

            assertThat(response.highImpactWarning()).isFalse();
            assertThat(response.approvalPolicy()).isEqualTo("none");
        }

        @Test
        @DisplayName("51% reduction triggers highImpactWarning (just above threshold)")
        void justAboveThreshold_triggersHighImpactWarning() throws Exception {
            // 51 matching out of 100 = 51% > 50% threshold
            when(osClient.execute(any())).thenAnswer(invocation ->
                buildSuppressionResponse(100L, 51L, 0L, 0L, 10L));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("severity", "gte", "5"));

            SuppressionPreviewResponse response = service.analyzeImpact("alert-004", conditions);

            assertThat(response.highImpactWarning()).isTrue();
            assertThat(response.approvalPolicy()).isEqualTo("manager_required");
        }
    }

    // =========================================================================
    // Task 3.21 — Critical alert overlap generates falseNegativeRiskPrompts
    // =========================================================================

    @Nested
    @DisplayName("Task 3.21 — Critical alert overlap → falseNegativeRiskPrompts")
    class CriticalAlertOverlap {

        @Test
        @DisplayName("Critical overlap (severity >= 9) generates a risk prompt about critical alerts")
        void criticalOverlap_generatesRiskPrompt() throws Exception {
            // 5 critical alerts overlap with the proposed suppression condition
            when(osClient.execute(any())).thenAnswer(invocation ->
                buildSuppressionResponse(100L, 30L, 5L, 0L, 10L));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("category", "is", "Lateral Movement"));

            SuppressionPreviewResponse response = service.analyzeImpact("alert-010", conditions);

            assertThat(response.falseNegativeRiskPrompts()).isNotEmpty();
            assertThat(response.falseNegativeRiskPrompts()).anyMatch(
                prompt -> prompt.contains("critical") || prompt.contains("Critical"));
        }

        @Test
        @DisplayName("Threat-intel overlap generates a risk prompt about threat intelligence")
        void threatIntelOverlap_generatesRiskPrompt() throws Exception {
            // 3 threat-intel-matched alerts overlap with the proposed condition
            when(osClient.execute(any())).thenAnswer(invocation ->
                buildSuppressionResponse(100L, 25L, 0L, 3L, 8L));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("source.ip", "is", "192.168.1.100"));

            SuppressionPreviewResponse response = service.analyzeImpact("alert-011", conditions);

            assertThat(response.falseNegativeRiskPrompts()).isNotEmpty();
            assertThat(response.falseNegativeRiskPrompts()).anyMatch(
                prompt -> prompt.contains("threat intelligence") || prompt.contains("threat intel"));
        }

        @Test
        @DisplayName("Both critical and threat-intel overlap generate two risk prompts")
        void bothOverlaps_generateTwoRiskPrompts() throws Exception {
            // Both critical (4) and threat-intel (2) overlap
            when(osClient.execute(any())).thenAnswer(invocation ->
                buildSuppressionResponse(100L, 40L, 4L, 2L, 15L));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("destination.ip", "is", "10.0.0.1"));

            SuppressionPreviewResponse response = service.analyzeImpact("alert-012", conditions);

            assertThat(response.falseNegativeRiskPrompts()).hasSize(2);
            assertThat(response.falseNegativeRiskPrompts().get(0)).contains("critical");
            assertThat(response.falseNegativeRiskPrompts().get(1)).contains("threat intelligence");
        }

        @Test
        @DisplayName("No critical or threat-intel overlap produces empty risk prompts")
        void noOverlap_emptyRiskPrompts() throws Exception {
            // No critical overlap, no threat-intel overlap
            when(osClient.execute(any())).thenAnswer(invocation ->
                buildSuppressionResponse(100L, 10L, 0L, 0L, 3L));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("status", "is", "acknowledged"));

            SuppressionPreviewResponse response = service.analyzeImpact("alert-013", conditions);

            assertThat(response.falseNegativeRiskPrompts()).isEmpty();
        }
    }

    // =========================================================================
    // Helpers — build mock OpenSearch responses for suppression preview
    // =========================================================================

    /**
     * Builds a mock SearchResponse that simulates the suppression analysis query response.
     *
     * <p>The response has:
     * <ul>
     *   <li>Total hits = totalAlerts (denominator)</li>
     *   <li>A "matching" filter aggregate with docCount = matchingAlerts</li>
     *   <li>Sub-aggregations inside "matching": critical_overlap, threat_intel_overlap,
     *       affected_tenants, affected_data_sources, recent_alerts</li>
     * </ul>
     *
     * @param totalAlerts          total alerts in the 30-day window
     * @param matchingAlerts       alerts matching the proposed condition
     * @param criticalOverlap      count of critical alerts (severity >= 9) in matching set
     * @param threatIntelOverlap   count of threat-intel-matched alerts in matching set
     * @param recentAlerts         count of matching alerts from last 7 days
     */
    @SuppressWarnings("rawtypes")
    private SearchResponse<Map> buildSuppressionResponse(long totalAlerts,
                                                         long matchingAlerts,
                                                         long criticalOverlap,
                                                         long threatIntelOverlap,
                                                         long recentAlerts) {
        // Sub-aggregations inside the "matching" filter
        Map<String, Aggregate> matchingSubAggs = new LinkedHashMap<>();

        // affected_tenants — terms agg
        matchingSubAggs.put("affected_tenants", Aggregate.of(a -> a
            .sterms(st -> st
                .buckets(b -> b.array(List.of(
                    StringTermsBucket.of(sb -> sb.key("tenant-1").docCount(matchingAlerts)))))
                .sumOtherDocCount(0L))));

        // affected_data_sources — terms agg
        matchingSubAggs.put("affected_data_sources", Aggregate.of(a -> a
            .sterms(st -> st
                .buckets(b -> b.array(List.of(
                    StringTermsBucket.of(sb -> sb.key("windows-event-log").docCount(matchingAlerts)))))
                .sumOtherDocCount(0L))));

        // critical_overlap — filter agg
        matchingSubAggs.put("critical_overlap", Aggregate.of(a -> a
            .filter(f -> f.docCount(criticalOverlap).aggregations(Map.of()))));

        // threat_intel_overlap — filter agg
        matchingSubAggs.put("threat_intel_overlap", Aggregate.of(a -> a
            .filter(f -> f.docCount(threatIntelOverlap).aggregations(Map.of()))));

        // recent_alerts — filter agg
        matchingSubAggs.put("recent_alerts", Aggregate.of(a -> a
            .filter(f -> f.docCount(recentAlerts).aggregations(Map.of()))));

        // Top-level aggregations map
        Map<String, Aggregate> aggregations = new LinkedHashMap<>();

        // "matching" — filter aggregate wrapping all sub-aggs
        aggregations.put("matching", Aggregate.of(a -> a
            .filter(f -> f.docCount(matchingAlerts).aggregations(matchingSubAggs))));

        return SearchResponse.searchResponseOf(r -> r
            .took(12)
            .timedOut(false)
            .shards(s -> s.total(1).successful(1).failed(0))
            .hits(h -> h
                .total(t -> t.value(totalAlerts).relation(TotalHitsRelation.Eq))
                .hits(Collections.emptyList()))
            .aggregations(aggregations));
    }
}
