package com.hivearmor.service.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.dto.AffectedTechnique;
import com.hivearmor.service.hunt.dto.ConditionTuple;
import com.hivearmor.service.hunt.dto.ExceptionOverlap;
import com.hivearmor.service.hunt.dto.ExceptionPreviewResponse;
import jakarta.json.spi.JsonProvider;
import jakarta.json.stream.JsonParser;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link HaSuppressionAnalysisService#analyzeExceptionImpact(String, List)}.
 *
 * <p>Task 4.14 — Verifies exception overlap detection identifies partial matches.
 * <p>Task 4.15 — Verifies affected MITRE techniques are extracted from matching alerts.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2.2).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@Tag("Feature: sprint-37-alert-advanced-contracts")
@DisplayName("HaSuppressionAnalysisService — Exception Impact Analysis")
class HaSuppressionAnalysisServiceExceptionTest {

    @Mock
    private OpensearchClientBuilder osClient;

    @Mock
    private MsspIndexResolver indexResolver;

    private HaSuppressionAnalysisService service;

    @BeforeEach
    void setUp() {
        service = new HaSuppressionAnalysisService(osClient, indexResolver);
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-*");

        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken("analyst", "password"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Task 4.14 — Exception overlap detection identifies partial matches
    // =========================================================================

    @Nested
    @DisplayName("Task 4.14 — Exception overlap detection with existing exceptions")
    class ExceptionOverlapDetection {

        @Test
        @DisplayName("Partial overlap with two existing exceptions is detected with correct percentages")
        void partialOverlap_identifiesMatchingExceptions() throws Exception {
            // 50 alerts match the proposed condition; 15 also match exception "exc-001",
            // 10 also match exception "exc-002"
            String json = buildExceptionResponseJson(
                200L, 50L,
                // existing_exceptions: doc_count=25 (total that have exceptionId)
                25L,
                // exception_ids buckets: [exc-001: 15 docs, exc-002: 10 docs]
                List.of(
                    new ExcBucket("exc-001", 15L, "category is Credential Access"),
                    new ExcBucket("exc-002", 10L, "source.ip starts_with 10.0.")
                ),
                // no MITRE techniques needed for this test
                List.of(),
                // no true-positive overlap
                0L
            );

            when(osClient.execute(any())).thenReturn(deserializeSearchResponse(json));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("user.name", "is", "svc_account"));

            ExceptionPreviewResponse response = service.analyzeExceptionImpact("rule-100", conditions);

            // Verify overlap entries exist
            assertThat(response.exceptionOverlapWithExisting()).isNotEmpty();
            assertThat(response.exceptionOverlapWithExisting()).hasSize(2);

            // Verify first overlap entry
            ExceptionOverlap overlap1 = response.exceptionOverlapWithExisting().get(0);
            assertThat(overlap1.exceptionId()).isEqualTo("exc-001");
            assertThat(stripJsonQuotes(overlap1.condition())).isEqualTo("category is Credential Access");
            assertThat(overlap1.overlapPercentage()).isGreaterThan(0.0);
            // 15 / 50 * 100 = 30%
            assertThat(overlap1.overlapPercentage()).isEqualTo(30.0);

            // Verify second overlap entry
            ExceptionOverlap overlap2 = response.exceptionOverlapWithExisting().get(1);
            assertThat(overlap2.exceptionId()).isEqualTo("exc-002");
            assertThat(stripJsonQuotes(overlap2.condition())).isEqualTo("source.ip starts_with 10.0.");
            assertThat(overlap2.overlapPercentage()).isGreaterThan(0.0);
            // 10 / 50 * 100 = 20%
            assertThat(overlap2.overlapPercentage()).isEqualTo(20.0);
        }

        @Test
        @DisplayName("No existing exceptions produces empty overlap list")
        void noExistingExceptions_emptyOverlapList() throws Exception {
            String json = buildExceptionResponseJson(
                100L, 30L,
                0L,      // no docs with exceptionId
                List.of(), // no exception_ids buckets
                List.of(),
                0L
            );

            when(osClient.execute(any())).thenReturn(deserializeSearchResponse(json));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("category", "is", "Reconnaissance"));

            ExceptionPreviewResponse response = service.analyzeExceptionImpact("rule-200", conditions);

            assertThat(response.exceptionOverlapWithExisting()).isEmpty();
        }
    }

