package com.hivearmor.service.hunt;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.web.rest.hunt.dto.HuntEventDTO;
import com.hivearmor.web.rest.hunt.dto.HuntFieldDefinitionDTO;
import com.hivearmor.web.rest.hunt.dto.HuntSearchRequestDTO;
import com.hivearmor.web.rest.hunt.dto.HuntSearchRequestDTO.SortFieldDTO;
import com.hivearmor.web.rest.hunt.dto.HuntSearchResponseDTO;
import com.hivearmor.web.rest.hunt.dto.HuntSearchResponseDTO.HistogramBucketDTO;
import com.hivearmor.web.rest.hunt.dto.HuntSearchResponseDTO.PartialFailureDTO;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.SortOptions;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.aggregations.Aggregation;
import org.opensearch.client.opensearch._types.aggregations.CompositeAggregation;
import org.opensearch.client.opensearch._types.aggregations.CompositeAggregationSource;
import org.opensearch.client.opensearch._types.aggregations.CompositeBucket;
import org.opensearch.client.opensearch._types.aggregations.DateHistogramAggregate;
import org.opensearch.client.opensearch._types.aggregations.DateHistogramBucket;
import org.opensearch.client.opensearch._types.aggregations.FieldDateMath;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.pit.CreatePitRequest;
import org.opensearch.client.opensearch.core.pit.DeletePitRequest;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.Pit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** Production-bounded Search &amp; Hunt execution backed by typed OpenSearch DSL. */
@Service
public class HaHuntService {

    private static final Logger log = LoggerFactory.getLogger(HaHuntService.class);
    private static final String HISTOGRAM_AGG = "time_histogram";
    private static final String FACET_AGG = "field_values";
    private static final String FACET_KEY = "value";
    private static final String PIT_KEEP_ALIVE = "2m";
    private static final Duration SESSION_TTL = Duration.ofMinutes(2);
    private static final Duration MAX_TIME_RANGE = Duration.ofDays(90);
    private static final int TOTAL_HITS_THRESHOLD = 10_000;
    private static final int MAX_FACET_PAGE_SIZE = 50;
    private static final Set<String> ALLOWED_INDEX_TYPES = Set.of("log", "event", "alert");

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final HuntFieldRegistry fieldRegistry;
    private final HuntQueryParser queryParser;
    private final HuntCursorCodec cursorCodec;
    private final HuntSearchSessionStore sessionStore;

