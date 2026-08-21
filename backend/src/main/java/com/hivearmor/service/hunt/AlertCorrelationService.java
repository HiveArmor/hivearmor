package com.hivearmor.service.hunt;

import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.*;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Finds alerts related to a given alert through four correlation methods:
 * <ul>
 *   <li>shared_entity — same primaryEntityId</li>
 *   <li>shared_session — same correlationId</li>
 *   <li>process_ancestry — overlapping process PIDs</li>
 *   <li>rule_correlation — same ruleId within 24h window</li>
 * </ul>
 */
@Service
public class AlertCorrelationService {

    private static final Logger log = LoggerFactory.getLogger(AlertCorrelationService.class);
    private static final int MAX_RELATED = 20;
    private static final Duration RULE_CORRELATION_WINDOW = Duration.ofHours(24);

    private final OpensearchClientBuilder osClient;

    public AlertCorrelationService(OpensearchClientBuilder osClient) {
        this.osClient = osClient;
    }

    /**
     * Result container for related alerts.
     */
    public static class RelatedAlertsResult {
        private final List<Map<String, Object>> relatedAlerts;
        private final int totalCount;

        public RelatedAlertsResult(List<Map<String, Object>> relatedAlerts, int totalCount) {
            this.relatedAlerts = relatedAlerts;
            this.totalCount = totalCount;
        }

        public List<Map<String, Object>> getRelatedAlerts() { return relatedAlerts; }
        public int getTotalCount() { return totalCount; }
    }