    // =========================================================================
    // Task 4.15 — Affected MITRE techniques extracted from matching alerts
    // =========================================================================

    @Nested
    @DisplayName("Task 4.15 — Affected MITRE techniques extraction")
    class AffectedMitreTechniques {

        @Test
        @DisplayName("Two MITRE techniques extracted with id, name, and tactic")
        void multipleTechniques_extractedCorrectly() throws Exception {
            String json = buildExceptionResponseJson(
                150L, 40L,
                0L,
                List.of(),
                // MITRE techniques
                List.of(
                    new MitreBucket("T1078", 25L, "T1078", "Valid Accounts", "Initial Access"),
                    new MitreBucket("T1110", 15L, "T1110", "Brute Force", "Credential Access")
                ),
                0L
            );

            when(osClient.execute(any())).thenReturn(deserializeSearchResponse(json));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("user.name", "is", "admin"));

            ExceptionPreviewResponse response = service.analyzeExceptionImpact("rule-300", conditions);

            assertThat(response.affectedTechniques()).isNotEmpty();
            assertThat(response.affectedTechniques()).hasSize(2);

            AffectedTechnique tech1 = response.affectedTechniques().get(0);
            assertThat(tech1.id()).isEqualTo("T1078");
            assertThat(stripJsonQuotes(tech1.name())).isEqualTo("Valid Accounts");
            assertThat(stripJsonQuotes(tech1.tactic())).isEqualTo("Initial Access");

            AffectedTechnique tech2 = response.affectedTechniques().get(1);
            assertThat(tech2.id()).isEqualTo("T1110");
            assertThat(stripJsonQuotes(tech2.name())).isEqualTo("Brute Force");
            assertThat(stripJsonQuotes(tech2.tactic())).isEqualTo("Credential Access");
        }

