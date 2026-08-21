package com.hivearmor.service.entity;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.aggregations.StringTermsBucket;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for assembling the Entity Dossier (ENT-006).
 *
 * <p>Orchestrates multiple OpenSearch queries to build a complete dossier including:
 * identity, risk profile, baseline metrics, source coverage, attack techniques, and summary.
 *
 * <p>Uses the pre-computed entity document fields (risk_drivers, risk_history, baseline_metrics,
 * source_coverage) combined with aggregation queries on log and alert indices.
 */
@Service
public class EntityDossierService {

    private static final Logger log = LoggerFactory.getLogger(EntityDossierService.class);
    private static final String CLASSNAME = "EntityDossierService";

    /** Maximum window in days. */
    private static final int MAX_WINDOW_DAYS = 90;

    /** Default window in days. */
    private static final int DEFAULT_WINDOW_DAYS = 30;

    /** MITRE technique→tactic mapping. */
    private static final Map<String, String> TECHNIQUE_TO_TACTIC = Map.of(
        "T1059.001", "TA0002",
        "T1021.002", "TA0008",
        "T1003.001", "TA0006",
        "T1078", "TA0005",
        "T1048", "TA0010",
        "T1071.001", "TA0011",
        "T1053.005", "TA0003",
        "T1558.003", "TA0006"
    );

    /** MITRE technique→name mapping. */
    private static final Map<String, String> TECHNIQUE_NAMES = Map.of(
        "T1059.001", "PowerShell",
        "T1021.002", "SMB/Windows Admin Shares",
        "T1003.001", "LSASS Memory",
        "T1078", "Valid Accounts",
        "T1048", "Exfiltration Over Alternative Protocol",
        "T1071.001", "Web Protocols",
        "T1053.005", "Scheduled Task",
        "T1558.003", "Kerberoasting"
    );

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final MsspIndexResolver indexResolver;

    public EntityDossierService(OpensearchClientBuilder osClient,
                                ObjectMapper objectMapper,
                                MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.indexResolver = indexResolver;
    }