    /**
     * Finds alerts related to the given alert through four correlation methods.
     *
     * @param alertDoc the source alert document
     * @param tenantIndexPattern the resolved alert index pattern for the tenant
     * @return RelatedAlertsResult containing correlated alerts with reasons
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public RelatedAlertsResult findRelated(Map<String, Object> alertDoc, String tenantIndexPattern) throws Exception {
        String alertId = alertDoc.get("id") != null ? alertDoc.get("id").toString() : null;
        String entityId = extractNested(alertDoc, "primaryEntityId");
        String correlationId = extractNested(alertDoc, "correlationId");
        String ruleId = extractNested(alertDoc, "ruleId");
        String processPid = extractNested(alertDoc, "process.pid");
        String alertTimestamp = alertDoc.get("@timestamp") != null
            ? alertDoc.get("@timestamp").toString() : null;

        // If no alert ID, return empty
        if (alertId == null) {
            return new RelatedAlertsResult(Collections.emptyList(), 0);
        }

        // Deduplicated map of related alerts
        Map<String, Map<String, Object>> relatedMap = new LinkedHashMap<>();

        // Query A: shared_entity — primaryEntityId matches
        if (entityId != null && !entityId.isBlank()) {
            Query query = buildEntityQuery(alertId, entityId);
            List<Hit<Map>> hits = executeCorrelationQuery(tenantIndexPattern, query, 10);
            processHits(hits, relatedMap, alertId, "shared_entity", entityId, alertDoc);
        }

        // Query B: shared_session — correlationId matches
        if (correlationId != null && !correlationId.isBlank()) {
            Query query = buildSessionQuery(alertId, correlationId);
            List<Hit<Map>> hits = executeCorrelationQuery(tenantIndexPattern, query, 10);
            processHits(hits, relatedMap, alertId, "shared_session", correlationId, alertDoc);
        }

        // Query C: process_ancestry — process PIDs overlap
        if (processPid != null && !processPid.isBlank()) {
            Query query = buildProcessAncestryQuery(alertId, processPid);
            List<Hit<Map>> hits = executeCorrelationQuery(tenantIndexPattern, query, 5);
            processHits(hits, relatedMap, alertId, "process_ancestry", processPid, alertDoc);
        }

        // Query D: rule_correlation — same ruleId within 24h
        if (ruleId != null && !ruleId.isBlank() && alertTimestamp != null) {
            Query query = buildRuleCorrelationQuery(alertId, ruleId, alertTimestamp);
            List<Hit<Map>> hits = executeCorrelationQuery(tenantIndexPattern, query, 5);
            processHits(hits, relatedMap, alertId, "rule_correlation", ruleId, alertDoc);
        }

        // Sort by strength then timestamp
        List<Map<String, Object>> sorted = relatedMap.values().stream()
            .sorted((a, b) -> {
                int strengthA = getMaxStrengthOrder(a);
                int strengthB = getMaxStrengthOrder(b);
                if (strengthA != strengthB) return Integer.compare(strengthA, strengthB);
                // Then by timestamp DESC
                String tsA = a.get("timestamp") != null ? a.get("timestamp").toString() : "";
                String tsB = b.get("timestamp") != null ? b.get("timestamp").toString() : "";
                return tsB.compareTo(tsA);
            })
            .limit(MAX_RELATED)
            .collect(Collectors.toList());

        return new RelatedAlertsResult(sorted, sorted.size());
    }

    /**
     * Executes a single correlation query against the alert index.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Hit<Map>> executeCorrelationQuery(String indexPattern, Query query, int size) throws Exception {
        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .query(query)
            .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
            .size(size));

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        if (response.hits() == null || response.hits().hits() == null) {
            return Collections.emptyList();
        }
        return response.hits().hits();
    }

    /**
     * Processes hits from a correlation query and merges into the related alerts map.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private void processHits(List<Hit<Map>> hits,
                             Map<String, Map<String, Object>> relatedMap,
                             String selfAlertId, String correlationType,
                             String evidence, Map<String, Object> sourceAlert) {
        for (Hit<Map> hit : hits) {
            Map<String, Object> src = hit.source() != null
                ? (Map<String, Object>) hit.source() : Collections.emptyMap();

            String hitId = hit.id();
            // Exclude self
            if (hitId != null && hitId.equals(selfAlertId)) continue;

            // Also check source.id field
            String srcId = src.get("id") != null ? src.get("id").toString() : hitId;
            if (srcId != null && srcId.equals(selfAlertId)) continue;

            String effectiveId = srcId != null ? srcId : hitId;

            if (relatedMap.containsKey(effectiveId)) {
                // Append correlation reason
                Map<String, Object> existing = relatedMap.get(effectiveId);
                List<Map<String, Object>> reasons = (List<Map<String, Object>>) existing.get("correlationReasons");
                // Only add if this type is not already present
                boolean typeExists = reasons.stream()
                    .anyMatch(r -> correlationType.equals(r.get("type")));
                if (!typeExists) {
                    reasons.add(buildCorrelationReason(correlationType, evidence, sourceAlert, src));
                }
            } else {
                // New related alert
                Map<String, Object> related = new LinkedHashMap<>();
                related.put("id", effectiveId);
                related.put("title", src.getOrDefault("title", src.get("name")));
                related.put("severity", src.get("severity"));
                related.put("status", src.get("status"));
                related.put("timestamp", src.get("@timestamp"));

                List<Map<String, Object>> reasons = new ArrayList<>();
                reasons.add(buildCorrelationReason(correlationType, evidence, sourceAlert, src));
                related.put("correlationReasons", reasons);

                related.put("riskScore", src.get("riskScore"));
                related.put("primaryEntity", src.get("primaryEntityLabel"));
                related.put("ruleName", src.get("ruleName"));

                relatedMap.put(effectiveId, related);
            }
        }
    }

    /**
     * Builds a correlation reason object.
     */
    private Map<String, Object> buildCorrelationReason(String type, String evidence,
                                                        Map<String, Object> sourceAlert,
                                                        Map<String, Object> relatedAlert) {
        Map<String, Object> reason = new LinkedHashMap<>();
        reason.put("type", type);
        reason.put("description", buildDescription(type, sourceAlert, relatedAlert));
        reason.put("strength", computeStrength(type));
        reason.put("evidence", buildEvidence(type, evidence, sourceAlert, relatedAlert));
        return reason;
    }

    /**
     * Builds a human-readable description for a correlation type.
     */
    private String buildDescription(String type, Map<String, Object> sourceAlert, Map<String, Object> relatedAlert) {
        String entityLabel = extractNested(sourceAlert, "primaryEntityLabel");
        switch (type) {
            case "shared_entity":
                return "Both alerts target " + (entityLabel != null ? entityLabel : "the same entity");
            case "shared_session":
                return "Part of the same attack session";
            case "process_ancestry":
                return "Triggering process shares ancestry with this alert";
            case "rule_correlation":
                String ruleName = extractNested(sourceAlert, "ruleName");
                return "Same detection rule" + (ruleName != null ? " (" + ruleName + ")" : "") + " fired within 24h";
            default:
                return "Related alert found";
        }
    }

    /**
     * Builds evidence string for correlation.
     */
    private String buildEvidence(String type, String matchedValue,
                                  Map<String, Object> sourceAlert, Map<String, Object> relatedAlert) {
        switch (type) {
            case "shared_entity":
                return "primaryEntityId = " + matchedValue;
            case "shared_session":
                return "Shared correlationId: " + matchedValue;
            case "process_ancestry":
                return "Overlapping process PID: " + matchedValue;
            case "rule_correlation":
                return "Same ruleId: " + matchedValue;
            default:
                return matchedValue;
        }
    }