    public HaHuntService(OpensearchClientBuilder osClient,
                         MsspIndexResolver indexResolver,
                         HuntFieldRegistry fieldRegistry,
                         HuntQueryParser queryParser,
                         HuntCursorCodec cursorCodec,
                         HuntSearchSessionStore sessionStore) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.fieldRegistry = fieldRegistry;
        this.queryParser = queryParser;
        this.cursorCodec = cursorCodec;
        this.sessionStore = sessionStore;
    }

    public HuntSearchResponseDTO executeSearch(HuntSearchRequestDTO request,
                                               String searchId,
                                               String owner,
                                               String tenantKey) throws Exception {
        validateRequest(request);
        long started = System.nanoTime();
        HuntSearchSessionStore.Session session;
        List<String> searchAfter = null;

        if (request.getCursor() == null || request.getCursor().isBlank()) {
            Query userQuery = queryParser.parse(request.getQuery());
            Query boundedQuery = withTimeRange(userQuery, request.getTimeRange());
            List<String> indices = resolveIndices(request.getIndexPattern());
            List<String> projection = fieldRegistry.boundedProjection(request.getFields());
            List<SortOptions> sort = buildSort(request.getSort());
            String interval = computeHistogramInterval(request.getTimeRange().getFrom(), request.getTimeRange().getTo());
            String pitId = "";
            try {
                pitId = createPit(indices);
            } catch (Exception pitEx) {
                log.warn("hunt PIT unavailable; searching indices directly indices={}: {}", indices, pitEx.toString());
            }
            Instant snapshotAt = Instant.now();
            session = new HuntSearchSessionStore.Session(
                searchId, owner, tenantKey, fingerprint(request), request.getQuery(), boundedQuery,
                indices, projection, sort, pitId, snapshotAt, snapshotAt.plus(SESSION_TTL), interval);
            sessionStore.put(session);
        } else {
            HuntCursorCodec.CursorPayload cursor = cursorCodec.decode(request.getCursor(), owner, tenantKey);
            session = sessionStore.require(cursor.searchId(), owner, tenantKey);
            if (!session.requestFingerprint().equals(fingerprint(request))) {
                throw new HuntQueryException("HUNT_CURSOR_REQUEST_MISMATCH", "Cursor cannot be reused with a changed query, scope, projection, sort, or page size", 0);
            }
            searchAfter = cursor.sortValues();
            searchId = session.searchId();
        }

        SearchRequest.Builder builder = new SearchRequest.Builder()
            .query(session.query())
            .size(request.getLimit())
            .sort(session.sort())
            .source(s -> s.filter(f -> f.includes(fieldRegistry.sourceIncludes(session.projection()))))
            .trackTotalHits(t -> t.count(TOTAL_HITS_THRESHOLD))
            .allowPartialSearchResults(true)
            .timeout("30s");
        applySessionIndex(builder, session);
        if (searchAfter != null) builder.searchAfter(searchAfter);
        if (request.isIncludeHistogram() && searchAfter == null) addHistogram(builder, request, session.histogramInterval());

        try {
            @SuppressWarnings("rawtypes")
            SearchResponse<Map> response = osClient.execute(os -> os.search(builder.build(), Map.class));
            HuntSearchSessionStore.Session responseSession = refreshPitId(session, response.pitId());
            return buildResponse(response, request, responseSession,
                Duration.ofNanos(System.nanoTime() - started).toMillis(), owner, tenantKey);
        } catch (Exception ex) {
            if (request.getCursor() == null || request.getCursor().isBlank()) closeSearch(searchId);
            throw ex;
        }
    }

    public List<HuntFieldDefinitionDTO> getSchemaFields() {
        return fieldRegistry.definitions();
    }

    public Map<String, Object> getFieldValues(String searchId,
                                              String fieldName,
                                              String valueCursor,
                                              String query,
                                              int limit,
                                              String owner,
                                              String tenantKey) throws Exception {
        if (limit < 1 || limit > MAX_FACET_PAGE_SIZE) {
            throw new HuntQueryException("HUNT_FACET_LIMIT_INVALID", "Field value page size must be between 1 and 50", 0);
        }
        HuntFieldRegistry.FieldSpec field = fieldRegistry.requireAggregatable(fieldName);
        HuntSearchSessionStore.Session session = sessionStore.require(searchId, owner, tenantKey);
        Map<String, String> after = null;
        if (valueCursor != null && !valueCursor.isBlank()) {
            HuntCursorCodec.CursorPayload decoded = cursorCodec.decode(valueCursor, owner, tenantKey);
            if (!(searchId + ":" + field.name()).equals(decoded.searchId())) {
                throw new HuntQueryException("HUNT_FACET_CURSOR_MISMATCH", "Value cursor belongs to another search or field", 0);
            }
            after = Map.of(FACET_KEY, decoded.sortValues().get(0));
        }

        Query facetQuery = session.query();
        if (query != null && !query.isBlank()) {
            String trimmed = query.trim();
            if (trimmed.length() < 2 || trimmed.length() > 128) {
                throw new HuntQueryException("HUNT_FACET_QUERY_INVALID", "Value filter must contain 2 to 128 characters", 0);
            }
            Query prefix = Query.of(q -> q.prefix(p -> p.field(field.name()).value(trimmed.toLowerCase(Locale.ROOT))));
            facetQuery = Query.of(q -> q.bool(b -> b.must(session.query()).filter(prefix)));
        }

        CompositeAggregationSource source = CompositeAggregationSource.of(s -> s
            .terms(t -> t.field(field.name())));
        CompositeAggregation.Builder composite = new CompositeAggregation.Builder()
            .size(limit)
            .sources(List.of(Map.of(FACET_KEY, source)));
        if (after != null) composite.after(after);

        SearchRequest.Builder facetBuilder = new SearchRequest.Builder()
            .size(0)
            .query(facetQuery)
            .timeout("15s")
            .allowPartialSearchResults(true)
            .aggregations(FACET_AGG, Aggregation.of(a -> a.composite(composite.build())));
        applySessionIndex(facetBuilder, session);
        SearchRequest request = facetBuilder.build();

        @SuppressWarnings("rawtypes")
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
        List<Map<String, Object>> items = new ArrayList<>();
        String nextCursor = null;
        Aggregate aggregate = response.aggregations().get(FACET_AGG);
        if (aggregate != null && aggregate.isComposite()) {
            for (CompositeBucket bucket : aggregate.composite().buckets().array()) {
                JsonData key = bucket.key().get(FACET_KEY);
                String value = jsonDataText(key);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("value", value);
                item.put("count", bucket.docCount());
                item.put("countIsExact", response.shards().failed().longValue() == 0);
                item.put("includeQuery", field.name() + ":\"" + escapeQueryValue(value) + "\"");
                item.put("excludeQuery", "NOT " + field.name() + ":\"" + escapeQueryValue(value) + "\"");
                items.add(item);
            }
            JsonData afterKey = aggregate.composite().afterKey().get(FACET_KEY);
            if (afterKey != null && items.size() == limit) {
                String afterValue = jsonDataText(afterKey);
                nextCursor = cursorCodec.encode(searchId + ":" + field.name(), owner, tenantKey,
                    session.expiresAt(), List.of(afterValue));
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("field", field.name());
        result.put("searchId", searchId);
        result.put("items", items);
        result.put("nextCursor", nextCursor);
        result.put("hasMore", nextCursor != null);
        result.put("totalDistinctApproximate", null);
        result.put("totalIsExact", false);
        result.put("state", response.timedOut() ? "partial" : "available");
        result.put("snapshotAt", session.snapshotAt().toString());
        return result;
    }

    public Optional<HuntSearchSessionStore.Session> closeSearch(String searchId) {
        Optional<HuntSearchSessionStore.Session> session = sessionStore.remove(searchId);
        session.ifPresent(value -> {
            if (value.pitId() == null || value.pitId().isBlank()) {
                return;
            }
            try {
                osClient.execute(os -> os.deletePit(DeletePitRequest.of(d -> d.pitId(List.of(value.pitId())))));
            } catch (Exception ex) {
                log.warn("Failed to release PIT for search {}: {}", searchId, ex.getMessage());
            }
        });
        return session;
    }

    public HuntSearchSessionStore.Session requireSession(String searchId, String owner, String tenantKey) {
        return sessionStore.require(searchId, owner, tenantKey);
    }

    /**
     * Fetch a bounded event sample for a completed search, for AI verdict analysis
     * (HUNT-AI-CONTRACT §3). Reuses the retained session's compiled query + PIT + projection —
     * it does NOT accept a fresh query, so it cannot widen scope beyond what the analyst ran.
     * Returns the minimal {@link com.hivearmor.web.rest.hunt.ai.dto.HuntEventSample} projection.
     */
    public java.util.List<com.hivearmor.web.rest.hunt.ai.dto.HuntEventSample> sampleEvents(
            String searchId, String owner, String tenantKey, int limit) throws Exception {
        HuntSearchSessionStore.Session session = sessionStore.require(searchId, owner, tenantKey);
        SearchRequest.Builder builder = new SearchRequest.Builder()
            .query(session.query())
            .size(Math.max(1, Math.min(limit, 500)))
            .sort(session.sort())
            .source(s -> s.filter(f -> f.includes(fieldRegistry.sourceIncludes(session.projection()))))
            .allowPartialSearchResults(true)
            .timeout("30s");
        applySessionIndex(builder, session);
        @SuppressWarnings("rawtypes")
        SearchResponse<Map> response = osClient.execute(os -> os.search(builder.build(), Map.class));
        java.util.List<com.hivearmor.web.rest.hunt.ai.dto.HuntEventSample> out = new java.util.ArrayList<>();
        for (Hit<Map> hit : response.hits().hits()) {
            HuntEventDTO e = mapHitToEvent(hit);
            out.add(new com.hivearmor.web.rest.hunt.ai.dto.HuntEventSample(
                e.getId(), e.getTimestamp(), e.getSeverity(), e.getCategory(),
                e.getAction(), e.getUser(), e.getSourceIp(), e.getMessage()));
        }
        return out;
    }

    private HuntSearchSessionStore.Session refreshPitId(HuntSearchSessionStore.Session session, String responsePitId) {
        if (responsePitId == null || responsePitId.isBlank() || responsePitId.equals(session.pitId())) {
            return session;
        }
        HuntSearchSessionStore.Session refreshed = session.withPitId(responsePitId);
        sessionStore.put(refreshed);
        return refreshed;
    }

    private void validateRequest(HuntSearchRequestDTO request) {
        if (!"kql".equalsIgnoreCase(request.getLanguage())) {
            throw new HuntQueryException("HUNT_LANGUAGE_UNSUPPORTED", "Only the kql query language is currently supported", 0);
        }
        if (!"authorized".equals(request.getTenantScope()) && (request.getTenantScope() == null || request.getTenantScope().isBlank())) {
            throw new HuntQueryException("HUNT_TENANT_SCOPE_INVALID", "Tenant scope is required", 0);
        }
        Instant from;
        Instant to;
        try {
            from = Instant.parse(request.getTimeRange().getFrom());
            to = Instant.parse(request.getTimeRange().getTo());
        } catch (Exception ex) {
            throw new HuntQueryException("HUNT_TIME_RANGE_INVALID", "Time range must use ISO-8601 UTC instants", 0);
        }
        if (!from.isBefore(to)) {
            throw new HuntQueryException("HUNT_TIME_RANGE_INVALID", "Time range start must precede its end", 0);
        }
        if (Duration.between(from, to).compareTo(MAX_TIME_RANGE) > 0) {
            throw new HuntQueryException("HUNT_TIME_RANGE_TOO_WIDE", "Time range cannot exceed 90 days", 0);
        }
        if (request.getLimit() < 1 || request.getLimit() > 200) {
            throw new HuntQueryException("HUNT_LIMIT_INVALID", "Page size must be between 1 and 200", 0);
        }
    }

    private List<String> resolveIndices(String requestedType) {
        if (requestedType == null || requestedType.isBlank() || "all".equalsIgnoreCase(requestedType)) {
            return List.of(
                indexResolver.resolveIndexPattern("log"),
                indexResolver.resolveAlertIndexPattern()
            );
        }
        String normalized = requestedType.toLowerCase(Locale.ROOT);
        if ("alert".equals(normalized)) {
            return List.of(indexResolver.resolveAlertIndexPattern());
        }
        if (!ALLOWED_INDEX_TYPES.contains(normalized)) {
            throw new HuntQueryException("HUNT_INDEX_TYPE_UNSUPPORTED", "Unsupported hunt data source: " + requestedType, 0);
        }
        return List.of(indexResolver.resolveIndexPattern(normalized));
    }

    private void applySessionIndex(SearchRequest.Builder builder, HuntSearchSessionStore.Session session) {
        if (session.pitId() == null || session.pitId().isBlank()) {
            builder.index(session.indices()).ignoreUnavailable(true).allowNoIndices(true);
            return;
        }
        builder.pit(Pit.of(p -> p.id(session.pitId()).keepAlive(PIT_KEEP_ALIVE)));
    }

    private String createPit(List<String> indices) throws Exception {
        return osClient.execute(os -> os.createPit(CreatePitRequest.of(c -> c
            .targetIndexes(indices)
            .keepAlive(t -> t.time(PIT_KEEP_ALIVE))
            .allowPartialPitCreation(true)))).pitId();
    }

    private Query withTimeRange(Query userQuery, HuntSearchRequestDTO.TimeRangeDTO timeRange) {
        Query timeFilter = Query.of(q -> q.range(RangeQuery.of(r -> r
            .field("@timestamp")
            .gte(JsonData.of(timeRange.getFrom()))
            .lte(JsonData.of(timeRange.getTo())))));
        return Query.of(q -> q.bool(BoolQuery.of(b -> b.must(userQuery).filter(timeFilter))));
    }

    private List<SortOptions> buildSort(List<SortFieldDTO> requested) {
        List<SortOptions> result = new ArrayList<>();
        if (requested != null) {
            if (requested.size() > 3) {
                throw new HuntQueryException("HUNT_SORT_TOO_WIDE", "At most three sort fields may be requested", 0);
            }
            for (SortFieldDTO sort : requested) {
                if (sort == null || "_id".equals(sort.getField()) || "_shard_doc".equals(sort.getField())) continue;
                HuntFieldRegistry.FieldSpec field = fieldRegistry.requireSortable(sort.getField());
                SortOrder order = "asc".equalsIgnoreCase(sort.getDirection()) ? SortOrder.Asc : SortOrder.Desc;
                result.add(SortOptions.of(s -> s.field(f -> f.field(field.name()).order(order))));
            }
        }
        if (result.isEmpty()) {
            result.add(SortOptions.of(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc))));
        }
        result.add(SortOptions.of(s -> s.field(f -> f.field("_shard_doc").order(SortOrder.Asc))));
        return List.copyOf(result);
    }

    private void addHistogram(SearchRequest.Builder builder, HuntSearchRequestDTO request, String interval) {
        Instant from = Instant.parse(request.getTimeRange().getFrom());
        Instant to = Instant.parse(request.getTimeRange().getTo());
        builder.aggregations(HISTOGRAM_AGG, Aggregation.of(a -> a.dateHistogram(d -> d
            .field("@timestamp")
            .fixedInterval(i -> i.time(interval))
            .minDocCount(0)
            .extendedBounds(e -> e
                .min(FieldDateMath.of(f -> f.value((double) from.toEpochMilli())))
                .max(FieldDateMath.of(f -> f.value((double) to.toEpochMilli())))))));
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private HuntSearchResponseDTO buildResponse(SearchResponse<Map> response,
                                                 HuntSearchRequestDTO request,
                                                 HuntSearchSessionStore.Session session,
                                                 long measuredTookMs,
                                                 String owner,
                                                 String tenantKey) {
        HuntSearchResponseDTO dto = new HuntSearchResponseDTO();
        dto.setSearchId(session.searchId());
        dto.setSnapshotAt(session.snapshotAt().toString());
        dto.setTookMs(response.took() > 0 ? response.took() : measuredTookMs);

        if (response.hits() != null && response.hits().total() != null) {
            dto.setTotalApproximate(response.hits().total().value());
            dto.setTotalIsExact("eq".equals(response.hits().total().relation().jsonValue()));
        }

        List<HuntEventDTO> events = new ArrayList<>();
        List<String> lastSort = null;
        if (response.hits() != null) {
            for (Hit<Map> hit : response.hits().hits()) {
                events.add(mapHitToEvent(hit));
                if (hit.sort() != null && !hit.sort().isEmpty()) lastSort = hit.sort();
            }
        }
        dto.setItems(events);
        boolean hasMore = events.size() == request.getLimit() && lastSort != null;
        dto.setHasMore(hasMore);
        dto.setNextCursor(hasMore
            ? cursorCodec.encode(session.searchId(), owner, tenantKey, session.expiresAt(), lastSort)
            : null);

        Aggregate histogram = response.aggregations().get(HISTOGRAM_AGG);
        dto.setHistogram(histogram == null ? List.of() : extractHistogram(histogram, session.histogramInterval()));
        dto.setPartialFailures(partialFailures(response));
        return dto;
    }

    private List<PartialFailureDTO> partialFailures(SearchResponse<?> response) {
        List<PartialFailureDTO> failures = new ArrayList<>();
        if (response.timedOut()) {
            failures.add(new PartialFailureDTO("opensearch", "HUNT_TIMEOUT", "The query timed out and may contain partial results"));
        }
        if (response.shards() != null && response.shards().failed().longValue() > 0) {
            response.shards().failures().stream().limit(5).forEach(failure -> failures.add(
                new PartialFailureDTO(failure.index(), "HUNT_SHARD_FAILURE", failure.reason().reason())));
        }
        return List.copyOf(failures);
    }

    @SuppressWarnings("unchecked")
    private HuntEventDTO mapHitToEvent(Hit<Map> hit) {
        HuntEventDTO dto = new HuntEventDTO();
        Map<String, Object> source = hit.source() == null ? Map.of() : hit.source();
        dto.setId(hit.id());
        dto.setTimestamp(string(source, "@timestamp"));
        dto.setIngestedAt(string(source, "ingestedAt"));
        Map<String, Object> event = nested(source, "event");
        Map<String, Object> log = nested(source, "log");
        Map<String, Object> origin = nested(source, "origin");
        Map<String, Object> target = nested(source, "target");
        Object severity = event.get("severity");
        if (severity == null) {
            severity = source.get("severity");
        }
        dto.setSeverity(HuntEventDTO.mapSeverity(severity));
        dto.setCategory(firstNonBlank(
            string(event, "category"),
            string(source, "dataType"),
            string(log, "channel")));
        dto.setAction(firstNonBlank(
            string(event, "action"),
            string(source, "action"),
            string(log, "eventName")));
        dto.setDataSource(string(source, "dataSource"));
        dto.setDataset(firstNonBlank(
            string(nested(source, "data_stream"), "dataset"),
            string(source, "dataType"),
            string(log, "channel")));
        dto.setHost(firstNonBlank(
            string(nested(source, "host"), "name"),
            string(origin, "host"),
            string(source, "origin.host"),
            string(log, "computer"),
            hostFromDataSource(string(source, "dataSource"))));
        dto.setUser(firstNonBlank(
            string(nested(source, "user"), "name"),
            string(origin, "user"),
            string(source, "origin.user"),
            string(target, "user"),
            string(source, "target.user"),
            string(log, "eventDataTargetUserName"),
            string(log, "eventDataSubjectUserName")));
        dto.setSourceIp(firstNonBlank(
            string(nested(source, "source"), "ip"),
            string(origin, "ip"),
            string(source, "origin.ip"),
            string(log, "eventDataIpAddress")));
        dto.setDestinationIp(firstNonBlank(
            string(nested(source, "destination"), "ip"),
            string(target, "ip"),
            string(source, "target.ip")));
        dto.setMessage(firstNonBlank(
            string(source, "message"),
            string(source, "name"),
            string(log, "eventName"),
            summarizeLog(log, dto.getAction(), dto.getCategory()),
            summarizeNetconn(dto.getAction(), dto.getSourceIp(), dto.getDestinationIp())));
        String tenantId = firstNonBlank(string(source, "tenantId"), string(source, "visibleBy"));
        String tenantName = firstNonBlank(string(source, "tenantName"), string(source, "visibleBy"));
        dto.setTenantId(tenantId == null ? "authorized" : tenantId);
        dto.setTenantName(tenantName == null ? "Authorized scope" : tenantName);
        dto.setAlertCount(0);
        Map<String, Object> normalized = new LinkedHashMap<>();
        sessionSafePut(normalized, "@timestamp", dto.getTimestamp());
        sessionSafePut(normalized, "event.severity", severity);
        sessionSafePut(normalized, "event.category", dto.getCategory());
        sessionSafePut(normalized, "event.action", dto.getAction());
        sessionSafePut(normalized, "event.outcome", firstNonBlank(string(event, "outcome"), string(source, "actionResult")));
        sessionSafePut(normalized, "host.name", dto.getHost());
        sessionSafePut(normalized, "user.name", dto.getUser());
        sessionSafePut(normalized, "source.ip", dto.getSourceIp());
        sessionSafePut(normalized, "destination.ip", dto.getDestinationIp());
        sessionSafePut(normalized, "dataSource", dto.getDataSource());
        sessionSafePut(normalized, "dataType", string(source, "dataType"));
        sessionSafePut(normalized, "log.eventCode", log.get("eventCode"));
        sessionSafePut(normalized, "log.channel", log.get("channel"));
        dto.setNormalized(normalized);
        return dto;
    }

    private static String hostFromDataSource(String dataSource) {
        if (dataSource == null || dataSource.isBlank()) {
            return null;
        }
        String value = dataSource.trim();
        int paren = value.indexOf(" (");
        if (paren > 0) {
            value = value.substring(0, paren).trim();
        }
        return value.isEmpty() || "-".equals(value) ? null : value;
    }

    private static String summarizeNetconn(String action, String sourceIp, String destinationIp) {
        if (action == null && sourceIp == null && destinationIp == null) {
            return null;
        }
        StringBuilder summary = new StringBuilder();
        if (action != null) {
            summary.append(action);
        }
        if (sourceIp != null || destinationIp != null) {
            if (summary.length() > 0) {
                summary.append(' ');
            }
            summary.append(sourceIp == null ? "?" : sourceIp)
                .append(" → ")
                .append(destinationIp == null ? "?" : destinationIp);
        }
        return summary.length() == 0 ? null : summary.toString();
    }

    private static String summarizeLog(Map<String, Object> log, String action, String category) {
        if (log == null || log.isEmpty()) {
            return null;
        }
        Object code = log.get("eventCode");
        Object channel = log.get("channel");
        if (code == null && channel == null) {
            return null;
        }
        StringBuilder summary = new StringBuilder();
        if (channel != null && !String.valueOf(channel).isBlank()) {
            summary.append(channel);
        }
        if (code != null) {
            if (summary.length() > 0) {
                summary.append(' ');
            }
            summary.append("event ").append(code);
        }
        if (action != null && !action.isBlank() && summary.indexOf(action) < 0) {
            if (summary.length() > 0) {
                summary.append(" — ");
            }
            summary.append(action);
        } else if (category != null && !category.isBlank() && summary.length() == 0) {
            summary.append(category);
        }
        return summary.length() == 0 ? null : summary.toString();
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null) {
                String trimmed = value.trim();
                if (!trimmed.isEmpty() && !"-".equals(trimmed)) {
                    return trimmed;
                }
            }
        }
        return null;
    }

    private List<HistogramBucketDTO> extractHistogram(Aggregate aggregate, String interval) {
        if (!aggregate.isDateHistogram()) return List.of();
        Duration bucketDuration = parseInterval(interval);
        DateHistogramAggregate histogram = aggregate.dateHistogram();
        List<DateHistogramBucket> source = histogram.buckets().array();
        List<HistogramBucketDTO> result = new ArrayList<>();
        for (int i = 0; i < source.size(); i++) {
            DateHistogramBucket bucket = source.get(i);
            String from = bucket.keyAsString();
            String to = i + 1 < source.size() ? source.get(i + 1).keyAsString()
                : Instant.parse(from).plus(bucketDuration).toString();
            result.add(new HistogramBucketDTO(from, to, bucket.docCount()));
        }
        return List.copyOf(result);
    }

    private String computeHistogramInterval(String fromText, String toText) {
        long minutes = Math.max(1, Duration.between(Instant.parse(fromText), Instant.parse(toText)).toMinutes());
        if (minutes <= 60) return "2m";
        if (minutes <= 240) return "5m";
        if (minutes <= 720) return "15m";
        if (minutes <= 1440) return "30m";
        if (minutes <= 10080) return "3h";
        return "12h";
    }

    private Duration parseInterval(String interval) {
        long value = Long.parseLong(interval.substring(0, interval.length() - 1));
        return interval.endsWith("h") ? Duration.ofHours(value) : Duration.ofMinutes(value);
    }

    String fingerprint(HuntSearchRequestDTO request) {
        StringBuilder canonical = new StringBuilder();
        canonical.append(request.getQuery().trim()).append('\n')
            .append(request.getLanguage().toLowerCase(Locale.ROOT)).append('\n')
            .append(request.getTimeRange().getFrom()).append('\n')
            .append(request.getTimeRange().getTo()).append('\n')
            .append(request.getTenantScope()).append('\n')
            .append(request.getIndexPattern()).append('\n')
            .append(request.getLimit()).append('\n');
        if (request.getFields() != null) request.getFields().forEach(value -> canonical.append(value).append(','));
        canonical.append('\n');
        if (request.getSort() != null) request.getSort().forEach(value -> canonical
            .append(value.getField()).append(':').append(value.getDirection()).append(','));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to fingerprint hunt request", ex);
        }
    }

    private String jsonDataText(JsonData value) {
        if (value == null) return "";
        try {
            Object object = value.to(Object.class);
            return String.valueOf(object);
        } catch (Exception ex) {
            return value.toString();
        }
    }

    private String escapeQueryValue(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String string(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value == null ? null : String.valueOf(value);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> nested(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value instanceof Map<?, ?> nested ? (Map<String, Object>) nested : Collections.emptyMap();
    }

    private static void sessionSafePut(Map<String, Object> target, String key, Object value) {
        if (value != null) target.put(key, value);
    }
}