    /**
     * Assembles the full entity dossier.
     *
     * @param entityId            the entity document ID
     * @param window              time window in days (default 30, max 90)
     * @param tenantIndexPattern  tenant-scoped entity index pattern (e.g. v3-hive-entity-*)
     * @return Optional containing the dossier map, or empty if entity not found
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Optional<Map<String, Object>> getDossier(String entityId, Integer window,
                                                     String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".getDossier";
        int effectiveWindow = resolveWindow(window);

        // ─── Step 1: Fetch entity document ───────────────────────────────────────
        Map<String, Object> entityDoc = fetchEntityDocument(entityId, tenantIndexPattern);
        if (entityDoc == null) {
            return Optional.empty();
        }

        // ─── Step 2: Resolve log and alert index patterns ────────────────────────
        String logIndexPattern = indexResolver.resolveIndexPattern("log");
        String alertIndexPattern = indexResolver.resolveIndexPattern("alert");

        // ─── Step 3: Execute source coverage and technique aggregations ──────────
        String entityType = getStr(entityDoc, "type");
        String entityValue = getStr(entityDoc, "value");

        // Source coverage aggregation on logs
        Map<String, Object> sourceCoverageAgg = executeSourceCoverageAgg(
            entityType, entityValue, logIndexPattern, effectiveWindow);

        // Attack techniques aggregation on alerts
        Map<String, Object> techniquesAgg = executeAttackTechniquesAgg(
            entityType, entityValue, alertIndexPattern, effectiveWindow);

        // ─── Step 4: Build dossier sections ──────────────────────────────────────
        Map<String, Object> identity = buildIdentity(entityDoc, entityId);
        Map<String, Object> riskProfile = buildRiskProfile(entityDoc, effectiveWindow);
        Map<String, Object> baseline = buildBaseline(entityDoc);
        Map<String, Object> sourceCoverage = buildSourceCoverage(entityDoc, sourceCoverageAgg);
        Map<String, Object> attackTechniques = buildAttackTechniques(techniquesAgg);
        Map<String, Object> summary = buildSummary(entityDoc, riskProfile, baseline, entityValue);

        // ─── Step 5: Assemble dossier ────────────────────────────────────────────
        Map<String, Object> dossier = new LinkedHashMap<>();
        dossier.put("identity", identity);
        dossier.put("riskProfile", riskProfile);
        dossier.put("baseline", baseline);
        dossier.put("sourceCoverage", sourceCoverage);
        dossier.put("attackTechniques", attackTechniques);
        dossier.put("summary", summary);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("dossier", dossier);

        return Optional.of(response);
    }

    // =========================================================================
    // Entity document fetch
    // =========================================================================

    /**
     * Fetches the entity document by ID from the entity index.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> fetchEntityDocument(String entityId, String tenantIndexPattern)
            throws Exception {
        SearchRequest request = SearchRequest.of(r -> r
            .index(tenantIndexPattern)
            .query(q -> q.ids(ids -> ids.values(entityId)))
            .size(1)
        );

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        if (response.hits() == null || response.hits().hits() == null
                || response.hits().hits().isEmpty()) {
            return null;
        }

        Hit<Map> hit = response.hits().hits().get(0);
        if (hit.source() == null) {
            return null;
        }

        Map<String, Object> doc = new LinkedHashMap<>((Map<String, Object>) hit.source());
        // Ensure ID is set
        if (!doc.containsKey("id") || doc.get("id") == null) {
            doc.put("id", hit.id());
        }
        return doc;
    }

    // =========================================================================
    // Source coverage aggregation
    // =========================================================================

    /**
     * Aggregates log events by agent.type (source field) for the given entity.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> executeSourceCoverageAgg(String entityType, String entityValue,
                                                          String logIndexPattern, int windowDays)
            throws Exception {
        String entityField = resolveEntityField(entityType);
        String windowFrom = "now-" + windowDays + "d";

        SearchRequest request = SearchRequest.of(r -> r
            .index(logIndexPattern)
            .size(0)
            .query(q -> q.bool(b -> b
                .filter(List.of(
                    Query.of(fq -> fq.term(t -> t.field(entityField)
                        .value(v -> v.stringValue(entityValue)))),
                    Query.of(fq -> fq.range(rng ->
                        rng.field("@timestamp").gte(JsonData.of(windowFrom))))
                ))
            ))
            .aggregations("by_source", a -> a.terms(t -> t.field("agent.type").size(10)))
        );

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        Map<String, Object> result = new LinkedHashMap<>();
        Aggregate agg = response.aggregations().get("by_source");
        if (agg != null && agg.isSterms()) {
            List<Map<String, Object>> sources = new ArrayList<>();
            for (StringTermsBucket bucket : agg.sterms().buckets().array()) {
                Map<String, Object> source = new LinkedHashMap<>();
                source.put("name", bucket.key());
                source.put("eventCount", bucket.docCount());
                sources.add(source);
            }
            result.put("aggSources", sources);
        }
        result.put("total", response.hits().total() != null ? response.hits().total().value() : 0);
        return result;
    }

    // =========================================================================
    // Attack techniques aggregation
    // =========================================================================

    /**
     * Aggregates alerts by mitre.technique.id for the given entity.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> executeAttackTechniquesAgg(String entityType, String entityValue,
                                                            String alertIndexPattern, int windowDays)
            throws Exception {
        String entityField = resolveEntityField(entityType);
        String windowFrom = "now-" + windowDays + "d";

        SearchRequest request = SearchRequest.of(r -> r
            .index(alertIndexPattern)
            .size(0)
            .query(q -> q.bool(b -> b
                .filter(List.of(
                    Query.of(fq -> fq.term(t -> t.field(entityField)
                        .value(v -> v.stringValue(entityValue)))),
                    Query.of(fq -> fq.range(rng ->
                        rng.field("@timestamp").gte(JsonData.of(windowFrom))))
                ))
            ))
            .aggregations("by_technique", a -> a.terms(t ->
                t.field("mitre.technique.id").size(20)))
        );

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        Map<String, Object> result = new LinkedHashMap<>();
        Aggregate agg = response.aggregations().get("by_technique");
        if (agg != null && agg.isSterms()) {
            List<Map<String, Object>> techniques = new ArrayList<>();
            for (StringTermsBucket bucket : agg.sterms().buckets().array()) {
                Map<String, Object> tech = new LinkedHashMap<>();
                tech.put("id", bucket.key());
                tech.put("alertCount", bucket.docCount());
                techniques.add(tech);
            }
            result.put("techniques", techniques);
        }
        return result;
    }

    // =========================================================================
    // Section builders
    // =========================================================================

    /**
     * Builds the identity section from the entity document.
     */
    private Map<String, Object> buildIdentity(Map<String, Object> entityDoc, String entityId) {
        Map<String, Object> identity = new LinkedHashMap<>();
        identity.put("id", entityId);
        identity.put("type", entityDoc.get("type"));
        identity.put("value", entityDoc.get("value"));
        identity.put("displayName", entityDoc.getOrDefault("displayName", entityDoc.get("value")));
        identity.put("firstSeen", entityDoc.get("firstSeen"));
        identity.put("lastSeen", entityDoc.get("lastSeen"));
        identity.put("tags", entityDoc.getOrDefault("tags", List.of()));
        identity.put("criticality", entityDoc.getOrDefault("criticality", "medium"));
        identity.put("department", entityDoc.get("department"));
        identity.put("os", entityDoc.get("os"));
        identity.put("location", entityDoc.get("location"));
        return identity;
    }