    /**
     * Computes strength for a correlation type.
     */
    String computeStrength(String correlationType) {
        switch (correlationType) {
            case "shared_session":
            case "process_ancestry":
                return "strong";
            case "shared_entity":
                return "moderate";
            case "rule_correlation":
                return "weak";
            default:
                return "weak";
        }
    }

    /**
     * Gets the numeric sort order for the maximum strength among correlation reasons.
     * Lower number = higher priority (strong first).
     */
    @SuppressWarnings("unchecked")
    private int getMaxStrengthOrder(Map<String, Object> relatedAlert) {
        List<Map<String, Object>> reasons = (List<Map<String, Object>>) relatedAlert.get("correlationReasons");
        if (reasons == null || reasons.isEmpty()) return 3;

        int minOrder = 3;
        for (Map<String, Object> reason : reasons) {
            String strength = (String) reason.get("strength");
            int order = strengthToOrder(strength);
            if (order < minOrder) minOrder = order;
        }
        return minOrder;
    }

    private int strengthToOrder(String strength) {
        if ("strong".equals(strength)) return 1;
        if ("moderate".equals(strength)) return 2;
        return 3;
    }

    // =========================================================================
    // Query builders
    // =========================================================================

    private Query buildEntityQuery(String excludeAlertId, String entityId) {
        return Query.of(q -> q.bool(b -> b
            .must(List.of(
                Query.of(mq -> mq.term(t -> t.field("primaryEntityId.keyword").value(v -> v.stringValue(entityId))))
            ))
            .mustNot(List.of(
                Query.of(mn -> mn.ids(i -> i.values(List.of(excludeAlertId))))
            ))
        ));
    }

    private Query buildSessionQuery(String excludeAlertId, String correlationId) {
        return Query.of(q -> q.bool(b -> b
            .must(List.of(
                Query.of(mq -> mq.term(t -> t.field("correlationId.keyword").value(v -> v.stringValue(correlationId))))
            ))
            .mustNot(List.of(
                Query.of(mn -> mn.ids(i -> i.values(List.of(excludeAlertId))))
            ))
        ));
    }

    private Query buildProcessAncestryQuery(String excludeAlertId, String processPid) {
        return Query.of(q -> q.bool(b -> b
            .should(List.of(
                Query.of(sq -> sq.term(t -> t.field("process.pid.keyword").value(v -> v.stringValue(processPid)))),
                Query.of(sq -> sq.term(t -> t.field("process.parent.pid.keyword").value(v -> v.stringValue(processPid))))
            ))
            .minimumShouldMatch("1")
            .mustNot(List.of(
                Query.of(mn -> mn.ids(i -> i.values(List.of(excludeAlertId))))
            ))
        ));
    }

    private Query buildRuleCorrelationQuery(String excludeAlertId, String ruleId, String alertTimestamp) {
        // Parse timestamp and compute 24h window
        Instant alertTime;
        try {
            alertTime = Instant.parse(alertTimestamp);
        } catch (Exception e) {
            // Fallback: just match ruleId without time filter
            return Query.of(q -> q.bool(b -> b
                .must(List.of(
                    Query.of(mq -> mq.term(t -> t.field("ruleId.keyword").value(v -> v.stringValue(ruleId))))
                ))
                .mustNot(List.of(
                    Query.of(mn -> mn.ids(i -> i.values(List.of(excludeAlertId))))
                ))
            ));
        }

        String from = DateTimeFormatter.ISO_INSTANT.format(alertTime.minus(RULE_CORRELATION_WINDOW));
        String to = DateTimeFormatter.ISO_INSTANT.format(alertTime.plus(RULE_CORRELATION_WINDOW));

        return Query.of(q -> q.bool(b -> b
            .must(List.of(
                Query.of(mq -> mq.term(t -> t.field("ruleId.keyword").value(v -> v.stringValue(ruleId)))),
                Query.of(mq -> mq.range(r -> r.field("@timestamp")
                    .gte(org.opensearch.client.json.JsonData.of(from))
                    .lte(org.opensearch.client.json.JsonData.of(to))))
            ))
            .mustNot(List.of(
                Query.of(mn -> mn.ids(i -> i.values(List.of(excludeAlertId))))
            ))
        ));
    }

    /**
     * Extracts a dot-notation nested field value as a String from a map.
     */
    @SuppressWarnings("unchecked")
    private String extractNested(Map<String, Object> src, String path) {
        if (src == null || path == null) return null;

        String[] parts = path.split("\\.");
        Object current = src;

        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return null;
            }
        }
        return current != null ? current.toString() : null;
    }
}
