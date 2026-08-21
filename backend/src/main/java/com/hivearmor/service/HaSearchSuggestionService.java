package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.web.rest.dto.SuggestedSearchDTO;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.aggregations.Aggregation;
import org.opensearch.client.opensearch._types.aggregations.StringTermsBucket;
import org.opensearch.client.opensearch._types.aggregations.TermsAggregation;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Sprint 26 — Suggestions service.
 *
 * <p>Returns a ranked list of suggested OpenSearch queries by aggregating
 * the top alert categories observed in the last {@value #LOOKBACK_HOURS} hours.
 * When the LLM is not configured, or when the OpenSearch aggregation fails for
 * any reason, the service falls back to a static three-entry list so that the
 * {@code /api/ha-search/suggestions} endpoint <em>never</em> returns HTTP 503.
 *
 * <h3>NeverFiveZeroThreeOnSuggestions</h3>
 * <p>Every exception thrown by {@code aggregateTopCategories} or
 * {@code MsspIndexResolver} is caught and replaced with
 * {@link #STATIC_FALLBACK}.
 *
 * <h3>NoGetFirstInvariant</h3>
 * <p>All list indexing uses {@code .get(0)} — the Java 21+ {@code .getFirst()}
 * API is banned because HiveArmor targets Java 17.
 */
@Service
public class HaSearchSuggestionService {

    private static final Logger log = LoggerFactory.getLogger(HaSearchSuggestionService.class);

    /** Number of hours to look back when aggregating alert categories. */
    private static final int LOOKBACK_HOURS = 24;

    /**
     * Static fallback list returned when the LLM is not configured or when the
     * OpenSearch aggregation fails.  Contains exactly three entries in the order
     * mandated by SuggestionsStaticFallbackList.
     */
    static final List<SuggestedSearchDTO> STATIC_FALLBACK = List.of(
        new SuggestedSearchDTO(
            "Failed logins in last hour",
            "{\"query\":{\"bool\":{\"must\":[{\"match\":{\"category\":\"authentication_failure\"}},"
                + "{\"range\":{\"@timestamp\":{\"gte\":\"now-1h\"}}}]}}}",
            "Recent authentication failures across all sources."
        ),
        new SuggestedSearchDTO(
            "Critical alerts today",
            "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"severity\":\"critical\"}},"
                + "{\"range\":{\"@timestamp\":{\"gte\":\"now/d\"}}}]}}}",
            "Critical-severity alerts triggered since midnight."
        ),
        new SuggestedSearchDTO(
            "Unusual outbound traffic",
            "{\"query\":{\"bool\":{\"must\":[{\"match\":{\"category\":\"network_anomaly\"}},"
                + "{\"range\":{\"@timestamp\":{\"gte\":\"now-24h\"}}}]}}}",
            "Network anomalies flagged over the last 24 hours."
        )
    );

    // -------------------------------------------------------------------------
    // Dependencies
    // -------------------------------------------------------------------------

    private final MsspIndexResolver msspIndexResolver;
    private final HaLlmService haLlmService;
    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;

    public HaSearchSuggestionService(MsspIndexResolver msspIndexResolver,
                                     HaLlmService haLlmService,
                                     OpensearchClientBuilder osClient,
                                     ObjectMapper objectMapper) {
        this.msspIndexResolver = msspIndexResolver;
        this.haLlmService      = haLlmService;
        this.osClient          = osClient;
        this.objectMapper      = objectMapper;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Returns up to {@code count} suggested searches for the given index pattern.
     *
     * <p>Results are cached in the {@code searchSuggestions} Caffeine cache
     * (15-minute TTL, see {@code HaSearchSuggestionCacheConfig}).
     *
     * <p>Strategy:
     * <ol>
     *   <li>If the LLM is not configured, return {@link #STATIC_FALLBACK} immediately.</li>
     *   <li>Resolve the alert index pattern via {@link MsspIndexResolver}.</li>
     *   <li>Issue a terms aggregation over {@code category.keyword} filtered to the
     *       last {@value #LOOKBACK_HOURS} hours.</li>
     *   <li>Map each bucket to a {@link SuggestedSearchDTO}.</li>
     *   <li>On any exception, log a warning with {@code indexPattern} and {@code count}
     *       and return {@link #STATIC_FALLBACK}.</li>
     * </ol>
     *
     * @param indexPattern the caller-supplied index pattern hint (used as a cache key)
     * @param count        the maximum number of suggestions to return (clamped at the
     *                     controller level before this method is invoked)
     * @return a non-null, possibly empty list of suggested searches
     */
    @Cacheable(
        value      = "searchSuggestions",
        cacheManager = "searchSuggestionsCacheManager",
        key        = "#indexPattern + '_' + #count"
    )
    public List<SuggestedSearchDTO> listSuggestions(String indexPattern, int count) {
        if (!haLlmService.isConfigured()) {
            return STATIC_FALLBACK.subList(0, Math.min(count, STATIC_FALLBACK.size()));
        }
        try {
            String resolvedPattern = msspIndexResolver.resolveIndexPattern("alert");
            return aggregateTopCategories(resolvedPattern, count);
        } catch (Exception e) {
            log.warn(
                "HaSearchSuggestionService: aggregation failed for indexPattern={} count={}, using static fallback",
                indexPattern, count, e);
            return STATIC_FALLBACK.subList(0, Math.min(count, STATIC_FALLBACK.size()));
        }
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Issues a terms aggregation over {@code category.keyword} restricted to the
     * last {@value #LOOKBACK_HOURS} hours and maps each bucket to a
     * {@link SuggestedSearchDTO}.
     *
     * <p>The DSL field in each DTO is a compact bool query that filters by that
     * category over the same 24-hour window.
     *
     * <p>Any exception propagates to the caller ({@link #listSuggestions}) which
     * will catch it and return {@link #STATIC_FALLBACK}.
     *
     * @param pattern the resolved OpenSearch index pattern to query
     * @param count   the terms aggregation bucket size
     * @return list of suggestions derived from live data; may be empty
     * @throws Exception on any OpenSearch or serialization error
     */
    private List<SuggestedSearchDTO> aggregateTopCategories(String pattern, int count)
            throws Exception {

        // Time filter: last LOOKBACK_HOURS hours.
        String gteValue = "now-" + LOOKBACK_HOURS + "h";
        Query timeFilter = Query.of(q -> q.range(RangeQuery.of(r -> r
                .field("@timestamp")
                .gte(JsonData.of(gteValue)))));

        // Terms aggregation over category.keyword with size=count.
        TermsAggregation categoryTerms = TermsAggregation.of(t -> t
                .field("category.keyword")
                .size(count));

        SearchRequest req = SearchRequest.of(s -> s
                .index(pattern)
                .size(0)
                .query(timeFilter)
                .aggregations("top_categories",
                        Aggregation.of(a -> a.terms(categoryTerms))));

        SearchResponse<Void> resp = osClient.execute(os -> os.search(req, Void.class));

        List<SuggestedSearchDTO> result = new ArrayList<>();
        Aggregate topCats = resp.aggregations().get("top_categories");
        if (topCats == null || !topCats.isSterms()) {
            return result;
        }

        for (StringTermsBucket bucket : topCats.sterms().buckets().array()) {
            String category = bucket.key();

            // Build a compact DSL string: bool query filtering by this category over 24h.
            String dsl = buildCategoryDsl(category, gteValue);
            String description = "Alerts in category \"" + category + "\" over the last "
                    + LOOKBACK_HOURS + " hours.";
            String label = toLabel(category);

            result.add(new SuggestedSearchDTO(label, dsl, description));
        }

        return result;
    }

    /**
     * Produces a compact OpenSearch DSL JSON string that matches documents in the
     * given {@code category} over the last 24 hours.
     *
     * @param category the category value to filter on
     * @param gteValue the OpenSearch date-math expression for the lower bound, e.g. {@code "now-24h"}
     * @return a compact JSON string representing the bool query
     */
    private String buildCategoryDsl(String category, String gteValue) {
        // Inline JSON construction — avoids the need to walk an ObjectMapper node graph
        // and keeps the output compact and deterministic.
        return "{\"query\":{\"bool\":{\"must\":["
                + "{\"term\":{\"category.keyword\":\"" + escapeJson(category) + "\"}},"
                + "{\"range\":{\"@timestamp\":{\"gte\":\"" + escapeJson(gteValue) + "\"}}}"
                + "]}}}";
    }

    /**
     * Converts a raw category value (e.g. {@code "authentication_failure"}) to a
     * human-readable chip label (e.g. {@code "Authentication failure"}).
     *
     * @param category the raw category string
     * @return a title-cased, underscore-free label
     */
    private static String toLabel(String category) {
        if (category == null || category.isBlank()) {
            return "Unknown category";
        }
        String spaced = category.replace('_', ' ');
        // Capitalize first letter.
        return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }

    /**
     * Escapes characters that must be escaped inside a JSON string literal.
     * Only covers the subset needed for category values and date-math expressions.
     *
     * @param value the raw string
     * @return a JSON-safe escaped string (without surrounding quotes)
     */
    private static String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
