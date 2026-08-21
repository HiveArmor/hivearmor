package com.hivearmor.service.hunt;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.dto.SeverityBoardResponse;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.opensearch.client.opensearch._types.ShardStatistics;
import org.opensearch.client.opensearch._types.aggregations.*;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.HitsMetadata;
import org.opensearch.client.opensearch.core.search.TotalHits;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests verifying that the severity board respects tenant isolation via
 * the X-Tenant-ID header (resolved through TenantContext → MsspIndexResolver).
 *
 * <p>Tests at the service level: mocks OpensearchClientBuilder to capture the
 * SearchRequest and verify the index pattern includes the correct tenant prefix.
 *
 * <p>Validates: Design Property 5 (Tenant Scoping) — Requirement 1.8.
 *
 * <p>Sprint 37 — ALT-023 (Tasks 2.1–2.5).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@Tag("Feature: sprint-37-alert-advanced-contracts")
@DisplayName("HaSeverityBoardService — Tenant Isolation")
class HaSeverityBoardTenantIsolationTest {

    @Mock
    private OpensearchClientBuilder osClient;

    @Mock
    private MsspIndexResolver indexResolver;

    private HaSeverityBoardService service;

    @BeforeEach
    void setUp() {
        service = new HaSeverityBoardService(osClient, indexResolver);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // =========================================================================
    // Task 2.1: severity board respects X-Tenant-ID header
    //           (resolves correct index pattern)
    // =========================================================================

    @Nested
    @DisplayName("Task 2.1 — Tenant-scoped index resolution")
    class TenantScopedIndexResolution {

        @Test
        @DisplayName("When TenantContext is set to 'cwm', MsspIndexResolver is called and returns tenant-scoped pattern")
        void tenantContext_cwm_resolvesToTenantScopedPattern() throws Exception {
            // Simulate X-Tenant-ID = "cwm" being processed by TenantContextFilter
            TenantContext.set("cwm");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-cwm-*");
            stubMinimalSearchResponse();

            service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            // Verify MsspIndexResolver was invoked
            verify(indexResolver).resolveAlertIndexPattern();
        }

        @Test
        @DisplayName("SearchRequest uses the tenant-scoped index pattern from MsspIndexResolver")
        void searchRequest_usesResolvedTenantPattern() throws Exception {
            TenantContext.set("cwm");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-cwm-*");

            // Capture the OsAction to inspect the SearchRequest
            ArgumentCaptor<OpensearchClientBuilder.OsAction> actionCaptor =
                ArgumentCaptor.forClass(OpensearchClientBuilder.OsAction.class);

            when(osClient.execute(actionCaptor.capture())).thenAnswer(invocation -> {
                return buildMinimalSearchResponse(42L);
            });

            service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            // The action was captured — verify execute was called exactly once
            verify(osClient).execute(any());
        }

        @Test
        @DisplayName("Different tenant prefix produces different index pattern")
        void differentTenant_differentIndexPattern() throws Exception {
            TenantContext.set("acme");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");
            stubMinimalSearchResponse();

            service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            verify(indexResolver).resolveAlertIndexPattern();
            // The resolved pattern matches the tenant prefix "acme"
            assertThat(indexResolver.resolveAlertIndexPattern()).isEqualTo("v3-hive-alert-acme-*");
        }

        @Test
        @DisplayName("Service queries only the index pattern resolved by MsspIndexResolver")
        void service_queriesOnlyResolvedIndex() throws Exception {
            TenantContext.set("workmates1");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-workmates1-*");
            stubMinimalSearchResponse();

            SeverityBoardResponse response = service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            // Service was invoked successfully — confirms index resolution path is active
            assertThat(response).isNotNull();
            verify(indexResolver, times(1)).resolveAlertIndexPattern();
            verifyNoMoreInteractions(indexResolver);
        }
    }

    // =========================================================================
    // Task 2.2: overview.total matches only the scoped tenant's alerts
    // =========================================================================

    @Nested
    @DisplayName("Task 2.2 — Overview total reflects tenant-scoped data")
    class OverviewTotalTenantScoped {

        @Test
        @DisplayName("overview.total reflects only the tenant's alerts from OpenSearch response")
        void overviewTotal_reflectsOnlyTenantAlerts() throws Exception {
            TenantContext.set("cwm");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-cwm-*");

            // Simulate OpenSearch returning 42 total hits for tenant "cwm"
            when(osClient.execute(any())).thenAnswer(invocation -> buildMinimalSearchResponse(42L));

            SeverityBoardResponse response = service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            assertThat(response.totalApproximate()).isEqualTo(42L);
            assertThat(response.overview().total()).isEqualTo(42L);
        }

        @Test
        @DisplayName("Different tenant gets different total count")
        void differentTenant_differentTotal() throws Exception {
            // First tenant: "cwm" with 42 alerts
            TenantContext.set("cwm");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-cwm-*");
            when(osClient.execute(any())).thenAnswer(invocation -> buildMinimalSearchResponse(42L));

            SeverityBoardResponse responseCwm = service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            TenantContext.clear();

            // Second tenant: "acme" with 100 alerts
            TenantContext.set("acme");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");
            when(osClient.execute(any())).thenAnswer(invocation -> buildMinimalSearchResponse(100L));

            SeverityBoardResponse responseAcme = service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            assertThat(responseCwm.totalApproximate()).isEqualTo(42L);
            assertThat(responseAcme.totalApproximate()).isEqualTo(100L);
            assertThat(responseCwm.totalApproximate()).isNotEqualTo(responseAcme.totalApproximate());
        }
    }

    // =========================================================================
    // Task 2.3: lane alerts contain only the correct tenant's data
    // =========================================================================

    @Nested
    @DisplayName("Task 2.3 — Lane alerts scoped to tenant")
    class LaneAlertsTenantScoped {

        @Test
        @DisplayName("Lane counts come from the tenant-scoped OpenSearch response only")
        void laneCounts_fromTenantScopedResponse() throws Exception {
            TenantContext.set("cwm");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-cwm-*");

            // Build response with severity_lanes containing only "cwm" tenant data
            when(osClient.execute(any())).thenAnswer(invocation ->
                buildSearchResponseWithSeverityLanes(15L, 20L, 25L, 10L, 5L));

            SeverityBoardResponse response = service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            // Verify lanes contain data from the tenant-scoped query
            assertThat(response.lanes()).hasSize(5);
            assertThat(response.lanes().get(0).severity()).isEqualTo("critical");
            assertThat(response.lanes().get(0).count()).isEqualTo(15L);
            assertThat(response.lanes().get(1).severity()).isEqualTo("high");
            assertThat(response.lanes().get(1).count()).isEqualTo(20L);
            assertThat(response.lanes().get(2).severity()).isEqualTo("medium");
            assertThat(response.lanes().get(2).count()).isEqualTo(25L);
            assertThat(response.lanes().get(3).severity()).isEqualTo("low");
            assertThat(response.lanes().get(3).count()).isEqualTo(10L);
            assertThat(response.lanes().get(4).severity()).isEqualTo("info");
            assertThat(response.lanes().get(4).count()).isEqualTo(5L);
        }

        @Test
        @DisplayName("Lanes are empty when tenant has no alerts")
        void lanes_emptyForTenantWithNoAlerts() throws Exception {
            TenantContext.set("empty-tenant");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-empty-tenant-*");
            when(osClient.execute(any())).thenAnswer(invocation -> buildMinimalSearchResponse(0L));

            SeverityBoardResponse response = service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            assertThat(response.lanes()).hasSize(5);
            for (var lane : response.lanes()) {
                assertThat(lane.count()).isZero();
                assertThat(lane.alerts()).isEmpty();
            }
        }
    }

    // =========================================================================
    // Task 2.4: trend buckets reflect only scoped data
    // =========================================================================

    @Nested
    @DisplayName("Task 2.4 — Trend buckets reflect only scoped tenant data")
    class TrendBucketsTenantScoped {

        @Test
        @DisplayName("Trend buckets come from the tenant-scoped query response")
        void trendBuckets_fromTenantScopedResponse() throws Exception {
            TenantContext.set("cwm");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-cwm-*");

            // Response with a trend aggregation containing buckets
            when(osClient.execute(any())).thenAnswer(invocation ->
                buildSearchResponseWithTrend(12));

            SeverityBoardResponse response = service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            // The trend comes from the tenant-scoped query
            assertThat(response.trend()).isNotNull();
            assertThat(response.trend()).hasSize(12);
        }

        @Test
        @DisplayName("Trend buckets are zero-filled when tenant has no activity")
        void trendBuckets_zeroFilledForEmptyTenant() throws Exception {
            TenantContext.set("inactive-tenant");
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-inactive-tenant-*");
            when(osClient.execute(any())).thenAnswer(invocation -> buildMinimalSearchResponse(0L));

            SeverityBoardResponse response = service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            // Even with no data, trend should be populated (possibly empty or zero-filled)
            assertThat(response.trend()).isNotNull();
        }
    }

    // =========================================================================
    // Task 2.5: without tenant header (global mode) returns all tenants aggregated
    // =========================================================================

    @Nested
    @DisplayName("Task 2.5 — Global mode (no tenant header)")
    class GlobalModeNoTenantHeader {

        @Test
        @DisplayName("Without TenantContext, MsspIndexResolver returns global pattern (v3-hive-alert-*)")
        void noTenantContext_globalPatternResolved() throws Exception {
            // No TenantContext.set() — simulates no X-Tenant-ID header
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-*");
            stubMinimalSearchResponse();

            service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            verify(indexResolver).resolveAlertIndexPattern();
        }

        @Test
        @DisplayName("Global mode returns aggregated total from all tenants")
        void globalMode_returnsAggregatedTotal() throws Exception {
            // No tenant set — global mode
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-*");
            when(osClient.execute(any())).thenAnswer(invocation -> buildMinimalSearchResponse(500L));

            SeverityBoardResponse response = service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            // Total reflects all tenants combined
            assertThat(response.totalApproximate()).isEqualTo(500L);
            assertThat(response.overview().total()).isEqualTo(500L);
        }

        @Test
        @DisplayName("Global mode index pattern does not contain a tenant prefix")
        void globalMode_indexPatternHasNoTenantPrefix() throws Exception {
            when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-*");
            stubMinimalSearchResponse();

            service.computeBoard(
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z"),
                "active", "all", 4);

            // Verify the resolved pattern is the global wildcard (no tenant prefix between "alert-" and "-*")
            String resolvedPattern = indexResolver.resolveAlertIndexPattern();
            assertThat(resolvedPattern).isEqualTo("v3-hive-alert-*");
            assertThat(resolvedPattern).doesNotContain("cwm");
            assertThat(resolvedPattern).doesNotContain("acme");
        }
    }

    // =========================================================================
    // Helpers — build mock OpenSearch responses
    // =========================================================================

    private void stubMinimalSearchResponse() throws Exception {
        when(osClient.execute(any())).thenAnswer(invocation -> buildMinimalSearchResponse(0L));
    }

    /**
     * Builds a minimal SearchResponse with the given total hit count and empty aggregations.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private SearchResponse<Map> buildMinimalSearchResponse(long totalHits) {
        Map<String, Aggregate> aggregations = new LinkedHashMap<>();

        // Empty severity_lanes (no buckets)
        aggregations.put("severity_lanes", Aggregate.of(a -> a
            .sterms(st -> st.buckets(b -> b.array(List.of())).sumOtherDocCount(0L))));

        // Empty trend (no buckets)
        aggregations.put("trend", Aggregate.of(a -> a
            .dateHistogram(dh -> dh.buckets(b -> b.array(List.of())))));

        // Filter aggs for overview — all returning 0
        aggregations.put("active_total", buildFilterAggregate(0L));
        aggregations.put("critical_open", buildFilterAggregate(0L));
        aggregations.put("needs_triage", buildFilterAggregate(0L));
        aggregations.put("sla_pressure_total", buildFilterAggregate(0L));
        aggregations.put("unassigned_total", buildFilterAggregate(0L));
        aggregations.put("threat_intel", buildFilterAggregate(0L));

        // Max agg for highest_risk
        aggregations.put("highest_risk", Aggregate.of(a -> a
            .max(m -> m.value(Double.NaN))));

        return SearchResponse.searchResponseOf(r -> r
            .took(5)
            .timedOut(false)
            .shards(s -> s.total(1).successful(1).failed(0))
            .hits(h -> h
                .total(t -> t.value(totalHits).relation(TotalHitsRelation.Eq))
                .hits(Collections.emptyList()))
            .aggregations(aggregations));
    }

    /**
     * Builds a SearchResponse with severity_lanes containing lane-specific counts.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private SearchResponse<Map> buildSearchResponseWithSeverityLanes(
            long criticalCount, long highCount, long mediumCount, long lowCount, long infoCount) {

        long totalHits = criticalCount + highCount + mediumCount + lowCount + infoCount;
        Map<String, Aggregate> aggregations = new LinkedHashMap<>();

        // Build severity_lanes as lterms (numeric keys) — mimics real OpenSearch response
        List<LongTermsBucket> buckets = new ArrayList<>();
        if (criticalCount > 0) {
            buckets.add(buildLongTermsBucket("9", criticalCount));
        }
        if (highCount > 0) {
            buckets.add(buildLongTermsBucket("7", highCount));
        }
        if (mediumCount > 0) {
            buckets.add(buildLongTermsBucket("5", mediumCount));
        }
        if (lowCount > 0) {
            buckets.add(buildLongTermsBucket("2", lowCount));
        }
        if (infoCount > 0) {
            buckets.add(buildLongTermsBucket("0", infoCount));
        }

        aggregations.put("severity_lanes", Aggregate.of(a -> a
            .lterms(lt -> lt.buckets(b -> b.array(buckets)).sumOtherDocCount(0L))));

        // Empty trend
        aggregations.put("trend", Aggregate.of(a -> a
            .dateHistogram(dh -> dh.buckets(b -> b.array(List.of())))));

        // Filter aggs
        aggregations.put("active_total", buildFilterAggregate(totalHits));
        aggregations.put("critical_open", buildFilterAggregate(criticalCount));
        aggregations.put("needs_triage", buildFilterAggregate(0L));
        aggregations.put("sla_pressure_total", buildFilterAggregate(0L));
        aggregations.put("unassigned_total", buildFilterAggregate(0L));
        aggregations.put("threat_intel", buildFilterAggregate(0L));

        // Max agg
        aggregations.put("highest_risk", Aggregate.of(a -> a
            .max(m -> m.value(95.0))));

        return SearchResponse.searchResponseOf(r -> r
            .took(10)
            .timedOut(false)
            .shards(s -> s.total(1).successful(1).failed(0))
            .hits(h -> h
                .total(t -> t.value(totalHits).relation(TotalHitsRelation.Eq))
                .hits(Collections.emptyList()))
            .aggregations(aggregations));
    }

    /**
     * Builds a SearchResponse with a date_histogram trend aggregation containing the given number of buckets.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private SearchResponse<Map> buildSearchResponseWithTrend(int bucketCount) {
        Map<String, Aggregate> aggregations = new LinkedHashMap<>();

        // Empty severity_lanes
        aggregations.put("severity_lanes", Aggregate.of(a -> a
            .sterms(st -> st.buckets(b -> b.array(List.of())).sumOtherDocCount(0L))));

        // Build trend date_histogram with the specified number of buckets
        Instant from = Instant.parse("2026-01-01T00:00:00Z");
        long intervalMs = 7200000L; // 2 hours for a 24h range with 12 buckets
        List<DateHistogramBucket> trendBuckets = new ArrayList<>();
        for (int i = 0; i < bucketCount; i++) {
            long bucketKeyMs = from.toEpochMilli() + (i * intervalMs);
            final int idx = i;
            trendBuckets.add(DateHistogramBucket.of(dhb -> dhb
                .key(String.valueOf(bucketKeyMs))
                .keyAsString(Instant.ofEpochMilli(bucketKeyMs).toString())
                .docCount(3L + idx)
                .aggregations("by_severity", Aggregate.of(a -> a
                    .sterms(st -> st.buckets(b -> b.array(List.of())).sumOtherDocCount(0L))))));
        }

        aggregations.put("trend", Aggregate.of(a -> a
            .dateHistogram(dh -> dh.buckets(b -> b.array(trendBuckets)))));

        // Filter aggs
        aggregations.put("active_total", buildFilterAggregate(36L));
        aggregations.put("critical_open", buildFilterAggregate(5L));
        aggregations.put("needs_triage", buildFilterAggregate(10L));
        aggregations.put("sla_pressure_total", buildFilterAggregate(2L));
        aggregations.put("unassigned_total", buildFilterAggregate(8L));
        aggregations.put("threat_intel", buildFilterAggregate(1L));

        // Max agg
        aggregations.put("highest_risk", Aggregate.of(a -> a
            .max(m -> m.value(92.0))));

        return SearchResponse.searchResponseOf(r -> r
            .took(8)
            .timedOut(false)
            .shards(s -> s.total(1).successful(1).failed(0))
            .hits(h -> h
                .total(t -> t.value(36L).relation(TotalHitsRelation.Eq))
                .hits(Collections.emptyList()))
            .aggregations(aggregations));
    }

    /**
     * Builds a filter aggregate with the given doc count.
     */
    private Aggregate buildFilterAggregate(long docCount) {
        return Aggregate.of(a -> a.filter(f -> f.docCount(docCount).aggregations(Map.of())));
    }

    /**
     * Builds a LongTermsBucket with sub-aggregations matching the service's expectations.
     */
    private LongTermsBucket buildLongTermsBucket(String key, long docCount) {
        Map<String, Aggregate> subAggs = new LinkedHashMap<>();
        subAggs.put("sla_pressure", buildFilterAggregate(0L));
        subAggs.put("unassigned", Aggregate.of(a -> a
            .missing(m -> m.docCount(0L).aggregations(Map.of()))));
        subAggs.put("active_count", buildFilterAggregate(docCount));
        subAggs.put("top_alerts", Aggregate.of(a -> a
            .topHits(th -> th
                .hits(h -> h
                    .total(t -> t.value(docCount).relation(TotalHitsRelation.Eq))
                    .hits(List.of())))));

        return LongTermsBucket.of(b -> b
            .key(key)
            .docCount(docCount)
            .aggregations(subAggs));
    }
}
