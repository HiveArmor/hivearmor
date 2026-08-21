package com.hivearmor.web.rest;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.HaSearchService;
import com.hivearmor.service.HaSearchSuggestionService;
import com.hivearmor.service.dto.TimelineEventDTO;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.util.CustomStringEscapeUtil;
import com.hivearmor.web.rest.dto.NlToDslRequestDTO;
import com.hivearmor.web.rest.dto.NlToDslResponseDTO;
import com.hivearmor.web.rest.dto.SuggestedSearchDTO;
import jakarta.validation.Valid;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * REST controller for the ECS-centric Search &amp; Hunt timeline endpoint and the
 * Sprint 26 Natural Language Search endpoints.
 *
 * <p>GET /api/ha-search/timeline — returns up to 500 events/alerts from OpenSearch
 * matching the caller's query string and the requested time window, sorted by
 * {@code @timestamp} descending.  Accessible to ANALYST and ADMIN roles.
 *
 * <p>POST /api/ha-search/nl-to-dsl — translates a natural-language search request
 * to an OpenSearch query DSL object via {@link HaSearchService}.  Always returns
 * HTTP 200 with a valid DSL; never returns HTTP 500 for a validation-passing request.
 *
 * <p>Security: user-supplied {@code query} is never string-interpolated into the
 * OpenSearch DSL.  It is processed via {@link CustomStringEscapeUtil} and placed
 * inside a {@code query_string} DSL clause using the OpenSearch Java client's
 * type-safe builder API (SEC-05 compliance).
 */
@RestController
@RequestMapping("/api")
public class HaSearchResource {

    private static final Logger log = LoggerFactory.getLogger(HaSearchResource.class);
    private static final String CLASSNAME = "HaSearchResource";

    /** Spring Security expression used by all Sprint 26 NL search endpoints. */
    private static final String SEARCH_AUTH =
        "hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN') " +
        "or hasAuthority('ROLE_SOC_MANAGER') or hasAuthority('ROLE_SOC_ANALYST')";

    /** Hard cap on returned documents per the design contract (Requirement 3.3). */
    private static final int MAX_RESULTS = 500;

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final HaSearchService haSearchService;
    private final HaSearchSuggestionService haSearchSuggestionService;