        @Test
        @DisplayName("No matching MITRE techniques produces empty list")
        void noTechniques_emptyList() throws Exception {
            String json = buildExceptionResponseJson(
                100L, 20L,
                0L,
                List.of(),
                List.of(), // no MITRE technique buckets
                0L
            );

            when(osClient.execute(any())).thenReturn(deserializeSearchResponse(json));

            List<ConditionTuple> conditions = List.of(
                new ConditionTuple("status", "is", "new"));

            ExceptionPreviewResponse response = service.analyzeExceptionImpact("rule-400", conditions);

            assertThat(response.affectedTechniques()).isEmpty();
        }
    }

    // =========================================================================
    // Helpers — JSON-based mock response construction
    // =========================================================================

    /** Helper record for exception_ids bucket data. */
    private record ExcBucket(String id, long docCount, String condition) {}

    /** Helper record for mitre_techniques bucket data. */
    private record MitreBucket(String key, long docCount, String techniqueId, String techniqueName, String tacticName) {}

    /**
     * Builds a JSON string representing the OpenSearch response for exception impact analysis.
     *
     * <p>Uses typed_keys format (type#name) required by the OpenSearch Java client deserializer.
     * The response structure mirrors what {@code analyzeExceptionImpact} expects:
     * <ul>
     *   <li>hits.total = totalAlerts</li>
     *   <li>"matching" filter agg with docCount = matchingAlerts</li>
     *   <li>Inside "matching": existing_exceptions filter, mitre_techniques sterms, true_positive_overlap filter</li>
     * </ul>
     */
    private String buildExceptionResponseJson(long totalAlerts, long matchingAlerts,
                                              long existingExcDocCount,
                                              List<ExcBucket> excBuckets,
                                              List<MitreBucket> mitreBuckets,
                                              long truePositiveCount) {
        // Build exception_ids buckets JSON
        StringBuilder excBucketsJson = new StringBuilder("[");
        for (int i = 0; i < excBuckets.size(); i++) {
            ExcBucket b = excBuckets.get(i);
            if (i > 0) excBucketsJson.append(",");
            excBucketsJson.append("{\"key\":\"").append(b.id()).append("\",\"doc_count\":").append(b.docCount());
            excBucketsJson.append(",\"top_hits#exception_condition\":{\"hits\":{\"total\":{\"value\":1,\"relation\":\"eq\"},\"hits\":[");
            excBucketsJson.append("{\"_index\":\"v3-hive-alert-2026.01.15\",\"_id\":\"hit-1\",\"_score\":1.0,");
            excBucketsJson.append("\"_source\":{\"exceptionId\":\"").append(b.id()).append("\",\"exceptionCondition\":\"");
            excBucketsJson.append(escapeJson(b.condition())).append("\"}}]}}}");
        }
        excBucketsJson.append("]");

        // Build mitre_techniques buckets JSON
        StringBuilder mitreBucketsJson = new StringBuilder("[");
        for (int i = 0; i < mitreBuckets.size(); i++) {
            MitreBucket b = mitreBuckets.get(i);
            if (i > 0) mitreBucketsJson.append(",");
            mitreBucketsJson.append("{\"key\":\"").append(b.key()).append("\",\"doc_count\":").append(b.docCount());
            mitreBucketsJson.append(",\"top_hits#technique_details\":{\"hits\":{\"total\":{\"value\":1,\"relation\":\"eq\"},\"hits\":[");
            mitreBucketsJson.append("{\"_index\":\"v3-hive-alert-2026.01.15\",\"_id\":\"hit-t\",\"_score\":1.0,");
            mitreBucketsJson.append("\"_source\":{\"mitreTechniqueId\":\"").append(b.techniqueId());
            mitreBucketsJson.append("\",\"mitreTechniqueName\":\"").append(b.techniqueName());
            mitreBucketsJson.append("\",\"mitreTacticName\":\"").append(b.tacticName()).append("\"}}]}}}");
        }
        mitreBucketsJson.append("]");

        return "{"
            + "\"took\":8,\"timed_out\":false,"
            + "\"_shards\":{\"total\":1,\"successful\":1,\"skipped\":0,\"failed\":0},"
            + "\"hits\":{\"total\":{\"value\":" + totalAlerts + ",\"relation\":\"eq\"},\"hits\":[]},"
            + "\"aggregations\":{"
            + "\"filter#matching\":{\"doc_count\":" + matchingAlerts + ","
            // existing_exceptions — filter agg containing terms agg
            + "\"filter#existing_exceptions\":{\"doc_count\":" + existingExcDocCount + ","
            + "\"sterms#exception_ids\":{\"buckets\":" + excBucketsJson + ",\"sum_other_doc_count\":0,\"doc_count_error_upper_bound\":0}"
            + "},"
            // mitre_techniques — terms agg
            + "\"sterms#mitre_techniques\":{\"buckets\":" + mitreBucketsJson + ",\"sum_other_doc_count\":0,\"doc_count_error_upper_bound\":0},"
            // true_positive_overlap — filter agg
            + "\"filter#true_positive_overlap\":{\"doc_count\":" + truePositiveCount + "}"
            + "}"
            + "}"
            + "}";
    }

    /** Escapes double-quotes in a string for JSON embedding. */
    private String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /**
     * Strips surrounding JSON quotes from a string value if present.
     *
     * <p>When {@code JsonData.to(Map.class)} deserializes source documents in top_hits
     * aggregations, string values may retain their JSON quote delimiters (e.g. Jackson's
     * TextNode.toString() returns {@code "value"} with literal quotes). This utility
     * normalizes such values for assertion comparisons.
     */
    private String stripJsonQuotes(String value) {
        if (value != null && value.length() >= 2
            && value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }

    /**
     * Deserializes a JSON string into a SearchResponse using the OpenSearch Java client's
     * built-in deserializer with JacksonJsonpMapper, producing properly typed aggregations.
     */
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
}
