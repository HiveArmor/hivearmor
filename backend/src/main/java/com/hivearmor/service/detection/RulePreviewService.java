package com.hivearmor.service.detection;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.detection.CelDryRunEvaluator.DryRunResult;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * Service for detection rule preview execution (DET-011 / DET-PREV-001).
 *
 * <p>Honesty contract — modes:
 * <ul>
 *   <li>{@code inject} — evaluate injectable sample events via {@link CelDryRunEvaluator}</li>
 *   <li>{@code opensearch} — fetch bounded historical events from {@code v3-hive-log-*} then
 *       evaluate with approximate CEL; never reports empty success when OpenSearch fails</li>
 *   <li>{@code unavailable} — honest failure when neither path can run</li>
 * </ul>
 *
 * <p>STAGING CANDIDATE — OpenSearch path uses Java CEL approx, not Go event-processor parity.
 */
@Service
public class RulePreviewService {

    private static final Logger log = LoggerFactory.getLogger(RulePreviewService.class);
    private static final String CLASSNAME = "RulePreviewService";

    private static final long MAX_PREVIEW_DAYS = 7;
    private static final int MAX_MATCHES = 100;
    private static final int MAX_SAMPLE_ALERTS = 5;
    private static final int MAX_OS_FETCH = 100;

    private static final String HONESTY_INJECT =
        "Inject dry-run only — does not query OpenSearch historical indices. "
            + "engineParity=approximate (not full Go CEL). ";

    private static final String HONESTY_OPENSEARCH =
        "STAGING CANDIDATE — bounded OpenSearch historical fetch from v3-hive-log-* "
            + "then approximate Java CEL dry-run (not full Go event-processor parity). "
            + "No alerts were created. ";

    private static final String HONESTY_UNAVAILABLE =
        "Preview unavailable: provide dryRunEvents for inject mode, or choose opensearch "
            + "when OpenSearch is reachable. Empty results are never simulated as success. "
            + "exceptionsApplied=false.";

    private final RuleValidationService validationService;
    private final DetectionRuleDryRunService dryRunService;
    private final DetectionExceptionService exceptionService;
    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;

    public RulePreviewService(RuleValidationService validationService,
                              DetectionRuleDryRunService dryRunService,
                              DetectionExceptionService exceptionService,
                              OpensearchClientBuilder osClient,
                              MsspIndexResolver indexResolver) {
        this.validationService = validationService;
        this.dryRunService = dryRunService;
        this.exceptionService = exceptionService;
        this.osClient = osClient;
        this.indexResolver = indexResolver;
    }

    /**
     * @param previewMode {@code inject}, {@code opensearch}, or {@code auto} (inject if events else OS)
     */
    public Map<String, Object> preview(Map<String, Object> ruleDefinition,
                                       Instant from, Instant to,
                                       Integer limit, String tenantIndexPattern,
                                       List<Map<String, Object>> dryRunEvents,
                                       String previewMode) {
        Map<String, Object> validation = validationService.validate(ruleDefinition);
        boolean valid = (boolean) validation.get("valid");
        if (!valid) {
            throw new IllegalArgumentException("Rule must pass validation before preview. Errors: "
                + validation.get("errors"));
        }

        int effectiveLimit = (limit != null && limit > 0) ? Math.min(limit, MAX_MATCHES) : MAX_MATCHES;
        List<Map<String, Object>> events = dryRunEvents != null ? dryRunEvents : List.of();
        String mode = normalizeMode(previewMode);

        if ("inject".equals(mode) || ("auto".equals(mode) && !events.isEmpty())) {
            if (events.isEmpty()) {
                return unavailable(validation, from, to, tenantIndexPattern,
                    "Inject mode requires dryRunEvents (or sampleEvents).");
            }
            return previewInjectDryRun(ruleDefinition, events, effectiveLimit, from, to, validation);
        }

        if ("opensearch".equals(mode) || "auto".equals(mode)) {
            Instant effectiveFrom = from != null ? from : Instant.now().minus(Duration.ofHours(4));
            Instant effectiveTo = to != null ? to : Instant.now();
            validateTimeRange(effectiveFrom, effectiveTo);
            String indexPattern = tenantIndexPattern != null && !tenantIndexPattern.isBlank()
                ? tenantIndexPattern
                : indexResolver.resolveIndexPattern("log");
            return previewOpenSearch(ruleDefinition, effectiveFrom, effectiveTo,
                effectiveLimit, indexPattern, validation);
        }

        return unavailable(validation, from, to, tenantIndexPattern, HONESTY_UNAVAILABLE);
    }