    public HaSearchResource(OpensearchClientBuilder osClient,
                            MsspIndexResolver indexResolver,
                            HaSearchService haSearchService,
                            HaSearchSuggestionService haSearchSuggestionService) {
        this.osClient                 = osClient;
        this.indexResolver            = indexResolver;
        this.haSearchService          = haSearchService;
        this.haSearchSuggestionService = haSearchSuggestionService;
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-search/nl-to-dsl
    // -------------------------------------------------------------------------

    /**
     * Translates a natural-language search request to an OpenSearch query DSL.
     *
     * <p>Delegates to {@link HaSearchService#translateNlToDsl} which sanitizes input,
     * calls the LLM, validates the response, and returns a safe fallback on any failure.
     * This endpoint never returns HTTP 500 for a validation-passing request.
     *
     * @param request the validated NL-to-DSL request DTO
     * @return 200 OK with a populated {@link NlToDslResponseDTO} — never null
     */
    @PostMapping("/ha-search/nl-to-dsl")
    @PreAuthorize(SEARCH_AUTH)
    public NlToDslResponseDTO translate(@Valid @RequestBody NlToDslRequestDTO request) {
        return haSearchService.translateNlToDsl(request);
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-search/suggestions
    // -------------------------------------------------------------------------

    /**
     * Returns up to {@code count} suggested searches for the given index pattern.
     *
     * <p>The {@code count} parameter is clamped to {@code [1, 20]} before being
     * forwarded to the service layer, so callers can never request more than 20
     * suggestions or fewer than 1 (SuggestionsMaxCount = 20).
     *
     * <p>This endpoint never returns HTTP 503 — {@link HaSearchSuggestionService}
     * falls back to its static list on any OpenSearch failure.
     *
     * @param indexPattern the index pattern to scope suggestions to
     * @param count        desired number of suggestions; default 5; clamped to [1, 20]
     * @return list of {@link SuggestedSearchDTO} entries (length ≤ effective count)
     */
    @GetMapping("/ha-search/suggestions")
    @PreAuthorize("hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')")
    public List<SuggestedSearchDTO> suggestions(
            @RequestParam("indexPattern") String indexPattern,
            @RequestParam(value = "count", required = false, defaultValue = "5") Integer count) {
        int effective = Math.min(Math.max(1, count), 20);  // clamp to [1, 20]
        return haSearchSuggestionService.listSuggestions(indexPattern, effective);
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-search/timeline
    // -------------------------------------------------------------------------

    /**
     * Returns up to 500 timeline events for the given query and time range.
     *
     * <p>Query parameters:
     * <ul>
     *   <li>{@code query} — DSL or natural-language query string (required, may be empty)
     *   <li>{@code from}  — ISO-8601 timestamp, inclusive lower bound (required)
     *   <li>{@code to}    — ISO-8601 timestamp, inclusive upper bound (required)
     * </ul>
     *
     * <p>Short-circuits and returns an empty array when {@code query} is blank.
     *
     * @param query the search query; must not be null
     * @param from  inclusive start of the time range
     * @param to    inclusive end of the time range
     * @return 200 OK with a JSON array of {@link TimelineEventDTO} (length ≤ 500)
     */
    @GetMapping("/ha-search/timeline")
    @PreAuthorize(SEARCH_AUTH)
    public ResponseEntity<List<TimelineEventDTO>> getSearchTimeline(
            @RequestParam("query") String query,
            @RequestParam("from") Instant from,
            @RequestParam("to") Instant to) {

        final String ctx = CLASSNAME + ".getSearchTimeline";

        // Short-circuit: empty query avoids an unnecessary OpenSearch round-trip.
        if (query == null || query.trim().isEmpty()) {
            return ResponseEntity.ok(List.of());
        }

        try {
            // Escape the user-supplied query string before placing it in the DSL.
            // This is the only permitted way to incorporate user input into an
            // OpenSearch query — never use string concatenation (SEC-05).
            String safeQuery = CustomStringEscapeUtil.openSearchQueryStringEscap(query.trim());

            // Build the time-range filter (applied to both event and alert indices).
            Query rangeFilter = Query.of(q -> q.range(RangeQuery.of(r -> r
                .field("@timestamp")
                .gte(JsonData.of(from.toString()))
                .lte(JsonData.of(to.toString()))
            )));

            // Build the user query as a query_string clause against all fields.
            // The escaped value is wrapped inside a type-safe DSL builder — not
            // interpolated directly into a raw JSON string.
            Query userQuery = Query.of(q -> q.queryString(qs -> qs
                .query(safeQuery.isEmpty() ? "*" : safeQuery)
                .defaultField("*")
                .lenient(true)
            ));

            // Combine into a bool must query.
            Query combinedQuery = Query.of(q -> q.bool(BoolQuery.of(b -> b
                .must(userQuery)
                .filter(rangeFilter)
            )));

            SearchRequest request = SearchRequest.of(r -> r
                .index(List.of(indexResolver.resolveIndexPattern("log"), indexResolver.resolveAlertIndexPattern()))
                .ignoreUnavailable(true)
                .allowNoIndices(true)
                .query(combinedQuery)
                .size(MAX_RESULTS)
                .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
            );

            @SuppressWarnings("rawtypes")
            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

            if (response == null
                    || response.hits() == null
                    || response.hits().hits() == null
                    || response.hits().hits().isEmpty()) {
                return ResponseEntity.ok(Collections.emptyList());
            }

            List<TimelineEventDTO> results = new ArrayList<>();
            for (var hit : response.hits().hits()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> src = hit.source() != null ? hit.source() : Collections.emptyMap();

                TimelineEventDTO dto = mapHitToDTO(hit.id(), hit.index(), src);
                results.add(dto);
            }

            return ResponseEntity.ok(results);

        } catch (Exception e) {
            // Do NOT expose OpenSearch internals (stack traces, index names, DSL) in
            // the response body — log internally and return a generic 500 message.
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            return ResponseEntity.internalServerError().build();
        }
    }

    // -------------------------------------------------------------------------
    // Mapping helper
    // -------------------------------------------------------------------------

    /**
     * Maps a single OpenSearch hit to a {@link TimelineEventDTO}.
     *
     * <p>Field resolution order:
     * <ul>
     *   <li>{@code id}        — from OpenSearch {@code _id}
     *   <li>{@code timestamp} — from {@code @timestamp} (ECS)
     *   <li>{@code eventType} — from {@code event.type}, then {@code dataType}
     *   <li>{@code severity}  — from {@code event.severity}, then {@code severity}; null for raw events
     *   <li>{@code dataType}  — from {@code dataType} field
     * </ul>
     *
     * @param hitId  the OpenSearch document {@code _id}
     * @param index  the index the hit came from (used to distinguish event vs alert)
     * @param src    the document source fields
     * @return a populated {@link TimelineEventDTO}
     */
    @SuppressWarnings("unchecked")
    private TimelineEventDTO mapHitToDTO(String hitId, String index, Map<String, Object> src) {
        // id: always from _id
        String id = hitId;

        // timestamp: ECS @timestamp field
        Instant timestamp = null;
        Object tsRaw = src.get("@timestamp");
        if (tsRaw instanceof String tsStr && !tsStr.isBlank()) {
            try {
                timestamp = Instant.parse(tsStr);
            } catch (Exception ignored) {
                // malformed timestamp — leave null
            }
        }

        // eventType: prefer ECS event.type; fall back to dataType
        String eventType = null;
        Object eventObj = src.get("event");
        if (eventObj instanceof Map<?, ?> eventMap) {
            Object et = ((Map<String, Object>) eventMap).get("type");
            if (et != null) {
                eventType = String.valueOf(et);
            }
        }
        if (eventType == null) {
            Object dt = src.get("dataType");
            if (dt != null) {
                eventType = String.valueOf(dt);
            }
        }
        if (eventType == null) {
            // derive a sensible default from the index pattern
            eventType = (index != null && index.contains("alert")) ? "alert" : "event";
        }

        // severity: prefer ECS event.severity, then top-level severity; null for raw events
        Integer severity = null;
        if (eventObj instanceof Map<?, ?> eventMap) {
            Object sev = ((Map<String, Object>) eventMap).get("severity");
            if (sev instanceof Number num) {
                severity = num.intValue();
            }
        }
        if (severity == null) {
            Object sev = src.get("severity");
            if (sev instanceof Number num) {
                severity = num.intValue();
            }
        }

        // dataType: direct field
        String dataType = null;
        Object dtRaw = src.get("dataType");
        if (dtRaw != null) {
            dataType = String.valueOf(dtRaw);
        }
        if (dataType == null) {
            dataType = (index != null && index.contains("alert")) ? "alert" : "unknown";
        }

        return new TimelineEventDTO(id, timestamp, eventType, severity, dataType);
    }
}
