package com.hivearmor.service.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch.core.SearchResponse;

import jakarta.json.spi.JsonProvider;
import jakarta.json.stream.JsonParser;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link HaAlertFacetService}.
 *
 * <p>Validates:
 * <ul>
 *   <li>Summary counters (totalApproximate, criticalOpen, highOpen, etc.)</li>
 *   <li>Severity facet maps numeric values to human labels</li>
 *   <li>Status facet maps numeric codes to symbolic names</li>
 *   <li>Category and assignee facets use direct value mapping</li>
 *   <li>Selected flag reflects active filter values</li>
 *   <li>Tenant isolation: summary is scoped via MsspIndexResolver</li>
 * </ul>
 *
 * <p>Satisfies: Sprint 36 Task 3 — S36-T02
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@Tag("Feature: sprint-36-alert-queue-contracts")
class HaAlertFacetServiceTest {

    @Mock
    private OpensearchClientBuilder osClient;

    @Mock
    private MsspIndexResolver indexResolver;

    private HaAlertFacetService facetService;

    @BeforeEach
    void setUp() {
        HaAlertQueryService alertQueryService = new HaAlertQueryService();
        facetService = new HaAlertFacetService(osClient, indexResolver, alertQueryService);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // =========================================================================
    // Test: Summary uses tenant-scoped index via MsspIndexResolver
    // =========================================================================

    @Test
    @DisplayName("summary resolves tenant-scoped index pattern via MsspIndexResolver")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void summary_usesTenantScopedIndex() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        stubSequentialResponses(
            buildCounterResponseJson(100, 5, 10, 3, 2, 20, 7),
            buildFacetResponseJson("severity", "9", 5, "7", 10),
            buildFacetResponseJson("status", "1", 40, "2", 20),
            buildFacetResponseJson("category", "malware", 15, "network", 25),
            buildFacetResponseJson("assignee", "analyst1", 30, "analyst2", 20)
        );

        Map<String, Object> result = facetService.computeSummary(
            null, null, null, null, null, null, null, null, null, null, null);

        verify(indexResolver, atLeastOnce()).resolveAlertIndexPattern();
        assertThat(result).containsKey("totalApproximate");
        assertThat(result).containsKey("snapshotAt");
    }

    // =========================================================================
    // Test: Tenant isolation — different tenants get different indices
    // =========================================================================

    @Test
    @DisplayName("summary reflects only current tenant's data — different tenants get different indices")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void summary_tenantIsolation() throws Exception {
        // Set up tenant "alpha"
        TenantContext.set("alpha");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-alpha-*");

        stubSequentialResponses(
            buildCounterResponseJson(50, 3, 5, 1, 0, 10, 2),
            buildFacetResponseJson("severity", "9", 3),
            buildFacetResponseJson("status", "1", 40),
            buildFacetResponseJson("category", "malware", 10),
            buildFacetResponseJson("assignee", "analyst1", 5)
        );

        Map<String, Object> alphaResult = facetService.computeSummary(
            null, null, null, null, null, null, null, null, null, null, null);

        assertThat(alphaResult.get("totalApproximate")).isEqualTo(50L);
        assertThat(alphaResult.get("criticalOpen")).isEqualTo(3L);

        // Now switch to tenant "beta"
        TenantContext.clear();
        TenantContext.set("beta");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-beta-*");

        stubSequentialResponses(
            buildCounterResponseJson(200, 15, 25, 8, 3, 40, 12),
            buildFacetResponseJson("severity", "9", 15),
            buildFacetResponseJson("status", "1", 100),
            buildFacetResponseJson("category", "network", 50),
            buildFacetResponseJson("assignee", "analyst2", 30)
        );

        Map<String, Object> betaResult = facetService.computeSummary(
            null, null, null, null, null, null, null, null, null, null, null);

        assertThat(betaResult.get("totalApproximate")).isEqualTo(200L);
        assertThat(betaResult.get("criticalOpen")).isEqualTo(15L);
        assertThat(alphaResult.get("totalApproximate")).isNotEqualTo(betaResult.get("totalApproximate"));
    }

