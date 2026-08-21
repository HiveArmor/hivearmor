package com.hivearmor.service.entity;

import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.query_dsl.*;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Service for fetching lightweight entity previews (ENT-003).
 *
 * <p>Retrieves the entity document from v3-hive-entity-*, then builds activity
 * and alert summaries via aggregation queries on v3-hive-log-* and v3-hive-alert-*.
 * Uses separate search queries (batched where possible) to minimize round trips.
 *
 * <p>Sprint 45 — Entity Intelligence Core.
 */
@Service
public class EntityPreviewService {

    private static final Logger log = LoggerFactory.getLogger(EntityPreviewService.class);
    private static final String CLASSNAME = "EntityPreviewService";

    private final OpensearchClientBuilder osClient;
    private final EntityPivotService pivotService;

    public EntityPreviewService(OpensearchClientBuilder osClient, EntityPivotService pivotService) {
        this.osClient = osClient;
        this.pivotService = pivotService;
    }

    /**
     * Fetches the entity preview including activity summary, alert summary, and pivots.
     *
     * @param entityId           the entity document ID
     * @param tenantIndexPattern the tenant-scoped entity index pattern (e.g., v3-hive-entity-*)
     * @return optional map containing the entity preview, empty if not found
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Optional<Map<String, Object>> getPreview(String entityId, String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".getPreview";

        // 1. Fetch entity document by ID from v3-hive-entity-*
        SearchRequest entityRequest = SearchRequest.of(r -> r
            .index(tenantIndexPattern)
            .query(q -> q.term(t -> t.field("_id").value(v -> v.stringValue(entityId))))
            .size(1)
        );

        SearchResponse<Map> entityResponse = osClient.execute(os -> os.search(entityRequest, Map.class));

        if (entityResponse.hits() == null || entityResponse.hits().hits() == null
            || entityResponse.hits().hits().isEmpty()) {
            return Optional.empty();
        }

        Hit<Map> entityHit = entityResponse.hits().hits().get(0);
        Map<String, Object> source = entityHit.source() != null
            ? new LinkedHashMap<>((Map<String, Object>) entityHit.source())
            : new LinkedHashMap<>();

        // Extract entity fields
        String entityType = getStringValue(source, "type");
        String entityValue = getStringValue(source, "value");

        if (entityValue == null || entityValue.isBlank()) {
            log.warn("{}: entity {} has no value field", ctx, entityId);
            return Optional.empty();
        }

        // Derive log and alert index patterns from entity pattern
        // e.g., v3-hive-entity-* → v3-hive-log-*, v3-hive-alert-*
        String logIndexPattern = deriveIndexPattern(tenantIndexPattern, "log");
        String alertIndexPattern = deriveIndexPattern(tenantIndexPattern, "alert");

        // 2. Build activity summary (queries on v3-hive-log-*)
        Map<String, Object> activitySummary = buildActivitySummary(
            entityType, entityValue, logIndexPattern);

        // 3. Build alert summary (queries on v3-hive-alert-*)
        Map<String, Object> alertSummary = buildAlertSummary(
            entityValue, alertIndexPattern);

        // 4. Generate pivot descriptors
        List<Map<String, Object>> pivots = pivotService.generatePivots(entityId, entityType, entityValue);

        // 5. Build the preview response
        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("id", entityId);
        preview.put("type", entityType);
        preview.put("value", entityValue);
        preview.put("displayName", source.get("displayName"));
        preview.put("riskScore", source.get("riskScore"));
        preview.put("riskLevel", source.get("riskLevel"));
        preview.put("riskTrend", source.get("riskTrend"));
        preview.put("criticality", source.get("criticality"));
        preview.put("baselineDeviation", source.get("baselineDeviation"));
        preview.put("activitySummary", activitySummary);
        preview.put("alertSummary", alertSummary);
        preview.put("lastSeen", source.get("lastSeen"));
        preview.put("tags", source.getOrDefault("tags", List.of()));
        preview.put("pivots", pivots);

        return Optional.of(preview);
    }

    // =========================================================================
    // Activity Summary
    // =========================================================================

    /**
     * Builds activity summary by counting events on v3-hive-log-* where entity value
     * matches (source.ip OR host.name OR user.name), filtered for last 24h and last 7d.
     *
     * <p>Uses a single aggregation query with two filter aggregations for both time windows.
     */
    @SuppressWarnings("rawtypes")
    private Map<String, Object> buildActivitySummary(String entityType, String entityValue,
                                                     String logIndexPattern) throws Exception {
        // Build the entity match query based on type
        Query entityMatchQuery = buildEntityMatchQuery(entityType, entityValue);

        // Single query with two filter aggregations for 24h and 7d counts
        SearchRequest activityRequest = SearchRequest.of(r -> r
            .index(logIndexPattern)
            .query(entityMatchQuery)
            .size(0)
            .trackTotalHits(t -> t.enabled(true))
            .aggregations("last24h", a -> a.filter(f -> f.range(rq ->
                rq.field("@timestamp").gte(JsonData.of("now-24h")))))
            .aggregations("last7d", a -> a.filter(f -> f.range(rq ->
                rq.field("@timestamp").gte(JsonData.of("now-7d")))))
        );

        SearchResponse<Map> activityResponse = osClient.execute(os ->
            os.search(activityRequest, Map.class));

        long last24h = 0;
        long last7d = 0;

        Aggregate agg24h = activityResponse.aggregations().get("last24h");
        if (agg24h != null && agg24h.isFilter()) {
            last24h = agg24h.filter().docCount();
        }

        Aggregate agg7d = activityResponse.aggregations().get("last7d");
        if (agg7d != null && agg7d.isFilter()) {
            last7d = agg7d.filter().docCount();
        }

        long avgDaily = last7d > 0 ? last7d / 7 : 0;

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("last24h", last24h);
        summary.put("last7d", last7d);
        summary.put("avgDaily", avgDaily);

        return summary;
    }