    public Map<String, Object> preview(Map<String, Object> ruleDefinition,
                                       Instant from, Instant to,
                                       Integer limit, String tenantIndexPattern,
                                       List<Map<String, Object>> dryRunEvents) {
        return preview(ruleDefinition, from, to, limit, tenantIndexPattern, dryRunEvents, "auto");
    }

    public Map<String, Object> preview(Map<String, Object> ruleDefinition,
                                       Instant from, Instant to,
                                       Integer limit, String tenantIndexPattern) {
        return preview(ruleDefinition, from, to, limit, tenantIndexPattern, List.of(), "auto");
    }

    private Map<String, Object> previewOpenSearch(Map<String, Object> ruleDefinition,
                                                  Instant from, Instant to,
                                                  int limit,
                                                  String indexPattern,
                                                  Map<String, Object> validation) {
        long startTime = System.currentTimeMillis();
        List<Map<String, Object>> fetched;
        try {
            fetched = fetchHistoricalEvents(indexPattern, from, to, Math.min(limit, MAX_OS_FETCH));
        } catch (Exception e) {
            log.warn("{}.previewOpenSearch: OpenSearch unavailable index={} error={}",
                CLASSNAME, indexPattern, e.getMessage());
            Map<String, Object> response = unavailable(validation, from, to, indexPattern,
                "OpenSearch historical preview unavailable: " + e.getMessage()
                    + ". Index pattern remains version-locked (v3-hive-log-*).");
            response.put("requestedMode", "opensearch");
            response.put("openSearchError", e.getMessage());
            return response;
        }

        String expression = dryRunService.extractExpressionFromMap(ruleDefinition);
        String ruleId = DetectionExceptionService.extractRuleId(ruleDefinition, null);
        DetectionExceptionConsideration lastConsideration = exceptionService.consider(ruleId, Map.of());
        List<Map<String, Object>> matches = new ArrayList<>();
        List<Map<String, Object>> suppressedMatches = new ArrayList<>();
        int scanned = 0;
        for (Map<String, Object> event : fetched) {
            if (matches.size() >= limit) {
                break;
            }
            scanned++;
            DryRunResult result = dryRunService.evaluateExpression(expression, event);
            if (!result.matched()) {
                continue;
            }
            DetectionExceptionConsideration consideration = exceptionService.consider(ruleId, event);
            lastConsideration = consideration;
            Map<String, Object> match = new LinkedHashMap<>();
            match.put("event", event);
            match.put("matchedFields", result.matchedFields());
            match.put("explanation", result.explanation());
            match.put("evaluationMode", result.evaluationMode());
            match.put("engineParity", result.engineParity());
            match.put("suppressed", consideration.suppressed());
            match.put("matchingExceptionId", consideration.matchingExceptionId());
            if (consideration.suppressed()) {
                suppressedMatches.add(match);
            } else {
                matches.add(match);
            }
        }
        long scanDuration = System.currentTimeMillis() - startTime;
        double hoursScanned = (double) Duration.between(from, to).toHours();
        double estimatedAlertRate = hoursScanned > 0
            ? Math.round(((double) matches.size() / hoursScanned) * 100.0) / 100.0
            : 0.0;

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("matches", matches);
        response.put("suppressedMatches", suppressedMatches);
        response.put("matchCount", matches.size());
        response.put("eventsScanned", scanned);
        response.put("eventsFetched", fetched.size());
        response.put("scanDuration", scanDuration);
        response.put("estimatedAlertRate", estimatedAlertRate);
        response.put("hoursScanned", hoursScanned);
        response.put("sampleAlerts", buildSampleAlerts(ruleDefinition, matches));
        response.put("timeRange", Map.of("from", from.toString(), "to", to.toString()));
        response.put("validation", validation);
        response.put("mode", "opensearch");
        response.put("honesty", HONESTY_OPENSEARCH + lastConsideration.honesty());
        response.put("simulated", false);
        response.put("evaluationMode", "opensearch_historical_approx");
        response.put("openSearchQueried", true);
        response.put("engineParity", CelDryRunEvaluator.ENGINE_PARITY);
        response.put("exceptionsApplied", lastConsideration.exceptionsApplied());
        response.put("exceptionsSuppressedCount", suppressedMatches.size());
        response.put("indexPattern", indexPattern);

        log.info("{}.preview: mode=opensearch matches={} suppressed={} scanned={} fetched={} duration={}ms index={}",
            CLASSNAME, matches.size(), suppressedMatches.size(), scanned, fetched.size(), scanDuration, indexPattern);
        return response;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchHistoricalEvents(String indexPattern,
                                                            Instant from,
                                                            Instant to,
                                                            int size) throws Exception {
        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .size(size)
            .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
            .query(Query.of(q -> q.range(rng -> rng
                .field("@timestamp")
                .gte(JsonData.of(from.toString()))
                .lte(JsonData.of(to.toString()))
            ))));

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
        List<Map<String, Object>> events = new ArrayList<>();
        for (Hit<Map> hit : response.hits().hits()) {
            Map<String, Object> source = hit.source();
            if (source == null) {
                continue;
            }
            Map<String, Object> event = new LinkedHashMap<>();
            source.forEach((key, value) -> event.put(String.valueOf(key), value));
            if (hit.id() != null) {
                event.putIfAbsent("_id", hit.id());
            }
            events.add(event);
        }
        return events;
    }

