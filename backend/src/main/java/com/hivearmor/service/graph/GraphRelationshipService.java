package com.hivearmor.service.graph;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for fetching relationship evidence for Threat Constellation (CON-003).
 *
 * <p>Given a relationship ID, fetches the relationship document, supporting events,
 * related alerts, builds a chronological timeline with milestone entries, detects
 * communication patterns, and produces a summary.
 *
 * <p>Sprint 48 — Threat Constellation.
 */
@Service
public class GraphRelationshipService {

    private static final Logger log = LoggerFactory.getLogger(GraphRelationshipService.class);
    private static final String CLASSNAME = "GraphRelationshipService";

    private static final int MAX_EVENTS = 20;
    private static final int MAX_ALERTS = 10;

    /** Beaconing detection: if >70% of intervals are within 20% of the median interval. */
    private static final double REGULAR_INTERVAL_THRESHOLD = 0.70;
    private static final double INTERVAL_TOLERANCE = 0.20;

    /** Burst detection: if >50% of events occur within a 1-hour window. */
    private static final long BURST_WINDOW_MILLIS = 3600_000L;
    private static final double BURST_THRESHOLD = 0.50;

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;

    public GraphRelationshipService(OpensearchClientBuilder osClient,
                                    MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Fetches full relationship evidence for the given relationship ID.
     *
     * @param relationshipId     the relationship document ID
     * @param tenantIndexPattern not used directly — resolved via MsspIndexResolver
     * @return a map containing the detailed relationship, or null if not found
     */
    public Map<String, Object> getRelationshipEvidence(String relationshipId,
                                                       String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".getRelationshipEvidence";

        // Step 1: Fetch relationship document
        Map<String, Object> relDoc = fetchRelationship(relationshipId);
        if (relDoc == null) {
            log.debug("{}: relationship not found: {}", ctx, relationshipId);
            return null;
        }

        String sourceEntityId = getString(relDoc, "source",
            getString(relDoc, "sourceEntityId", ""));
        String targetEntityId = getString(relDoc, "target",
            getString(relDoc, "targetEntityId", ""));

        // Step 2: Fetch supporting events
        List<Map<String, Object>> events = fetchSupportingEvents(relDoc);

        // Step 3: Fetch related alerts
        List<Map<String, Object>> alerts = fetchRelatedAlerts(sourceEntityId, targetEntityId);

        // Step 4: Build timeline
        List<Map<String, Object>> timeline = buildTimeline(events, alerts, relDoc);

        // Step 5: Detect pattern
        String pattern = detectPattern(events, relDoc);

        // Step 6: Build summary
        Map<String, Object> summary = buildSummary(events, relDoc, pattern);

        // Step 7: Fetch entity details for source and target
        Map<String, Object> sourceEntity = fetchEntitySummary(sourceEntityId);
        Map<String, Object> targetEntity = fetchEntitySummary(targetEntityId);

        // Build response
        Map<String, Object> relationship = new LinkedHashMap<>();
        relationship.put("id", relationshipId);
        relationship.put("sourceEntity", sourceEntity);
        relationship.put("targetEntity", targetEntity);
        relationship.put("relationshipType", getString(relDoc, "relationshipType", "related_to"));
        relationship.put("direction", "outbound");
        relationship.put("strength", getDouble(relDoc, "strength", 0.5));
        relationship.put("confidence", getDouble(relDoc, "confidence", 0.5));
        relationship.put("events", events);
        relationship.put("alerts", alerts);
        relationship.put("timeline", timeline);
        relationship.put("summary", summary);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("relationship", relationship);

        log.debug("{}: evidence built for {} — {} events, {} alerts, pattern={}",
            ctx, relationshipId, events.size(), alerts.size(), pattern);

        return response;
    }

    // =========================================================================
    // Step 1: Fetch Relationship Document
    // =========================================================================

    /**
     * Fetches the relationship document from v3-hive-relationship-* by its document ID.
     */
    @SuppressWarnings("rawtypes")
    private Map<String, Object> fetchRelationship(String relationshipId) throws Exception {
        String relIndex = indexResolver.resolveIndexPattern("relationship");

        // Try by _id first
        SearchRequest request = new SearchRequest.Builder()
            .index(relIndex)
            .query(Query.of(q -> q.term(t -> t.field("_id").value(v -> v.stringValue(relationshipId)))))
            .size(1)
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        if (response.hits().hits() != null && !response.hits().hits().isEmpty()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> doc = response.hits().hits().get(0).source();
            return doc;
        }

        // Fallback: try by relationshipId field
        SearchRequest fallback = new SearchRequest.Builder()
            .index(relIndex)
            .query(Query.of(q -> q.term(t -> t.field("relationshipId.keyword")
                .value(v -> v.stringValue(relationshipId)))))
            .size(1)
            .build();

        SearchResponse<Map> fallbackResp = osClient.execute(os -> os.search(fallback, Map.class));
        if (fallbackResp.hits().hits() != null && !fallbackResp.hits().hits().isEmpty()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> doc = fallbackResp.hits().hits().get(0).source();
            return doc;
        }

        return null;
    }

    // =========================================================================
    // Step 2: Fetch Supporting Events
    // =========================================================================

    /**
     * Fetches supporting events from v3-hive-log-* by event IDs referenced in the
     * relationship's evidence array. Returns at most 20 events, sorted most recent first.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private List<Map<String, Object>> fetchSupportingEvents(Map<String, Object> relDoc) throws Exception {
        // Extract event IDs from the evidence array
        List<String> eventIds = extractEventIds(relDoc);

        if (eventIds.isEmpty()) {
            return List.of();
        }

        String logIndex = indexResolver.resolveIndexPattern("log");
        List<FieldValue> idValues = eventIds.stream()
            .limit(MAX_EVENTS)
            .map(FieldValue::of)
            .collect(Collectors.toList());

        // Query by _id or eventId field
        SearchRequest request = new SearchRequest.Builder()
            .index(logIndex)
            .query(Query.of(q -> q.bool(b -> b
                .should(List.of(
                    Query.of(sq -> sq.terms(t -> t.field("_id")
                        .terms(tv -> tv.value(idValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("eventId.keyword")
                        .terms(tv -> tv.value(idValues))))
                ))
                .minimumShouldMatch("1")
            )))
            .size(MAX_EVENTS)
            .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        List<Map<String, Object>> events = new ArrayList<>();
        if (response.hits().hits() != null) {
            for (Hit<Map> hit : response.hits().hits()) {
                Map<String, Object> source = hit.source();
                if (source == null) continue;

                Map<String, Object> event = new LinkedHashMap<>();
                event.put("id", hit.id());
                event.put("timestamp", getString(source, "@timestamp",
                    getString(source, "timestamp", "")));
                event.put("type", getString(source, "event.type",
                    getString(source, "eventType", "unknown")));
                event.put("description", getString(source, "message",
                    getString(source, "description", "")));
                event.put("source", getString(source, "agent.type",
                    getString(source, "source", "unknown")));
                events.add(event);
            }
        }

        // If no events found in log index, build from relationship evidence array directly
        if (events.isEmpty()) {
            events = buildEventsFromEvidence(relDoc);
        }

        return events;
    }

    /**
     * Extracts event IDs from the relationship's evidence array.
     */
    @SuppressWarnings("unchecked")
    private List<String> extractEventIds(Map<String, Object> relDoc) {
        Object evidence = relDoc.get("evidence");
        if (!(evidence instanceof List)) return List.of();

        List<String> ids = new ArrayList<>();
        for (Object item : (List<Object>) evidence) {
            if (item instanceof Map) {
                String eventId = (String) ((Map<String, Object>) item).get("eventId");
                if (eventId != null && !eventId.isBlank()) {
                    ids.add(eventId);
                }
            }
        }
        return ids;
    }

    /**
     * Builds event entries directly from the relationship evidence array when
     * supporting events are not found in the log index.
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> buildEventsFromEvidence(Map<String, Object> relDoc) {
        Object evidence = relDoc.get("evidence");
        if (!(evidence instanceof List)) return List.of();

        List<Map<String, Object>> events = new ArrayList<>();
        for (Object item : (List<Object>) evidence) {
            if (!(item instanceof Map)) continue;
            Map<String, Object> evItem = (Map<String, Object>) item;

            Map<String, Object> event = new LinkedHashMap<>();
            event.put("id", getString(evItem, "eventId", "evt-" + UUID.randomUUID().toString().substring(0, 8)));
            event.put("timestamp", getString(evItem, "timestamp", ""));
            event.put("type", getString(evItem, "type",
                getString(relDoc, "relationshipType", "event")));
            event.put("description", getString(evItem, "description", ""));
            event.put("source", getString(evItem, "source", "relationship_evidence"));
            events.add(event);
        }

        // Sort by timestamp descending, limit to MAX_EVENTS
        events.sort((a, b) -> {
            String tsA = (String) a.getOrDefault("timestamp", "");
            String tsB = (String) b.getOrDefault("timestamp", "");
            return tsB.compareTo(tsA);
        });

        return events.stream().limit(MAX_EVENTS).collect(Collectors.toList());
    }

    // =========================================================================
    // Step 3: Fetch Related Alerts
    // =========================================================================

    /**
     * Fetches alerts from v3-hive-alert-* where both source and target entities are involved.
     * Returns at most 10 alerts, sorted most recent first.
     */
    @SuppressWarnings("rawtypes")
    private List<Map<String, Object>> fetchRelatedAlerts(String sourceEntityId,
                                                         String targetEntityId) throws Exception {
        if (sourceEntityId.isBlank() && targetEntityId.isBlank()) {
            return List.of();
        }

        String alertIndex = indexResolver.resolveIndexPattern("alert");

        // Build a query that matches alerts involving both entities
        // Alerts can reference entities in various fields — we search across multiple
        List<FieldValue> entityValues = List.of(
            FieldValue.of(sourceEntityId),
            FieldValue.of(targetEntityId)
        );

        SearchRequest request = new SearchRequest.Builder()
            .index(alertIndex)
            .query(Query.of(q -> q.bool(b -> b
                .should(List.of(
                    // Match by entity IDs in entities array
                    Query.of(sq -> sq.terms(t -> t.field("entities.entityId.keyword")
                        .terms(tv -> tv.value(entityValues)))),
                    // Match by source/target fields
                    Query.of(sq -> sq.terms(t -> t.field("source.keyword")
                        .terms(tv -> tv.value(entityValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("target.keyword")
                        .terms(tv -> tv.value(entityValues)))),
                    // Match by entity value in description or related fields
                    Query.of(sq -> sq.terms(t -> t.field("relatedEntities.keyword")
                        .terms(tv -> tv.value(entityValues))))
                ))
                .minimumShouldMatch("1")
            )))
            .size(MAX_ALERTS)
            .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        List<Map<String, Object>> alerts = new ArrayList<>();
        if (response.hits().hits() != null) {
            for (Hit<Map> hit : response.hits().hits()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> source = hit.source();
                if (source == null) continue;

                Map<String, Object> alert = new LinkedHashMap<>();
                alert.put("id", hit.id());
                alert.put("title", getString(source, "alertName",
                    getString(source, "title",
                        getString(source, "name", "Alert"))));
                alert.put("severity", getString(source, "severity",
                    getString(source, "alertSeverity", "medium")));
                alert.put("timestamp", getString(source, "@timestamp",
                    getString(source, "timestamp", "")));
                alerts.add(alert);
            }
        }

        return alerts;
    }

    // =========================================================================
    // Step 4: Build Timeline
    // =========================================================================

    /**
     * Merges events and alerts chronologically, then adds milestone entries:
     * first_connection, pattern_detected, alert_triggered, latest_activity.
     */
    private List<Map<String, Object>> buildTimeline(List<Map<String, Object>> events,
                                                    List<Map<String, Object>> alerts,
                                                    Map<String, Object> relDoc) {
        List<Map<String, Object>> timeline = new ArrayList<>();

        // Milestone: first_connection
        String firstSeen = getString(relDoc, "firstSeen", "");
        if (!firstSeen.isBlank()) {
            Map<String, Object> milestone = new LinkedHashMap<>();
            milestone.put("timestamp", firstSeen);
            milestone.put("eventType", "first_connection");
            milestone.put("description", "First " + getString(relDoc, "relationshipType", "connection") + " observed");
            timeline.add(milestone);
        }

        // Detect pattern for the pattern_detected milestone
        String pattern = detectPattern(events, relDoc);
        if (!"one-time".equals(pattern) && !firstSeen.isBlank()) {
            // Pattern detected roughly after first few events
            String patternTs = computePatternDetectedTimestamp(events, firstSeen);
            Map<String, Object> patternMilestone = new LinkedHashMap<>();
            patternMilestone.put("timestamp", patternTs);
            patternMilestone.put("eventType", "pattern_detected");
            patternMilestone.put("description", formatPatternDescription(pattern));
            timeline.add(patternMilestone);
        }

        // Milestone: alert_triggered (first alert time)
        if (!alerts.isEmpty()) {
            // Find the earliest alert
            String earliestAlertTs = alerts.stream()
                .map(a -> (String) a.getOrDefault("timestamp", ""))
                .filter(ts -> !ts.isBlank())
                .min(Comparator.naturalOrder())
                .orElse("");

            if (!earliestAlertTs.isBlank()) {
                Map<String, Object> alertMilestone = new LinkedHashMap<>();
                alertMilestone.put("timestamp", earliestAlertTs);
                alertMilestone.put("eventType", "alert_triggered");
                String alertTitle = (String) alerts.get(0).getOrDefault("title", "Detection rule fired");
                alertMilestone.put("description", alertTitle);
                timeline.add(alertMilestone);
            }
        }

        // Milestone: latest_activity
        String lastSeen = getString(relDoc, "lastSeen", "");
        if (!lastSeen.isBlank()) {
            Map<String, Object> latestMilestone = new LinkedHashMap<>();
            latestMilestone.put("timestamp", lastSeen);
            latestMilestone.put("eventType", "latest_activity");
            latestMilestone.put("description", "Most recent " + getString(relDoc, "relationshipType", "activity"));
            timeline.add(latestMilestone);
        }

        // Sort timeline chronologically
        timeline.sort((a, b) -> {
            String tsA = (String) a.getOrDefault("timestamp", "");
            String tsB = (String) b.getOrDefault("timestamp", "");
            return tsA.compareTo(tsB);
        });

        return timeline;
    }

    /**
     * Computes a reasonable timestamp for when the pattern was first detected.
     * Uses the timestamp of the 3rd event (or midpoint between first and last).
     */
    private String computePatternDetectedTimestamp(List<Map<String, Object>> events,
                                                   String firstSeen) {
        if (events.size() >= 3) {
            // Sort events chronologically, pick the 3rd one
            List<String> sortedTimestamps = events.stream()
                .map(e -> (String) e.getOrDefault("timestamp", ""))
                .filter(ts -> !ts.isBlank())
                .sorted()
                .collect(Collectors.toList());
            if (sortedTimestamps.size() >= 3) {
                return sortedTimestamps.get(2);
            }
        }

        // Fallback: midpoint between firstSeen and now
        try {
            Instant first = Instant.parse(firstSeen);
            Instant mid = first.plus(
                ChronoUnit.HOURS.between(first, Instant.now()) / 2, ChronoUnit.HOURS);
            return mid.toString();
        } catch (Exception e) {
            return firstSeen;
        }
    }

    private String formatPatternDescription(String pattern) {
        return switch (pattern) {
            case "regular_interval" -> "Regular interval communication pattern detected (beaconing)";
            case "burst" -> "Burst activity pattern detected";
            case "intermittent" -> "Intermittent communication pattern detected";
            default -> "Communication pattern identified";
        };
    }

    // =========================================================================
    // Step 5: Pattern Detection
    // =========================================================================

    /**
     * Analyzes event timestamps to detect communication patterns:
     * - regular_interval: beaconing — events at regular intervals
     * - burst: many events in a short window
     * - one-time: single event
     * - intermittent: sporadic with gaps
     */
    private String detectPattern(List<Map<String, Object>> events, Map<String, Object> relDoc) {
        int totalEvents = getInt(relDoc, "eventCount", events.size());

        // One-time: single event
        if (totalEvents <= 1) {
            return "one-time";
        }

        // Collect timestamps from events
        List<Instant> timestamps = events.stream()
            .map(e -> (String) e.getOrDefault("timestamp", ""))
            .filter(ts -> !ts.isBlank())
            .map(ts -> {
                try { return Instant.parse(ts); }
                catch (Exception ex) { return null; }
            })
            .filter(Objects::nonNull)
            .sorted()
            .collect(Collectors.toList());

        if (timestamps.size() < 2) {
            // Not enough data to determine pattern — use event count heuristic
            if (totalEvents > 20) return "intermittent";
            return "one-time";
        }

        // Calculate intervals between consecutive events
        List<Long> intervals = new ArrayList<>();
        for (int i = 1; i < timestamps.size(); i++) {
            long intervalMillis = ChronoUnit.MILLIS.between(timestamps.get(i - 1), timestamps.get(i));
            intervals.add(intervalMillis);
        }

        // Check for burst: >50% of events within a 1-hour sliding window
        if (isBurstPattern(timestamps)) {
            return "burst";
        }

        // Check for regular interval (beaconing)
        if (isRegularIntervalPattern(intervals)) {
            return "regular_interval";
        }

        // Default: intermittent
        return "intermittent";
    }

    /**
     * Detects burst pattern: >50% of events occur within a 1-hour window.
     */
    private boolean isBurstPattern(List<Instant> timestamps) {
        if (timestamps.size() < 3) return false;

        int maxInWindow = 0;
        for (int i = 0; i < timestamps.size(); i++) {
            Instant windowStart = timestamps.get(i);
            Instant windowEnd = windowStart.plusMillis(BURST_WINDOW_MILLIS);
            int count = 0;
            for (int j = i; j < timestamps.size(); j++) {
                if (!timestamps.get(j).isAfter(windowEnd)) {
                    count++;
                } else {
                    break;
                }
            }
            maxInWindow = Math.max(maxInWindow, count);
        }

        return (double) maxInWindow / timestamps.size() >= BURST_THRESHOLD
            && timestamps.size() >= 3;
    }

    /**
     * Detects regular interval (beaconing) pattern:
     * >70% of intervals are within 20% of the median interval.
     */
    private boolean isRegularIntervalPattern(List<Long> intervals) {
        if (intervals.size() < 3) return false;

        // Calculate median interval
        List<Long> sorted = new ArrayList<>(intervals);
        Collections.sort(sorted);
        long median = sorted.get(sorted.size() / 2);

        if (median <= 0) return false;

        // Count intervals within tolerance of median
        long tolerance = (long) (median * INTERVAL_TOLERANCE);
        long regularCount = intervals.stream()
            .filter(i -> Math.abs(i - median) <= tolerance)
            .count();

        return (double) regularCount / intervals.size() >= REGULAR_INTERVAL_THRESHOLD;
    }

    // =========================================================================
    // Step 6: Build Summary
    // =========================================================================

    /**
     * Builds the summary object: firstSeen, lastSeen, totalEvents, peakActivity, pattern.
     */
    private Map<String, Object> buildSummary(List<Map<String, Object>> events,
                                             Map<String, Object> relDoc,
                                             String pattern) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("firstSeen", getString(relDoc, "firstSeen", ""));
        summary.put("lastSeen", getString(relDoc, "lastSeen", ""));
        summary.put("totalEvents", getInt(relDoc, "eventCount", events.size()));
        summary.put("peakActivity", computePeakActivity(events, relDoc));
        summary.put("pattern", pattern);
        return summary;
    }

    /**
     * Computes peak activity: the hour with the most events.
     * Falls back to lastSeen if insufficient data.
     */
    private String computePeakActivity(List<Map<String, Object>> events,
                                       Map<String, Object> relDoc) {
        // Group events by hour
        Map<String, Integer> hourCounts = new HashMap<>();

        for (Map<String, Object> event : events) {
            String ts = (String) event.getOrDefault("timestamp", "");
            if (ts.isBlank()) continue;
            try {
                Instant instant = Instant.parse(ts);
                // Truncate to hour
                String hourKey = instant.truncatedTo(ChronoUnit.HOURS).toString();
                hourCounts.merge(hourKey, 1, Integer::sum);
            } catch (Exception ignored) {
                // Skip unparseable timestamps
            }
        }

        if (hourCounts.isEmpty()) {
            // Fallback to lastSeen
            return getString(relDoc, "lastSeen", "");
        }

        // Find hour with most events
        return hourCounts.entrySet().stream()
            .max(Map.Entry.comparingByValue())
            .map(Map.Entry::getKey)
            .orElse(getString(relDoc, "lastSeen", ""));
    }

    // =========================================================================
    // Entity Summary Lookup
    // =========================================================================

    /**
     * Fetches a brief entity summary (id, type, value, riskScore) from v3-hive-entity-*.
     */
    @SuppressWarnings("rawtypes")
    private Map<String, Object> fetchEntitySummary(String entityId) throws Exception {
        if (entityId == null || entityId.isBlank()) {
            return Map.of("id", "", "type", "unknown", "value", "", "riskScore", 0);
        }

        String entityIndex = indexResolver.resolveIndexPattern("entity");

        SearchRequest request = new SearchRequest.Builder()
            .index(entityIndex)
            .query(Query.of(q -> q.bool(b -> b
                .should(List.of(
                    Query.of(sq -> sq.term(t -> t.field("_id").value(v -> v.stringValue(entityId)))),
                    Query.of(sq -> sq.term(t -> t.field("entityId.keyword").value(v -> v.stringValue(entityId))))
                ))
                .minimumShouldMatch("1")
            )))
            .size(1)
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        if (response.hits().hits() != null && !response.hits().hits().isEmpty()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> doc = response.hits().hits().get(0).source();
            if (doc != null) {
                Map<String, Object> entity = new LinkedHashMap<>();
                entity.put("id", entityId);
                entity.put("type", getString(doc, "type",
                    getString(doc, "entityType", extractTypeFromEntityId(entityId))));
                entity.put("value", getString(doc, "value",
                    getString(doc, "entityValue", entityId)));
                entity.put("riskScore", getInt(doc, "riskScore", 0));
                return entity;
            }
        }

        // Minimal entity info from ID
        Map<String, Object> entity = new LinkedHashMap<>();
        entity.put("id", entityId);
        entity.put("type", extractTypeFromEntityId(entityId));
        entity.put("value", entityId);
        entity.put("riskScore", 0);
        return entity;
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private String extractTypeFromEntityId(String entityId) {
        if (entityId == null) return "unknown";
        if (entityId.startsWith("ent-")) {
            String rest = entityId.substring(4);
            int dashIdx = rest.indexOf('-');
            if (dashIdx > 0) return rest.substring(0, dashIdx);
            return rest;
        }
        return "unknown";
    }

    @SuppressWarnings("unchecked")
    private static String getString(Map<String, Object> map, String key, String defaultValue) {
        if (map == null || !map.containsKey(key)) return defaultValue;
        Object val = map.get(key);
        if (val instanceof String) return (String) val;
        if (val != null) return val.toString();
        return defaultValue;
    }

    private static int getInt(Map<String, Object> map, String key, int defaultValue) {
        if (map == null || !map.containsKey(key)) return defaultValue;
        Object val = map.get(key);
        if (val instanceof Number) return ((Number) val).intValue();
        if (val instanceof String) {
            try { return Integer.parseInt((String) val); }
            catch (NumberFormatException e) { return defaultValue; }
        }
        return defaultValue;
    }

    private static double getDouble(Map<String, Object> map, String key, double defaultValue) {
        if (map == null || !map.containsKey(key)) return defaultValue;
        Object val = map.get(key);
        if (val instanceof Number) return ((Number) val).doubleValue();
        if (val instanceof String) {
            try { return Double.parseDouble((String) val); }
            catch (NumberFormatException e) { return defaultValue; }
        }
        return defaultValue;
    }
}