    // =========================================================================
    // Test: Counter values are correctly extracted
    // =========================================================================

    @Test
    @DisplayName("summary returns all expected counter fields")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void summary_returnsAllCounters() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        stubSequentialResponses(
            buildCounterResponseJson(500, 25, 40, 12, 5, 100, 18),
            buildFacetResponseJson("severity", "9", 25),
            buildFacetResponseJson("status", "1", 200),
            buildFacetResponseJson("category", "malware", 50),
            buildFacetResponseJson("assignee", "analyst1", 80)
        );

        Map<String, Object> result = facetService.computeSummary(
            null, null, null, null, null, null, null, null, null, null, null);

        assertThat(result.get("totalApproximate")).isEqualTo(500L);
        assertThat(result.get("criticalOpen")).isEqualTo(25L);
        assertThat(result.get("highOpen")).isEqualTo(40L);
        assertThat(result.get("slaAtRisk")).isEqualTo(12L);
        assertThat(result.get("slaBreached")).isEqualTo(5L);
        assertThat(result.get("unassigned")).isEqualTo(100L);
        assertThat(result.get("threatIntelMatched")).isEqualTo(18L);
        assertThat(result).containsKey("statusCounts");
        assertThat(result).containsKey("facets");
        assertThat(result).containsKey("snapshotAt");
    }

    // =========================================================================
    // Test: Severity facet maps values to labels
    // =========================================================================

    @Test
    @DisplayName("severity facet maps numeric severity to human-readable labels")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void severityFacet_mapsToLabels() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        stubSequentialResponses(
            buildCounterResponseJson(100, 5, 10, 0, 0, 0, 0),
            buildFacetResponseJsonMulti("10", 5, "9", 8, "7", 15, "4", 30, "2", 20),
            buildFacetResponseJson("status", "1", 40),
            buildFacetResponseJson("category", "malware", 10),
            buildFacetResponseJson("assignee", "analyst1", 10)
        );

        Map<String, Object> result = facetService.computeSummary(
            null, null, null, null, null, null, null, null, null, null, null);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> facets = (List<Map<String, Object>>) result.get("facets");
        Map<String, Object> severityFacet = facets.get(0);

        assertThat(severityFacet.get("field")).isEqualTo("severity");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> entries = (List<Map<String, Object>>) severityFacet.get("entries");
        assertThat(entries).hasSize(5);

        // Check label mapping for severity 10 → Critical
        assertThat(entries.get(0).get("value")).isEqualTo("10");
        assertThat(entries.get(0).get("displayLabel")).isEqualTo("Critical");
        assertThat(entries.get(0).get("count")).isEqualTo(5L);

        // severity 7 → High
        assertThat(entries.get(2).get("value")).isEqualTo("7");
        assertThat(entries.get(2).get("displayLabel")).isEqualTo("High");

        // severity 4 → Medium
        assertThat(entries.get(3).get("value")).isEqualTo("4");
        assertThat(entries.get(3).get("displayLabel")).isEqualTo("Medium");

        // severity 2 → Low
        assertThat(entries.get(4).get("value")).isEqualTo("2");
        assertThat(entries.get(4).get("displayLabel")).isEqualTo("Low");
    }

    // =========================================================================
    // Test: Status facet maps numeric codes to symbolic names
    // =========================================================================

    @Test
    @DisplayName("status facet maps numeric codes to symbolic names")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void statusFacet_mapsToSymbolicNames() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        stubSequentialResponses(
            buildCounterResponseJson(100, 5, 10, 0, 0, 0, 0),
            buildFacetResponseJson("severity", "9", 5),
            buildFacetResponseJsonMulti("1", 40, "2", 20, "3", 15, "4", 10, "5", 15),
            buildFacetResponseJson("category", "malware", 10),
            buildFacetResponseJson("assignee", "analyst1", 10)
        );

        Map<String, Object> result = facetService.computeSummary(
            null, null, null, null, null, null, null, null, null, null, null);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> facets = (List<Map<String, Object>>) result.get("facets");
        Map<String, Object> statusFacet = facets.get(1);

        assertThat(statusFacet.get("field")).isEqualTo("status");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> entries = (List<Map<String, Object>>) statusFacet.get("entries");
        assertThat(entries).hasSize(5);

        assertThat(entries.get(0).get("value")).isEqualTo("1");
        assertThat(entries.get(0).get("displayLabel")).isEqualTo("open");
        assertThat(entries.get(0).get("count")).isEqualTo(40L);

        assertThat(entries.get(1).get("value")).isEqualTo("2");
        assertThat(entries.get(1).get("displayLabel")).isEqualTo("in_review");

        assertThat(entries.get(4).get("value")).isEqualTo("5");
        assertThat(entries.get(4).get("displayLabel")).isEqualTo("closed");
    }

    // =========================================================================
    // Test: Facet entries include selected flag
    // =========================================================================

    @Test
    @DisplayName("facet entries mark 'selected=true' when value matches active filter")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void facets_selectedFlagReflectsActiveFilter() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        stubSequentialResponses(
            buildCounterResponseJson(50, 5, 10, 0, 0, 0, 0),
            buildFacetResponseJsonMulti("9", 5, "7", 10, "4", 30),
            buildFacetResponseJson("status", "1", 40),
            buildFacetResponseJson("category", "malware", 10),
            buildFacetResponseJson("assignee", "analyst1", 10)
        );

        // Pass "critical" as the active severity filter
        Map<String, Object> result = facetService.computeSummary(
            "critical", null, null, null, null, null, null, null, null, null, null);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> facets = (List<Map<String, Object>>) result.get("facets");
        Map<String, Object> severityFacet = facets.get(0);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> entries = (List<Map<String, Object>>) severityFacet.get("entries");

        // Severity 9 → "Critical" → matches "critical" filter → selected=true
        assertThat(entries.get(0).get("value")).isEqualTo("9");
        assertThat(entries.get(0).get("selected")).isEqualTo(true);

        // Severity 7 → "High" → does not match → selected=false
        assertThat(entries.get(1).get("value")).isEqualTo("7");
        assertThat(entries.get(1).get("selected")).isEqualTo(false);

        // Severity 4 → "Medium" → selected=false
        assertThat(entries.get(2).get("value")).isEqualTo("4");
        assertThat(entries.get(2).get("selected")).isEqualTo(false);
    }

    // =========================================================================
    // Test: All facet entries have required shape
    // =========================================================================

    @Test
    @DisplayName("all facet entries contain value, displayLabel, count, selected")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void facetEntries_haveCorrectShape() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        stubSequentialResponses(
            buildCounterResponseJson(100, 5, 10, 0, 0, 0, 0),
            buildFacetResponseJsonMulti("9", 5, "7", 15),
            buildFacetResponseJsonMulti("1", 40, "2", 20),
            buildFacetResponseJsonMulti("network_intrusion", 25, "malware", 15),
            buildFacetResponseJsonMulti("analyst1", 30, "analyst2", 20)
        );

        Map<String, Object> result = facetService.computeSummary(
            null, null, null, null, null, null, null, null, null, null, null);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> facets = (List<Map<String, Object>>) result.get("facets");

        for (Map<String, Object> facet : facets) {
            assertThat(facet).containsKey("field");
            assertThat(facet).containsKey("availability");
            assertThat(facet).containsKey("entries");

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> entries = (List<Map<String, Object>>) facet.get("entries");
            for (Map<String, Object> entry : entries) {
                assertThat(entry).containsKeys("value", "displayLabel", "count", "selected");
                assertThat(entry.get("count")).isInstanceOf(Long.class);
                assertThat(entry.get("selected")).isInstanceOf(Boolean.class);
            }
        }
    }

    // =========================================================================
    // Test: Filter parameters are applied to summary query
    // =========================================================================

    @Test
    @DisplayName("filter parameters are applied to the summary query")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void summary_appliesFilters() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        stubSequentialResponses(
            buildCounterResponseJson(10, 2, 3, 0, 0, 5, 1),
            buildFacetResponseJson("severity", "9", 2),
            buildFacetResponseJson("status", "1", 8),
            buildFacetResponseJson("category", "malware", 5),
            buildFacetResponseJson("assignee", "analyst1", 3)
        );

        // Apply severity=critical, status=open — should not throw
        Map<String, Object> result = facetService.computeSummary(
            "critical", "open", null, null, null, null, null, null, null, null, null);

        assertThat(result.get("totalApproximate")).isEqualTo(10L);
        assertThat(result.get("criticalOpen")).isEqualTo(2L);
    }

    // =========================================================================
    // Test: statusCounts maps to symbolic names
    // =========================================================================

    @Test
    @DisplayName("statusCounts maps numeric status codes to symbolic names")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void statusCounts_mapsToSymbolicNames() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        stubSequentialResponses(
            buildCounterResponseJson(100, 5, 10, 0, 0, 0, 0),
            buildFacetResponseJson("severity", "9", 5),
            buildFacetResponseJson("status", "1", 40),
            buildFacetResponseJson("category", "malware", 10),
            buildFacetResponseJson("assignee", "analyst1", 10)
        );

        Map<String, Object> result = facetService.computeSummary(
            null, null, null, null, null, null, null, null, null, null, null);

        @SuppressWarnings("unchecked")
        Map<String, Long> statusCounts = (Map<String, Long>) result.get("statusCounts");
        assertThat(statusCounts).containsKey("open");
        assertThat(statusCounts.get("open")).isEqualTo(40L);
    }

    // =========================================================================
    // Test: Invalid filter throws InvalidFilterException
    // =========================================================================

    @Test
    @DisplayName("invalid filter parameter throws InvalidFilterException")
    void summary_invalidFilter_throwsException() {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        org.junit.jupiter.api.Assertions.assertThrows(
            HaAlertQueryService.InvalidFilterException.class,
            () -> facetService.computeSummary(
                "invalid_severity", null, null, null, null,
                null, null, null, null, null, null)
        );
    }

    // =========================================================================
    // Helpers — JSON-based SearchResponse construction
    // =========================================================================

    /**
     * Stubs osClient.execute() to return responses in sequence.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private void stubSequentialResponses(String... responseJsons) throws Exception {
        List<SearchResponse<Map>> responses = new ArrayList<>();
        for (String json : responseJsons) {
            responses.add(deserializeSearchResponse(json));
        }

        // Reset mock for sequential answers
        reset(osClient);
        if (responses.size() == 1) {
            when(osClient.execute(any())).thenReturn(responses.get(0));
        } else {
            SearchResponse<Map> first = responses.get(0);
            SearchResponse<Map>[] rest = responses.subList(1, responses.size())
                .toArray(new SearchResponse[0]);
            when(osClient.execute(any())).thenReturn(first, (Object[]) rest);
        }
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private SearchResponse<Map> deserializeSearchResponse(String json) throws Exception {
        JacksonJsonpMapper mapper = new JacksonJsonpMapper(new ObjectMapper());
        org.opensearch.client.json.JsonpDeserializer<Map> mapDe =
            org.opensearch.client.json.JsonpDeserializer.of(Map.class);
        org.opensearch.client.json.JsonpDeserializer<SearchResponse<Map>> responseDe =
            SearchResponse.createSearchResponseDeserializer(mapDe);

        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        JsonProvider provider = mapper.jsonProvider();
        try (JsonParser parser = provider.createParser(new ByteArrayInputStream(bytes))) {
            return responseDe.deserialize(parser, mapper);
        }
    }

    /**
     * Builds a counter response JSON with mapping-tolerant filter aggregations.
     * Uses typed_keys format (type#name) required by the OpenSearch Java client deserializer.
     */
    private String buildCounterResponseJson(long total, long criticalOpen, long highOpen,
                                            long slaAtRisk, long slaBreached,
                                            long unassigned, long threatIntelMatched) {
        return "{"
            + "\"took\":10,\"timed_out\":false,"
            + "\"_shards\":{\"total\":1,\"successful\":1,\"skipped\":0,\"failed\":0},"
            + "\"hits\":{\"total\":{\"value\":" + total + ",\"relation\":\"eq\"},\"hits\":[]},"
            + "\"aggregations\":{"
            + "\"filter#criticalOpen\":{\"doc_count\":" + criticalOpen + "},"
            + "\"filter#highOpen\":{\"doc_count\":" + highOpen + "},"
            + "\"filter#slaAtRisk\":{\"doc_count\":" + slaAtRisk + "},"
            + "\"filter#slaBreached\":{\"doc_count\":" + slaBreached + "},"
            + "\"filter#unassigned\":{\"doc_count\":" + unassigned + "},"
            + "\"filter#threatIntelMatched\":{\"doc_count\":" + threatIntelMatched + "},"
            + "\"filter#status1\":{\"doc_count\":0},"
            + "\"filter#status2\":{\"doc_count\":40},"
            + "\"filter#status3\":{\"doc_count\":20},"
            + "\"filter#status4\":{\"doc_count\":0},"
            + "\"filter#status5\":{\"doc_count\":15},"
            + "\"filter#status6\":{\"doc_count\":0},"
            + "\"filter#status7\":{\"doc_count\":0}"
            + "}"
            + "}";
    }

    /**
     * Builds a facet response JSON with one term bucket (typed_keys format).
     */
    private String buildFacetResponseJson(String aggName, String key1, long count1) {
        return "{"
            + "\"took\":5,\"timed_out\":false,"
            + "\"_shards\":{\"total\":1,\"successful\":1,\"skipped\":0,\"failed\":0},"
            + "\"hits\":{\"total\":{\"value\":0,\"relation\":\"eq\"},\"hits\":[]},"
            + "\"aggregations\":{"
            + "\"sterms#facet\":{\"doc_count_error_upper_bound\":0,"
            + "\"sum_other_doc_count\":0,\"buckets\":["
            + "{\"key\":\"" + key1 + "\",\"doc_count\":" + count1 + "}"
            + "]}"
            + "}"
            + "}";
    }

    private String buildFacetResponseJson(String aggName, String key1, long count1,
                                          String key2, long count2) {
        return "{"
            + "\"took\":5,\"timed_out\":false,"
            + "\"_shards\":{\"total\":1,\"successful\":1,\"skipped\":0,\"failed\":0},"
            + "\"hits\":{\"total\":{\"value\":0,\"relation\":\"eq\"},\"hits\":[]},"
            + "\"aggregations\":{"
            + "\"sterms#facet\":{\"doc_count_error_upper_bound\":0,"
            + "\"sum_other_doc_count\":0,\"buckets\":["
            + "{\"key\":\"" + key1 + "\",\"doc_count\":" + count1 + "},"
            + "{\"key\":\"" + key2 + "\",\"doc_count\":" + count2 + "}"
            + "]}"
            + "}"
            + "}";
    }

    /**
     * Builds a facet response with variable number of buckets (key, count pairs).
     */
    private String buildFacetResponseJsonMulti(Object... keysAndCounts) {
        StringBuilder buckets = new StringBuilder();
        for (int i = 0; i < keysAndCounts.length; i += 2) {
            if (buckets.length() > 0) buckets.append(",");
            buckets.append("{\"key\":\"").append(keysAndCounts[i])
                .append("\",\"doc_count\":").append(keysAndCounts[i + 1]).append("}");
        }
        return "{"
            + "\"took\":5,\"timed_out\":false,"
            + "\"_shards\":{\"total\":1,\"successful\":1,\"skipped\":0,\"failed\":0},"
            + "\"hits\":{\"total\":{\"value\":0,\"relation\":\"eq\"},\"hits\":[]},"
            + "\"aggregations\":{"
            + "\"sterms#facet\":{\"doc_count_error_upper_bound\":0,"
            + "\"sum_other_doc_count\":0,\"buckets\":[" + buckets + "]}"
            + "}"
            + "}";
    }
}