    private Map<String, Object> previewInjectDryRun(Map<String, Object> ruleDefinition,
                                                    List<Map<String, Object>> events,
                                                    int limit,
                                                    Instant from, Instant to,
                                                    Map<String, Object> validation) {
        long startTime = System.currentTimeMillis();
        String expression = dryRunService.extractExpressionFromMap(ruleDefinition);
        String ruleId = DetectionExceptionService.extractRuleId(ruleDefinition, null);
        DetectionExceptionConsideration lastConsideration = exceptionService.consider(ruleId, Map.of());

        List<Map<String, Object>> matches = new ArrayList<>();
        List<Map<String, Object>> suppressedMatches = new ArrayList<>();
        int scanned = 0;
        for (Map<String, Object> event : events) {
            if (matches.size() >= limit) {
                break;
            }
            scanned++;
            DryRunResult result = dryRunService.evaluateExpression(expression, event);
            DetectionExceptionConsideration consideration = exceptionService.consider(ruleId, event);
            lastConsideration = consideration;
            if (!result.matched()) {
                continue;
            }
            Map<String, Object> match = new LinkedHashMap<>();
            match.put("event", event);
            match.put("matchedFields", result.matchedFields());
            match.put("explanation", result.explanation());
            match.put("evaluationMode", result.evaluationMode());
            match.put("engineParity", result.engineParity());
            match.put("suppressed", consideration.suppressed());
            match.put("matchingExceptionId", consideration.matchingExceptionId());
            match.put("matchingExceptionTitle", consideration.matchingExceptionTitle());
            if (consideration.suppressed()) {
                suppressedMatches.add(match);
            } else {
                matches.add(match);
            }
        }
        long scanDuration = System.currentTimeMillis() - startTime;

        double hoursScanned = (from != null && to != null)
            ? (double) Duration.between(from, to).toHours() : 0.0;
        double estimatedAlertRate = hoursScanned > 0
            ? Math.round(((double) matches.size() / hoursScanned) * 100.0) / 100.0
            : 0.0;

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("matches", matches);
        response.put("suppressedMatches", suppressedMatches);
        response.put("matchCount", matches.size());
        response.put("eventsScanned", scanned);
        response.put("scanDuration", scanDuration);
        response.put("estimatedAlertRate", estimatedAlertRate);
        response.put("hoursScanned", hoursScanned);
        response.put("sampleAlerts", buildSampleAlerts(ruleDefinition, matches));
        if (from != null && to != null) {
            response.put("timeRange", Map.of("from", from.toString(), "to", to.toString()));
        }
        response.put("validation", validation);
        response.put("mode", "inject");
        response.put("honesty", HONESTY_INJECT + lastConsideration.honesty());
        response.put("simulated", false);
        response.put("evaluationMode", CelDryRunEvaluator.EVALUATION_MODE);
        response.put("openSearchQueried", false);
        response.put("engineParity", CelDryRunEvaluator.ENGINE_PARITY);
        response.put("exceptionsApplied", lastConsideration.exceptionsApplied());
        response.put("exceptionsSuppressedCount", suppressedMatches.size());

        log.info("{}.preview: mode=inject matches={} suppressed={} scanned={} duration={}ms",
            CLASSNAME, matches.size(), suppressedMatches.size(), scanned, scanDuration);
        return response;
    }