    // =========================================================================
    // Alert Summary
    // =========================================================================

    /**
     * Builds alert summary by counting alerts on v3-hive-alert-* where entity is linked,
     * filtering active (status != closed) and last 30d, with max aggregation on severity.
     */
    @SuppressWarnings("rawtypes")
    private Map<String, Object> buildAlertSummary(String entityValue,
                                                   String alertIndexPattern) throws Exception {
        // Query: alerts linked to this entity value in the last 30 days
        Query alertQuery = Query.of(q -> q.bool(b -> b
            .must(List.of(
                Query.of(mq -> mq.multiMatch(m -> m
                    .query(entityValue)
                    .fields("entities.value", "source.ip", "destination.ip",
                            "host.name", "user.name")
                    .type(TextQueryType.BestFields))),
                Query.of(mq -> mq.range(r -> r
                    .field("@timestamp")
                    .gte(JsonData.of("now-30d"))))
            ))
        ));

        SearchRequest alertRequest = SearchRequest.of(r -> r
            .index(alertIndexPattern)
            .query(alertQuery)
            .size(0)
            .trackTotalHits(t -> t.enabled(true))
            .aggregations("active", a -> a.filter(f -> f.bool(b -> b
                .mustNot(List.of(
                    Query.of(nq -> nq.term(t -> t
                        .field("status.keyword").value(v -> v.stringValue("closed"))))
                ))
            )))
            .aggregations("maxSeverity", a -> a.terms(t -> t
                .field("severity.keyword")
                .size(5)
                .order(List.of(Map.of("_key", org.opensearch.client.opensearch._types.SortOrder.Desc)))))
        );

        SearchResponse<Map> alertResponse = osClient.execute(os ->
            os.search(alertRequest, Map.class));

        long total30d = alertResponse.hits().total() != null
            ? alertResponse.hits().total().value() : 0;

        long active = 0;
        Aggregate activeAgg = alertResponse.aggregations().get("active");
        if (activeAgg != null && activeAgg.isFilter()) {
            active = activeAgg.filter().docCount();
        }

        // Determine highest severity from terms aggregation
        String highestSeverity = "low";
        Aggregate severityAgg = alertResponse.aggregations().get("maxSeverity");
        if (severityAgg != null && severityAgg.isSterms()) {
            var buckets = severityAgg.sterms().buckets().array();
            if (!buckets.isEmpty()) {
                // Severity priority: critical > high > medium > low > info
                highestSeverity = determinHighestSeverity(buckets);
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("active", active);
        summary.put("total30d", total30d);
        summary.put("highestSeverity", highestSeverity);

        return summary;
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Builds an entity match query for activity logs based on entity type.
     *
     * <p>Matches on source.ip OR host.name OR user.name based on entity type,
     * using a bool should query for comprehensive matching.
     */
    private Query buildEntityMatchQuery(String entityType, String entityValue) {
        List<Query> shouldClauses = new ArrayList<>();

        // Always add a broad match on the entity value
        switch (entityType != null ? entityType.toLowerCase() : "") {
            case "host":
                shouldClauses.add(Query.of(q -> q.term(t ->
                    t.field("host.name.keyword").value(v -> v.stringValue(entityValue)))));
                break;
            case "user":
                shouldClauses.add(Query.of(q -> q.term(t ->
                    t.field("user.name.keyword").value(v -> v.stringValue(entityValue)))));
                break;
            case "ip":
                shouldClauses.add(Query.of(q -> q.term(t ->
                    t.field("source.ip").value(v -> v.stringValue(entityValue)))));
                shouldClauses.add(Query.of(q -> q.term(t ->
                    t.field("destination.ip").value(v -> v.stringValue(entityValue)))));
                break;
            case "domain":
                shouldClauses.add(Query.of(q -> q.term(t ->
                    t.field("dns.question.name.keyword").value(v -> v.stringValue(entityValue)))));
                break;
            default:
                // Fallback: multi-match across common fields
                shouldClauses.add(Query.of(q -> q.multiMatch(m -> m
                    .query(entityValue)
                    .fields("source.ip", "host.name", "user.name")
                    .type(TextQueryType.BestFields))));
                break;
        }

        return Query.of(q -> q.bool(b -> b
            .should(shouldClauses)
            .minimumShouldMatch("1")));
    }

    /**
     * Determines the highest severity from terms aggregation buckets.
     * Priority: critical > high > medium > low > info.
     */
    private String determinHighestSeverity(
            List<org.opensearch.client.opensearch._types.aggregations.StringTermsBucket> buckets) {
        List<String> severityOrder = List.of("critical", "high", "medium", "low", "info");
        Set<String> present = new HashSet<>();
        for (var bucket : buckets) {
            present.add(bucket.key().toLowerCase());
        }
        for (String severity : severityOrder) {
            if (present.contains(severity)) {
                return severity;
            }
        }
        return "low";
    }

    /**
     * Derives a sibling index pattern from the entity index pattern.
     * e.g., "v3-hive-entity-acme-*" → "v3-hive-log-acme-*"
     */
    private String deriveIndexPattern(String entityIndexPattern, String targetType) {
        // Pattern: v3-hive-entity-* or v3-hive-entity-<tenant>-*
        // Replace "entity" with the target type
        return entityIndexPattern.replace("entity", targetType);
    }

    /**
     * Safely extracts a string value from the source map.
     */
    private String getStringValue(Map<String, Object> source, String key) {
        Object val = source.get(key);
        return val != null ? val.toString() : null;
    }
}