    /**
     * Builds the risk profile section: score, level, trend, drivers, history (filtered to window).
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildRiskProfile(Map<String, Object> entityDoc, int windowDays) {
        Map<String, Object> riskProfile = new LinkedHashMap<>();
        riskProfile.put("score", entityDoc.getOrDefault("riskScore", 0));
        riskProfile.put("level", entityDoc.getOrDefault("riskLevel", "low"));
        riskProfile.put("trend", entityDoc.getOrDefault("riskTrend", "stable"));

        // Drivers from entity doc
        Object driversObj = entityDoc.get("risk_drivers");
        List<Map<String, Object>> drivers = new ArrayList<>();
        if (driversObj instanceof List<?> driverList) {
            for (Object d : driverList) {
                if (d instanceof Map<?, ?> driverMap) {
                    drivers.add(new LinkedHashMap<>((Map<String, Object>) driverMap));
                }
            }
        }
        riskProfile.put("drivers", drivers);

        // History from entity doc, filtered to window
        Object historyObj = entityDoc.get("risk_history");
        List<Map<String, Object>> history = new ArrayList<>();
        if (historyObj instanceof List<?> historyList) {
            LocalDate cutoff = LocalDate.now().minusDays(windowDays);
            for (Object h : historyList) {
                if (h instanceof Map<?, ?> historyMap) {
                    Map<String, Object> entry = new LinkedHashMap<>((Map<String, Object>) historyMap);
                    // Filter by date if the entry has a date field
                    Object dateObj = entry.get("date");
                    if (dateObj != null) {
                        try {
                            LocalDate entryDate = LocalDate.parse(dateObj.toString());
                            if (!entryDate.isBefore(cutoff)) {
                                history.add(entry);
                            }
                        } catch (Exception e) {
                            // If date can't be parsed, include it
                            history.add(entry);
                        }
                    } else {
                        history.add(entry);
                    }
                }
            }
        }
        riskProfile.put("history", history);

        return riskProfile;
    }

    /**
     * Builds the baseline section: metrics, deviations (computed), learningPeriod, lastUpdated.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildBaseline(Map<String, Object> entityDoc) {
        Map<String, Object> baseline = new LinkedHashMap<>();

        // Metrics from baseline_metrics field (map of name → {current, baseline, unit})
        Object metricsObj = entityDoc.get("baseline_metrics");
        List<Map<String, Object>> metrics = new ArrayList<>();
        List<Map<String, Object>> deviations = new ArrayList<>();

        if (metricsObj instanceof Map<?, ?> metricsMap) {
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) metricsMap).entrySet()) {
                String metricName = entry.getKey().toString();
                if (entry.getValue() instanceof Map<?, ?> metricData) {
                    Map<String, Object> data = (Map<String, Object>) metricData;

                    Number current = toNumber(data.get("current"));
                    Number baselineVal = toNumber(data.get("baseline"));
                    String unit = data.get("unit") != null ? data.get("unit").toString() : "count";

                    // Determine status from deviation
                    String status = "normal";
                    double deviationRatio = 0.0;
                    if (baselineVal.doubleValue() > 0) {
                        deviationRatio = (current.doubleValue() - baselineVal.doubleValue())
                            / baselineVal.doubleValue();
                    }

                    if (deviationRatio > 3.0) {
                        status = "critical_deviation";
                    } else if (deviationRatio > 1.5) {
                        status = "deviation";
                    }

                    Map<String, Object> metric = new LinkedHashMap<>();
                    metric.put("name", metricName);
                    metric.put("current", current);
                    metric.put("baseline", baselineVal);
                    metric.put("unit", unit);
                    metric.put("status", status);
                    metrics.add(metric);

                    // If significant deviation, add to deviations list
                    if (deviationRatio > 1.5) {
                        Map<String, Object> deviation = new LinkedHashMap<>();
                        deviation.put("metric", metricName);
                        deviation.put("deviation", Math.round(deviationRatio * 100.0) / 100.0);
                        deviation.put("direction", deviationRatio > 0 ? "above" : "below");
                        deviation.put("since", Instant.now().minus(1, ChronoUnit.DAYS).toString());
                        deviation.put("significance", deviationRatio > 3.0 ? "critical" : "high");
                        deviations.add(deviation);
                    }
                }
            }
        }

        baseline.put("metrics", metrics);
        baseline.put("deviations", deviations);

        // Learning period and lastUpdated from entity doc (or computed defaults)
        Object firstSeen = entityDoc.get("firstSeen");
        String learningPeriod = "";
        if (firstSeen != null) {
            try {
                String start = firstSeen.toString().substring(0, 10);
                String end = LocalDate.now().minusDays(14).format(DateTimeFormatter.ISO_LOCAL_DATE);
                learningPeriod = start + " to " + end;
            } catch (Exception e) {
                learningPeriod = "unknown";
            }
        }
        baseline.put("learningPeriod", learningPeriod);
        baseline.put("lastUpdated", entityDoc.getOrDefault("lastSeen", Instant.now().toString()));

        return baseline;
    }

    /**
     * Builds the source coverage section from the entity document's pre-computed source_coverage
     * field, enriched with aggregation data from logs.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildSourceCoverage(Map<String, Object> entityDoc,
                                                     Map<String, Object> sourceCoverageAgg) {
        Map<String, Object> coverage = new LinkedHashMap<>();

        // Prefer pre-computed source_coverage from entity doc
        Object coverageObj = entityDoc.get("source_coverage");
        if (coverageObj instanceof Map<?, ?> coverageMap) {
            Object sourcesObj = ((Map<?, ?>) coverageMap).get("sources");
            Object gapsObj = ((Map<?, ?>) coverageMap).get("gaps");

            List<Map<String, Object>> sources = new ArrayList<>();
            if (sourcesObj instanceof List<?> sourceList) {
                for (Object s : sourceList) {
                    if (s instanceof Map<?, ?> sourceMap) {
                        sources.add(new LinkedHashMap<>((Map<String, Object>) sourceMap));
                    }
                }
            }

            List<Map<String, Object>> gaps = new ArrayList<>();
            if (gapsObj instanceof List<?> gapList) {
                for (Object g : gapList) {
                    if (g instanceof Map<?, ?> gapMap) {
                        gaps.add(new LinkedHashMap<>((Map<String, Object>) gapMap));
                    }
                }
            }

            coverage.put("sources", sources);
            coverage.put("gaps", gaps);
        } else {
            // Fallback: build from aggregation results
            List<Map<String, Object>> sources = new ArrayList<>();
            Object aggSources = sourceCoverageAgg.get("aggSources");
            if (aggSources instanceof List<?> aggList) {
                for (Object item : aggList) {
                    if (item instanceof Map<?, ?> sourceMap) {
                        Map<String, Object> source = new LinkedHashMap<>((Map<String, Object>) sourceMap);
                        source.putIfAbsent("type", "unknown");
                        source.putIfAbsent("lastEvent", Instant.now().toString());
                        source.putIfAbsent("status", "active");
                        sources.add(source);
                    }
                }
            }
            coverage.put("sources", sources);
            coverage.put("gaps", List.of());
        }

        return coverage;
    }

    /**
     * Builds the attack techniques section from alert aggregation results.
     * Maps technique IDs to tactic IDs for heatmap generation.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildAttackTechniques(Map<String, Object> techniquesAgg) {
        Map<String, Object> attackSection = new LinkedHashMap<>();

        List<Map<String, Object>> techniques = new ArrayList<>();
        Map<String, Long> tacticsHeatmap = new LinkedHashMap<>();

        Object techsObj = techniquesAgg.get("techniques");
        if (techsObj instanceof List<?> techList) {
            for (Object item : techList) {
                if (item instanceof Map<?, ?> techMap) {
                    String techId = techMap.get("id") != null ? techMap.get("id").toString() : "";
                    long alertCount = techMap.get("alertCount") instanceof Number n
                        ? n.longValue() : 0;

                    String tactic = TECHNIQUE_TO_TACTIC.getOrDefault(techId, "TA0001");
                    String techName = TECHNIQUE_NAMES.getOrDefault(techId, techId);

                    Map<String, Object> technique = new LinkedHashMap<>();
                    technique.put("id", techId);
                    technique.put("name", techName);
                    technique.put("tactic", tactic);
                    technique.put("alertCount", alertCount);
                    technique.put("lastSeen", Instant.now().toString());
                    technique.put("confidence", 0.85 + (Math.min(alertCount, 10) * 0.01));
                    techniques.add(technique);

                    // Build heatmap
                    tacticsHeatmap.merge(tactic, alertCount, Long::sum);
                }
            }
        }

        attackSection.put("techniques", techniques);
        attackSection.put("tacticsHeatmap", tacticsHeatmap);

        return attackSection;
    }

    /**
     * Builds the summary section with template-based risk statement, recommended actions,
     * and investigation hints.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildSummary(Map<String, Object> entityDoc,
                                              Map<String, Object> riskProfile,
                                              Map<String, Object> baseline,
                                              String entityValue) {
        Map<String, Object> summary = new LinkedHashMap<>();

        String riskLevel = riskProfile.get("level") != null
            ? riskProfile.get("level").toString() : "low";
        String entityType = getStr(entityDoc, "type");

        // Get top driver description
        String topDriverDesc = "";
        Object driversObj = riskProfile.get("drivers");
        if (driversObj instanceof List<?> driverList && !driverList.isEmpty()) {
            Object first = driverList.get(0);
            if (first instanceof Map<?, ?> firstDriver) {
                Object desc = ((Map<?, ?>) firstDriver).get("description");
                if (desc != null) topDriverDesc = desc.toString();
            }
        }

        // Risk statement
        String riskStatement = buildRiskStatement(riskLevel, entityValue, topDriverDesc);
        summary.put("riskStatement", riskStatement);

        // Recommended actions
        List<String> recommendedActions = buildRecommendedActions(riskLevel);
        summary.put("recommendedActions", recommendedActions);

        // Investigation hints
        List<String> investigationHints = buildInvestigationHints(entityDoc, baseline);
        summary.put("investigationHints", investigationHints);

        return summary;
    }

    // =========================================================================
    // Summary template helpers
    // =========================================================================

    private String buildRiskStatement(String riskLevel, String entityValue, String topDriverDesc) {
        return switch (riskLevel) {
            case "critical" -> String.format(
                "Entity %s is at critical risk due to %s. Immediate investigation recommended.",
                entityValue,
                topDriverDesc.isEmpty() ? "multiple high-severity indicators" : topDriverDesc);
            case "high" -> String.format(
                "Entity %s shows elevated risk indicators: %s.",
                entityValue,
                topDriverDesc.isEmpty() ? "unusual activity detected" : topDriverDesc);
            case "medium" -> String.format(
                "Entity %s has moderate risk indicators. Monitor for escalation.",
                entityValue);
            default -> String.format(
                "Entity %s has low risk indicators. No immediate action required.",
                entityValue);
        };
    }

    private List<String> buildRecommendedActions(String riskLevel) {
        return switch (riskLevel) {
            case "critical" -> List.of(
                "Isolate from network",
                "Collect forensic evidence",
                "Review related entity activity");
            case "high" -> List.of(
                "Review recent activity timeline",
                "Check for lateral movement",
                "Verify baseline deviations");
            case "medium" -> List.of(
                "Monitor activity for changes",
                "Validate access patterns");
            default -> List.of(
                "Continue normal monitoring");
        };
    }

    @SuppressWarnings("unchecked")
    private List<String> buildInvestigationHints(Map<String, Object> entityDoc,
                                                  Map<String, Object> baseline) {
        List<String> hints = new ArrayList<>();

        // Hints from deviations
        Object deviationsObj = baseline.get("deviations");
        if (deviationsObj instanceof List<?> devList && !devList.isEmpty()) {
            for (Object d : devList) {
                if (d instanceof Map<?, ?> devMap) {
                    String metric = devMap.get("metric") != null ? devMap.get("metric").toString() : "";
                    Object devVal = devMap.get("deviation");
                    if (!metric.isEmpty()) {
                        hints.add(String.format("Investigate %s — %.1fx above baseline",
                            metric.replace("_", " "),
                            devVal instanceof Number n ? n.doubleValue() : 0.0));
                    }
                }
                if (hints.size() >= 2) break;
            }
        }

        // Hints from entity relationships (if tags suggest connections)
        Object tags = entityDoc.get("tags");
        if (tags instanceof List<?> tagList && !tagList.isEmpty()) {
            hints.add("Review entities sharing tags: " +
                tagList.stream().limit(3).map(Object::toString).collect(Collectors.joining(", ")));
        }

        if (hints.isEmpty()) {
            hints.add("Review recent authentication patterns for anomalies");
        }

        return hints;
    }

    // =========================================================================
    // Utility methods
    // =========================================================================

    /**
     * Resolves the entity field name used in OpenSearch queries based on entity type.
     */
    private String resolveEntityField(String entityType) {
        if (entityType == null) return "host.name.keyword";
        return switch (entityType) {
            case "host" -> "host.name.keyword";
            case "user" -> "user.name.keyword";
            case "ip" -> "source.ip";
            case "domain" -> "dns.question.name.keyword";
            default -> "host.name.keyword";
        };
    }

    /**
     * Resolves the effective window, capping at MAX_WINDOW_DAYS.
     */
    private int resolveWindow(Integer window) {
        if (window == null || window < 1) return DEFAULT_WINDOW_DAYS;
        return Math.min(window, MAX_WINDOW_DAYS);
    }

    /**
     * Safely extracts a string from a map.
     */
    private String getStr(Map<String, Object> map, String key) {
        Object val = map.get(key);
        return val != null ? val.toString() : "";
    }

    /**
     * Converts an object to a Number, defaulting to 0.
     */
    private Number toNumber(Object val) {
        if (val instanceof Number n) return n;
        if (val != null) {
            try {
                return Double.parseDouble(val.toString());
            } catch (NumberFormatException e) {
                // fall through
            }
        }
        return 0;
    }
}
