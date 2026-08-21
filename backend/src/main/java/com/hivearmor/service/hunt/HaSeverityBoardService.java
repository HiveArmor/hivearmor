package com.hivearmor.service.hunt;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.dto.*;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.*;
import org.opensearch.client.opensearch._types.mapping.FieldType;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service responsible for computing the severity board workload projection.
 *
 * <p>Builds a single multi-aggregation OpenSearch query against the tenant-scoped
 * alert index and maps the response into a {@link SeverityBoardResponse} containing
 * overview counters, severity-grouped lanes with bounded alert previews, and a
 * 12-bucket trend histogram.
 *
 * <p>Target: p95 below 300ms for a 24-hour scope by using one round-trip to OpenSearch.
 *
 * <p>Sprint 37 — ALT-023 (Requirement 1).
 */
@Service
public class HaSeverityBoardService {

    private static final Logger log = LoggerFactory.getLogger(HaSeverityBoardService.class);

    /** Default number of alert previews per lane when laneLimit is not specified. */
    static final int DEFAULT_LANE_LIMIT = 4;

    /** Maximum allowed laneLimit value. */
    static final int MAX_LANE_LIMIT = 10;

    /** Number of trend histogram buckets to produce. */
    static final int TREND_BUCKET_COUNT = 12;

    /** Severity lane labels in canonical display order: critical → info. */
    static final List<String> LANE_ORDER = List.of("critical", "high", "medium", "low", "info");

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;

    // =========================================================================
    // Constructor (injection)
    // =========================================================================