    private Map<String, Object> unavailable(Map<String, Object> validation,
                                            Instant from, Instant to,
                                            String indexPattern,
                                            String honesty) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("matches", List.of());
        response.put("matchCount", 0);
        response.put("scanDuration", 0L);
        response.put("estimatedAlertRate", 0.0);
        response.put("hoursScanned", from != null && to != null
            ? (double) Duration.between(from, to).toHours() : 0.0);
        response.put("sampleAlerts", List.of());
        if (from != null && to != null) {
            response.put("timeRange", Map.of("from", from.toString(), "to", to.toString()));
        }
        response.put("validation", validation);
        response.put("mode", "unavailable");
        response.put("honesty", honesty);
        response.put("simulated", false);
        response.put("evaluationMode", "unavailable");
        response.put("openSearchQueried", false);
        response.put("engineParity", "n/a");
        response.put("exceptionsApplied", false);
        response.put("indexPattern", indexPattern);
        response.put("available", false);
        return response;
    }

    private static String normalizeMode(String previewMode) {
        if (previewMode == null || previewMode.isBlank()) {
            return "auto";
        }
        String normalized = previewMode.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "inject", "inject_dry_run" -> "inject";
            case "opensearch", "opensearch_historical" -> "opensearch";
            case "auto" -> "auto";
            default -> "auto";
        };
    }

    private void validateTimeRange(Instant from, Instant to) {
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("End time must be after start time");
        }
        long daysBetween = Duration.between(from, to).toDays();
        if (daysBetween > MAX_PREVIEW_DAYS) {
            throw new IllegalArgumentException(
                "Preview time range cannot exceed 7 days. Requested: " + daysBetween + " days");
        }
    }

    private List<Map<String, Object>> buildSampleAlerts(Map<String, Object> ruleDefinition,
                                                        List<Map<String, Object>> matches) {
        List<Map<String, Object>> sampleAlerts = new ArrayList<>();
        int count = Math.min(matches.size(), MAX_SAMPLE_ALERTS);
        String ruleName = ruleDefinition.get("name") != null
            ? ruleDefinition.get("name").toString() : "Unnamed Rule";
        String severity = ruleDefinition.get("severity") != null
            ? ruleDefinition.get("severity").toString() : "medium";

        for (int i = 0; i < count; i++) {
            Map<String, Object> match = matches.get(i);
            Map<String, Object> alert = new LinkedHashMap<>();
            alert.put("id", "preview-alert-" + UUID.randomUUID().toString().substring(0, 8));
            alert.put("name", ruleName);
            alert.put("severity", severity);
            alert.put("timestamp", Instant.now().toString());
            alert.put("source", match.getOrDefault("event", match));
            alert.put("preview", true);
            alert.put("simulated", false);
            sampleAlerts.add(alert);
        }
        return sampleAlerts;
    }
}