    public HaSeverityBoardService(OpensearchClientBuilder osClient,
                                  MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Computes the severity board projection for the current tenant scope.
     *
     * <p>Resolves the alert index pattern via {@link MsspIndexResolver}, builds
     * a single multi-aggregation OpenSearch query, and maps the response to
     * the board shape.
     *
     * @param from       start of the time range (inclusive)
     * @param to         end of the time range (exclusive)
     * @param scope      alert scope filter: "active" (status &lt; 5) or "all"
     * @param ownership  ownership filter: "all", "mine", or "unassigned"
     * @param laneLimit  maximum number of alert previews per lane (1–10, default 4)
     * @return the computed severity board response
     * @throws Exception if the OpenSearch query fails
     */
    public SeverityBoardResponse computeBoard(Instant from,
                                              Instant to,
                                              String scope,
                                              String ownership,
                                              int laneLimit) throws Exception {
        String indexPattern = indexResolver.resolveAlertIndexPattern();
        log.debug("Computing severity board for index={}, from={}, to={}, scope={}, ownership={}, laneLimit={}",
            indexPattern, from, to, scope, ownership, laneLimit);

        // =====================================================================
        // Task 1.2 — Build single multi-aggregation OpenSearch query
        // =====================================================================

        // 1. Base query: bool filter with time range, scope, and ownership
        List<Query> filters = new ArrayList<>();

        // Time range filter on @timestamp
        filters.add(Query.of(q -> q.range(RangeQuery.of(r -> r
            .field("@timestamp")
            .gte(JsonData.of(from.toString()))
            .lt(JsonData.of(to.toString()))))));

        // Scope filter: "active" → status < 5
        if ("active".equalsIgnoreCase(scope)) {
            filters.add(Query.of(q -> q.range(RangeQuery.of(r -> r
                .field("status")
                .lt(JsonData.of(5))))));
        }

        // Ownership filter
        if ("mine".equalsIgnoreCase(ownership)) {
            String currentUser = SecurityUtils.getCurrentUserLogin().orElse("");
            filters.add(Query.of(q -> q.term(t -> t
                .field("assigneeId")
                .value(v -> v.stringValue(currentUser)))));
        } else if ("unassigned".equalsIgnoreCase(ownership)) {
            filters.add(Query.of(q -> q.bool(b -> b
                .mustNot(Query.of(mn -> mn.exists(e -> e.field("assigneeId")))))));
        }

        Query baseQuery = Query.of(q -> q.bool(b -> b.filter(filters)));

        // 2. Compute fixed_interval for exactly 12 trend buckets
        String fixedInterval = computeTrendInterval(from, to);

        // SLA pressure threshold: now + 1 hour
        String slaPressureThreshold = Instant.now().plus(Duration.ofHours(1)).toString();

        // 3. Build the single multi-aggregation search request
        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .query(baseQuery)
            .size(0)
            .trackTotalHits(t -> t.enabled(true))

            // --- terms agg on "severity" with sub-aggregations ---
            .aggregations("severity_lanes", a -> a
                .terms(t -> t.field("severity").size(20))
                .aggregations("top_alerts", sub -> sub
                    .topHits(th -> th
                        .size(laneLimit)
                        .sort(s -> s.field(f -> f.field("riskScore").order(SortOrder.Desc).unmappedType(FieldType.Float)))
                        .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc).unmappedType(FieldType.Date)))))
                .aggregations("sla_pressure", sub -> sub
                    .filter(f -> f.range(RangeQuery.of(rq -> rq
                        .field("slaDueAt")
                        .lte(JsonData.of(slaPressureThreshold))))))
                .aggregations("unassigned", sub -> sub
                    .missing(m -> m.field("assigneeId")))
                .aggregations("active_count", sub -> sub
                    .filter(f -> f.range(RangeQuery.of(rq -> rq
                        .field("status")
                        .lt(JsonData.of(5)))))))

            // --- date_histogram agg for trend (12 buckets) ---
            .aggregations("trend", a -> a
                .dateHistogram(dh -> dh
                    .field("@timestamp")
                    .fixedInterval(fi -> fi.time(fixedInterval))
                    .minDocCount(0)
                    .extendedBounds(eb -> eb
                        .min(FieldDateMath.of(f -> f.value((double) from.toEpochMilli())))
                        .max(FieldDateMath.of(f -> f.value((double) to.toEpochMilli())))))
                .aggregations("by_severity", sub -> sub
                    .terms(t -> t.field("severity").size(20))))

            // --- Filter aggs for overview counters ---
            .aggregations("critical_open", a -> a
                .filter(f -> f.bool(b -> b
                    .must(Query.of(mq -> mq.range(RangeQuery.of(rq -> rq.field("severity").gte(JsonData.of(9))))))
                    .filter(Query.of(fq -> fq.range(RangeQuery.of(rq -> rq.field("status").lt(JsonData.of(5)))))))))

            .aggregations("needs_triage", a -> a
                .filter(f -> f.term(t -> t.field("status").value(v -> v.longValue(1)))))

            .aggregations("unassigned_total", a -> a
                .filter(f -> f.bool(b -> b
                    .mustNot(Query.of(mn -> mn.exists(e -> e.field("assigneeId")))))))

            .aggregations("threat_intel", a -> a
                .filter(f -> f.term(t -> t.field("threatIntelMatched").value(v -> v.booleanValue(true)))))

            .aggregations("sla_pressure_total", a -> a
                .filter(f -> f.bool(b -> b
                    .must(Query.of(mq -> mq.range(RangeQuery.of(rq -> rq
                        .field("slaDueAt").lte(JsonData.of(slaPressureThreshold))))))
                    .filter(Query.of(fq -> fq.range(RangeQuery.of(rq -> rq
                        .field("status").lt(JsonData.of(5)))))))))

            .aggregations("active_total", a -> a
                .filter(f -> f.range(RangeQuery.of(rq -> rq.field("status").lt(JsonData.of(5))))))

            // --- max agg on riskScore → highestRisk ---
            .aggregations("highest_risk", a -> a
                .max(m -> m.field("riskScore")))
        );

        // 4. Execute single round-trip query
        @SuppressWarnings("rawtypes")
        SearchResponse<Map> response;
        try {
            response = osClient.execute(os -> os.search(request, Map.class));
        } catch (Exception e) {
            // If the index doesn't exist or has incompatible mappings, return an empty board
            // rather than propagating a 500 error. This handles tenant indices that were
            // created without the full field mappings (e.g., missing riskScore, slaDueAt).
            log.warn("Severity board query failed for index={}: {}. Returning empty board.", indexPattern, e.getMessage());
            List<SeverityLane> emptyLanes = LANE_ORDER.stream()
                .map(sev -> new SeverityLane(sev, 0, 0, 0, 0, List.of()))
                .toList();
            return new SeverityBoardResponse(
                new SeverityBoardOverview(0, 0, 0, 0, 0, 0, 0, 0.0),
                emptyLanes, List.of(), Instant.now(), 0, "unavailable"
            );
        }

        long totalApproximate = response.hits().total() != null
            ? response.hits().total().value() : 0;

        log.debug("Severity board query completed: total={}", totalApproximate);

        // =====================================================================
        // Task 1.3 — Map severity numeric values to lane labels and aggregate
        // =====================================================================

        // Initialize accumulators for each lane (preserves LANE_ORDER)
        Map<String, LaneAccumulator> laneAccumulators = new LinkedHashMap<>();
        for (String lane : LANE_ORDER) {
            laneAccumulators.put(lane, new LaneAccumulator());
        }

        // Extract severity_lanes terms aggregation buckets
        Aggregate severityLanesAgg = response.aggregations().get("severity_lanes");
        if (severityLanesAgg != null && severityLanesAgg.isSterms()) {
            List<StringTermsBucket> buckets = severityLanesAgg.sterms().buckets().array();
            for (StringTermsBucket bucket : buckets) {
                int severityValue = Integer.parseInt(bucket.key());
                String laneLabel = mapSeverityToLane(severityValue);
                LaneAccumulator acc = laneAccumulators.get(laneLabel);

                acc.count += bucket.docCount();

                // Aggregate sla_pressure sub-agg
                Aggregate slaPressureAgg = bucket.aggregations().get("sla_pressure");
                if (slaPressureAgg != null && slaPressureAgg.isFilter()) {
                    acc.slaPressure += slaPressureAgg.filter().docCount();
                }

                // Aggregate unassigned sub-agg
                Aggregate unassignedAgg = bucket.aggregations().get("unassigned");
                if (unassignedAgg != null && unassignedAgg.isMissing()) {
                    acc.unassigned += unassignedAgg.missing().docCount();
                }

                // Aggregate active_count sub-agg
                Aggregate activeCountAgg = bucket.aggregations().get("active_count");
                if (activeCountAgg != null && activeCountAgg.isFilter()) {
                    acc.activeCount += activeCountAgg.filter().docCount();
                }

                // Collect top_hits for later mapping (Task 1.4)
                Aggregate topAlertsAgg = bucket.aggregations().get("top_alerts");
                if (topAlertsAgg != null && topAlertsAgg.isTopHits()) {
                    acc.topHitsAggregates.add(topAlertsAgg);
                }
            }
        } else if (severityLanesAgg != null && severityLanesAgg.isLterms()) {
            // Numeric severity values may come back as long terms
            List<LongTermsBucket> buckets = severityLanesAgg.lterms().buckets().array();
            for (LongTermsBucket bucket : buckets) {
                int severityValue = (int) Long.parseLong(bucket.key());
                String laneLabel = mapSeverityToLane(severityValue);
                LaneAccumulator acc = laneAccumulators.get(laneLabel);

                acc.count += bucket.docCount();

                // Aggregate sla_pressure sub-agg
                Aggregate slaPressureAgg = bucket.aggregations().get("sla_pressure");
                if (slaPressureAgg != null && slaPressureAgg.isFilter()) {
                    acc.slaPressure += slaPressureAgg.filter().docCount();
                }

                // Aggregate unassigned sub-agg
                Aggregate unassignedAgg = bucket.aggregations().get("unassigned");
                if (unassignedAgg != null && unassignedAgg.isMissing()) {
                    acc.unassigned += unassignedAgg.missing().docCount();
                }

                // Aggregate active_count sub-agg
                Aggregate activeCountAgg = bucket.aggregations().get("active_count");
                if (activeCountAgg != null && activeCountAgg.isFilter()) {
                    acc.activeCount += activeCountAgg.filter().docCount();
                }

                // Collect top_hits for later mapping (Task 1.4)
                Aggregate topAlertsAgg = bucket.aggregations().get("top_alerts");
                if (topAlertsAgg != null && topAlertsAgg.isTopHits()) {
                    acc.topHitsAggregates.add(topAlertsAgg);
                }
            }
        }

        // =====================================================================
        // Task 1.4 — Map top_hits to alert preview shape
        // =====================================================================

        // Build lanes from accumulators in LANE_ORDER (critical → info)
        List<SeverityLane> lanes = LANE_ORDER.stream()
            .map(laneLabel -> {
                LaneAccumulator acc = laneAccumulators.get(laneLabel);
                List<AlertPreview> alerts = mapTopHitsToAlertPreviews(acc.topHitsAggregates, laneLimit);
                return new SeverityLane(laneLabel, acc.count, acc.activeCount,
                    acc.slaPressure, acc.unassigned, alerts);
            })
            .toList();

        // Task 1.5 — Build overview from filter aggregations
        SeverityBoardOverview overview = buildOverview(response.aggregations(), totalApproximate);

        // Task 1.6 — Build trend array from date_histogram
        Aggregate trendAgg = response.aggregations().get("trend");
        List<TrendBucket> trend = buildTrendBuckets(trendAgg, from, to);

        return new SeverityBoardResponse(
            overview,
            lanes,
            trend,
            Instant.now(),
            totalApproximate,
            "complete"
        );
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Builds the {@link SeverityBoardOverview} by extracting counters from the
     * filter and max aggregations in the OpenSearch response.
     *
     * <p>Handles missing or null aggregation values gracefully — returns 0 for
     * missing filter aggregations and 0.0 for a missing or NaN max aggregation.
     *
     * @param aggregations     the aggregation map from the search response
     * @param totalApproximate the total hit count from response.hits().total().value()
     * @return a fully-populated overview record
     */
    static SeverityBoardOverview buildOverview(Map<String, Aggregate> aggregations, long totalApproximate) {
        long active = extractFilterDocCount(aggregations, "active_total");
        long criticalOpen = extractFilterDocCount(aggregations, "critical_open");
        long needsTriage = extractFilterDocCount(aggregations, "needs_triage");
        long slaPressure = extractFilterDocCount(aggregations, "sla_pressure_total");
        long unassigned = extractFilterDocCount(aggregations, "unassigned_total");
        long threatIntelMatched = extractFilterDocCount(aggregations, "threat_intel");
        double highestRisk = extractMaxValue(aggregations, "highest_risk");

        return new SeverityBoardOverview(
            totalApproximate,
            active,
            criticalOpen,
            needsTriage,
            slaPressure,
            unassigned,
            threatIntelMatched,
            highestRisk
        );
    }

    /**
     * Extracts the doc_count from a filter aggregation by name.
     *
     * @return the doc_count, or 0 if the aggregation is missing or not a filter type
     */
    private static long extractFilterDocCount(Map<String, Aggregate> aggregations, String name) {
        Aggregate agg = aggregations.get(name);
        if (agg == null) {
            return 0;
        }
        if (agg.isFilter()) {
            return agg.filter().docCount();
        }
        return 0;
    }

    /**
     * Extracts the value from a max aggregation by name.
     *
     * @return the max value, or 0.0 if the aggregation is missing, not a max type,
     *         or the value is null/NaN (no documents matched)
     */
    private static double extractMaxValue(Map<String, Aggregate> aggregations, String name) {
        Aggregate agg = aggregations.get(name);
        if (agg == null) {
            return 0.0;
        }
        if (agg.isMax()) {
            double value = agg.max().value();
            if (Double.isNaN(value) || Double.isInfinite(value)) {
                return 0.0;
            }
            return value;
        }
        return 0.0;
    }

    /**
     * Computes the fixed_interval string that produces exactly 12 buckets for the
     * given time range. The interval is rounded to a human-friendly unit.
     */
    static String computeTrendInterval(Instant from, Instant to) {
        long durationSeconds = Duration.between(from, to).getSeconds();
        long bucketSeconds = durationSeconds / TREND_BUCKET_COUNT;

        // Ensure minimum 1-minute buckets
        if (bucketSeconds < 60) {
            return "1m";
        }

        // Round to the nearest minute for intervals under 1 hour
        if (bucketSeconds < 3600) {
            long minutes = bucketSeconds / 60;
            return minutes + "m";
        }

        // Round to the nearest hour for intervals under 1 day
        if (bucketSeconds < 86400) {
            long hours = bucketSeconds / 3600;
            return hours + "h";
        }

        // Round to the nearest day for longer ranges
        long days = bucketSeconds / 86400;
        return days + "d";
    }

    /**
     * Maps a numeric severity value (0–10+) to a lane label.
     *
     * <ul>
     *   <li>severity &ge; 9 → "critical"</li>
     *   <li>severity 7–8 → "high"</li>
     *   <li>severity 4–6 → "medium"</li>
     *   <li>severity 1–3 → "low"</li>
     *   <li>severity 0 (or any other value) → "info"</li>
     * </ul>
     *
     * @param severity the numeric severity value from the OpenSearch aggregation bucket
     * @return one of: "critical", "high", "medium", "low", "info"
     */
    static String mapSeverityToLane(int severity) {
        if (severity >= 9) {
            return "critical";
        } else if (severity >= 7) {
            return "high";
        } else if (severity >= 4) {
            return "medium";
        } else if (severity >= 1) {
            return "low";
        } else {
            return "info";
        }
    }

    /**
     * Maps collected top_hits aggregates from one or more severity buckets into a
     * merged, sorted, and truncated list of {@link AlertPreview} records.
     *
     * <p>When multiple severity buckets map to the same lane (e.g., severity 9 and 10
     * both map to "critical"), their top_hits documents are merged, re-sorted by
     * riskScore DESC, @timestamp DESC, id ASC, and then truncated to {@code laneLimit}.
     *
     * @param topHitsAggregates the collected top_hits aggregates for this lane
     * @param laneLimit         maximum number of alert previews to return
     * @return sorted and truncated list of alert previews
     */
    @SuppressWarnings("unchecked")
    static List<AlertPreview> mapTopHitsToAlertPreviews(List<Aggregate> topHitsAggregates, int laneLimit) {
        List<AlertPreview> allPreviews = new ArrayList<>();

        for (Aggregate agg : topHitsAggregates) {
            if (!agg.isTopHits()) {
                continue;
            }
            var hits = agg.topHits().hits().hits();
            for (var hit : hits) {
                Object source = hit.source();
                if (source == null) {
                    continue;
                }

                Map<String, Object> sourceMap;
                if (source instanceof Map) {
                    sourceMap = (Map<String, Object>) source;
                } else if (source instanceof JsonData) {
                    // JsonData wrapper from OpenSearch Java client — convert to Map
                    try {
                        sourceMap = ((JsonData) source).to(Map.class);
                    } catch (Exception e) {
                        log.warn("Unable to convert JsonData source to Map: {}", e.getMessage());
                        continue;
                    }
                } else {
                    // Unknown type — attempt cast as last resort
                    try {
                        sourceMap = (Map<String, Object>) source;
                    } catch (ClassCastException e) {
                        log.warn("Unable to cast top_hit source to Map: {}", source.getClass());
                        continue;
                    }
                }

                // Use hit._id as fallback for the document id
                String hitId = hit.id();
                AlertPreview preview = parseAlertPreview(sourceMap, hitId);
                allPreviews.add(preview);
            }
        }

        // Sort: riskScore DESC, detectedAt DESC, id ASC
        allPreviews.sort(Comparator
            .comparingDouble(AlertPreview::riskScore).reversed()
            .thenComparing(Comparator.comparing(AlertPreview::detectedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .thenComparing(AlertPreview::id, Comparator.nullsLast(Comparator.naturalOrder()))
        );

        // Truncate to laneLimit
        if (allPreviews.size() > laneLimit) {
            return allPreviews.subList(0, laneLimit);
        }
        return allPreviews;
    }

    /**
     * Parses a raw source document map into an {@link AlertPreview} record.
     *
     * <p>Handles null/missing fields gracefully by using empty strings, 0, or empty
     * lists as defaults.
     *
     * @param source the _source map from the top_hits document
     * @param hitId  the _id of the hit document (fallback for id field)
     * @return a fully-populated AlertPreview record
     */
    @SuppressWarnings("unchecked")
    static AlertPreview parseAlertPreview(Map<String, Object> source, String hitId) {
        String id = getStringOrDefault(source, "id", hitId != null ? hitId : "");
        String title = getStringOrDefault(source, "title", "");
        String summary = getStringOrDefault(source, "summary", "");
        int severity = getIntOrDefault(source, "severity", 0);
        double riskScore = getDoubleOrDefault(source, "riskScore", 0.0);
        int confidence = getIntOrDefault(source, "confidence", 0);

        // detectedAt: prefer "@timestamp", fallback to "detectedAt"
        Instant detectedAt = parseInstant(source, "@timestamp");
        if (detectedAt == null) {
            detectedAt = parseInstant(source, "detectedAt");
        }
        if (detectedAt == null) {
            detectedAt = Instant.EPOCH;
        }

        int status = getIntOrDefault(source, "status", 0);
        String statusLabel = getStringOrDefault(source, "statusLabel", mapStatusToLabel(status));
        String category = getStringOrDefault(source, "category", "");

        // primaryEntity: nested object with id, type, label
        AlertPreview.PrimaryEntity primaryEntity = parsePrimaryEntity(source.get("primaryEntity"));

        String assigneeName = getStringOrDefault(source, "assigneeName", null);
        String slaStatus = getStringOrDefault(source, "slaStatus", "");
        boolean threatIntelMatched = getBooleanOrDefault(source, "threatIntelMatched", false);
        int relatedAlertCount = getIntOrDefault(source, "relatedAlertCount", 0);
        String mitreTechniqueId = getStringOrDefault(source, "mitreTechniqueId", null);
        String tenantName = getStringOrDefault(source, "tenantName", "");

        // tags: list of strings
        List<String> tags = parseStringList(source.get("tags"));

        return new AlertPreview(
            id, title, summary, severity, riskScore, confidence, detectedAt,
            status, statusLabel, category, primaryEntity, assigneeName, slaStatus,
            threatIntelMatched, relatedAlertCount, mitreTechniqueId, tenantName, tags
        );
    }

    /**
     * Maps a numeric alert status to a human-readable label.
     */
    static String mapStatusToLabel(int status) {
        return switch (status) {
            case 1 -> "New";
            case 2 -> "In Review";
            case 3 -> "In Progress";
            case 4 -> "Escalated";
            case 5 -> "Resolved";
            case 6 -> "Closed";
            case 7 -> "Suppressed";
            default -> "Unknown";
        };
    }

    /**
     * Parses a primaryEntity value from the source map into a PrimaryEntity record.
     */
    @SuppressWarnings("unchecked")
    private static AlertPreview.PrimaryEntity parsePrimaryEntity(Object value) {
        if (value instanceof Map) {
            Map<String, Object> entityMap = (Map<String, Object>) value;
            String entityId = getStringOrDefault(entityMap, "id", "");
            String entityType = getStringOrDefault(entityMap, "type", "");
            String entityLabel = getStringOrDefault(entityMap, "label", "");
            return new AlertPreview.PrimaryEntity(entityId, entityType, entityLabel);
        }
        return new AlertPreview.PrimaryEntity("", "", "");
    }

    /**
     * Parses a list field from the source into a List of Strings.
     */
    @SuppressWarnings("unchecked")
    private static List<String> parseStringList(Object value) {
        if (value instanceof List) {
            List<?> rawList = (List<?>) value;
            return rawList.stream()
                .map(item -> {
                    if (item == null) return "";
                    String s = item.toString();
                    // Strip JSON quotes if present
                    if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
                        s = s.substring(1, s.length() - 1);
                    }
                    return s;
                })
                .collect(Collectors.toList());
        }
        if (value instanceof String) {
            return List.of((String) value);
        }
        String str = value != null ? value.toString() : "";
        if (str.length() >= 2 && str.startsWith("\"") && str.endsWith("\"")) {
            str = str.substring(1, str.length() - 1);
        }
        if (!str.isEmpty()) {
            return List.of(str);
        }
        return List.of();
    }

    /**
     * Safely extracts a String value from a source map with a default fallback.
     */
    private static String getStringOrDefault(Map<String, Object> source, String key, String defaultValue) {
        Object val = source.get(key);
        if (val == null) {
            return defaultValue;
        }
        String str = val.toString();
        // JsonData.to(Map.class) may return JsonString values whose toString() includes
        // surrounding quotes (e.g., "\"value\""). Strip them if present.
        if (str.length() >= 2 && str.startsWith("\"") && str.endsWith("\"")) {
            str = str.substring(1, str.length() - 1);
        }
        return str;
    }

    /**
     * Safely extracts an int value from a source map with a default fallback.
     */
    private static int getIntOrDefault(Map<String, Object> source, String key, int defaultValue) {
        Object val = source.get(key);
        if (val == null) {
            return defaultValue;
        }
        if (val instanceof Number) {
            return ((Number) val).intValue();
        }
        try {
            return Integer.parseInt(val.toString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    /**
     * Safely extracts a double value from a source map with a default fallback.
     */
    private static double getDoubleOrDefault(Map<String, Object> source, String key, double defaultValue) {
        Object val = source.get(key);
        if (val == null) {
            return defaultValue;
        }
        if (val instanceof Number) {
            return ((Number) val).doubleValue();
        }
        try {
            return Double.parseDouble(val.toString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    /**
     * Safely extracts a boolean value from a source map with a default fallback.
     */
    private static boolean getBooleanOrDefault(Map<String, Object> source, String key, boolean defaultValue) {
        Object val = source.get(key);
        if (val == null) {
            return defaultValue;
        }
        if (val instanceof Boolean) {
            return (Boolean) val;
        }
        String str = val.toString();
        // Strip JSON quotes if present
        if (str.length() >= 2 && str.startsWith("\"") && str.endsWith("\"")) {
            str = str.substring(1, str.length() - 1);
        }
        return Boolean.parseBoolean(str);
    }

    /**
     * Parses an Instant from a source map field. Supports ISO-8601 strings and epoch millis.
     *
     * @return the parsed Instant, or null if the field is absent or unparseable
     */
    private static Instant parseInstant(Map<String, Object> source, String key) {
        Object val = source.get(key);
        if (val == null) {
            return null;
        }
        if (val instanceof Number) {
            return Instant.ofEpochMilli(((Number) val).longValue());
        }
        String str = val.toString();
        // Strip JSON quotes if present
        if (str.length() >= 2 && str.startsWith("\"") && str.endsWith("\"")) {
            str = str.substring(1, str.length() - 1);
        }
        if (str.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(str);
        } catch (DateTimeParseException e) {
            // Try as epoch millis string
            try {
                long epochMillis = Long.parseLong(str);
                return Instant.ofEpochMilli(epochMillis);
            } catch (NumberFormatException nfe) {
                log.debug("Unable to parse timestamp '{}' from field '{}': {}", str, key, e.getMessage());
                return null;
            }
        }
    }

    /**
     * Builds the trend array from the date_histogram aggregation response.
     *
     * <p>Extracts buckets from the "trend" date_histogram aggregation, maps each
     * bucket into a {@link TrendBucket} with per-severity counts extracted from the
     * "by_severity" terms sub-aggregation, and limits the result to exactly
     * {@link #TREND_BUCKET_COUNT} buckets.
     *
     * @param trendAgg the "trend" date_histogram aggregate from the OpenSearch response
     * @param from     the start of the requested time range
     * @param to       the end of the requested time range
     * @return list of exactly 12 (or fewer if data is insufficient) trend buckets
     */
    static List<TrendBucket> buildTrendBuckets(Aggregate trendAgg, Instant from, Instant to) {
        if (trendAgg == null || !trendAgg.isDateHistogram()) {
            log.warn("Trend aggregation missing or not a date_histogram — returning empty trend");
            return List.of();
        }

        List<DateHistogramBucket> buckets = trendAgg.dateHistogram().buckets().array();
        if (buckets.isEmpty()) {
            return List.of();
        }

        // Compute the interval duration for calculating bucket end times
        Duration interval = Duration.between(from, to).dividedBy(TREND_BUCKET_COUNT);
        if (interval.isZero() || interval.isNegative()) {
            interval = Duration.ofMinutes(1);
        }

        List<TrendBucket> result = new ArrayList<>();

        int limit = Math.min(buckets.size(), TREND_BUCKET_COUNT);
        for (int i = 0; i < limit; i++) {
            DateHistogramBucket bucket = buckets.get(i);

            // Bucket start: the key is epoch millis
            Instant start = Instant.ofEpochMilli(Long.parseLong(bucket.key()));

            // Bucket end: use next bucket's start, or from + interval * (i+1), capped at 'to'
            Instant end;
            if (i + 1 < limit) {
                end = Instant.ofEpochMilli(Long.parseLong(buckets.get(i + 1).key()));
            } else {
                end = to;
            }

            // Human-readable label based on interval duration
            String label = formatBucketLabel(start, interval);

            // Total doc count in this bucket
            long total = bucket.docCount();

            // Extract per-severity counts from the by_severity sub-aggregation
            long critical = 0;
            long high = 0;
            long medium = 0;
            long low = 0;
            long info = 0;

            Aggregate bySeverityAgg = bucket.aggregations().get("by_severity");
            if (bySeverityAgg != null) {
                if (bySeverityAgg.isSterms()) {
                    for (StringTermsBucket sevBucket : bySeverityAgg.sterms().buckets().array()) {
                        int severityValue = Integer.parseInt(sevBucket.key());
                        String lane = mapSeverityToLane(severityValue);
                        long count = sevBucket.docCount();
                        switch (lane) {
                            case "critical" -> critical += count;
                            case "high" -> high += count;
                            case "medium" -> medium += count;
                            case "low" -> low += count;
                            case "info" -> info += count;
                        }
                    }
                } else if (bySeverityAgg.isLterms()) {
                    for (LongTermsBucket sevBucket : bySeverityAgg.lterms().buckets().array()) {
                        int severityValue = (int) Long.parseLong(sevBucket.key());
                        String lane = mapSeverityToLane(severityValue);
                        long count = sevBucket.docCount();
                        switch (lane) {
                            case "critical" -> critical += count;
                            case "high" -> high += count;
                            case "medium" -> medium += count;
                            case "low" -> low += count;
                            case "info" -> info += count;
                        }
                    }
                }
            }

            result.add(new TrendBucket(start, end, label, total, critical, high, medium, low, info));
        }

        return result;
    }

    /**
     * Formats a human-readable label for a trend bucket based on its start time and
     * the bucket interval duration.
     *
     * <ul>
     *   <li>Interval &lt; 1 day → "HH:mm" (e.g., "08:00", "14:30")</li>
     *   <li>Interval &ge; 1 day and &lt; 7 days → "MMM dd" (e.g., "Aug 05")</li>
     *   <li>Interval &ge; 7 days → "MMM dd" (e.g., "Aug 05")</li>
     * </ul>
     *
     * @param start    the bucket start instant
     * @param interval the bucket interval duration
     * @return a formatted label string
     */
    static String formatBucketLabel(Instant start, Duration interval) {
        ZonedDateTime zdt = start.atZone(ZoneOffset.UTC);

        if (interval.toHours() < 24) {
            // Sub-day intervals: show time
            return zdt.format(DateTimeFormatter.ofPattern("HH:mm"));
        } else {
            // Day+ intervals: show date
            return zdt.format(DateTimeFormatter.ofPattern("MMM dd"));
        }
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /**
     * Mutable accumulator used to aggregate values across multiple numeric severity
     * buckets that map to the same lane label. For example, severity 9 and 10 both
     * map to "critical" and their counts/sub-aggregation values are summed.
     */
    static class LaneAccumulator {
        long count;
        long activeCount;
        long slaPressure;
        long unassigned;
        final List<Aggregate> topHitsAggregates = new ArrayList<>();
    }
}
