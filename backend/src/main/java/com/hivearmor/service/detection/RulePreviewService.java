package com.hivearmor.service.detection;

import com.hivearmor.service.detection.CelDryRunEvaluator.DryRunResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * Service for detection rule preview execution (DET-011 / DET-PREV-001).
 *
 * <p>Honesty contract:
 * <ul>
 *   <li>{@code inject_dry_run} — evaluate injectable sample events in-process
 *       via {@link CelDryRunEvaluator}; {@code simulated=false}.</li>
 *   <li>{@code unavailable} — no injectable events and no OpenSearch historical
 *       path wired; never pretends OpenSearch returned empty matches.</li>
 * </ul>
 *
 * <p>OpenSearch historical preview ({@code opensearch_historical}) is deferred:
 * translating arbitrary CEL-like expressions into safe bounded queries is
 * non-trivial; when added it must set {@code mode}, {@code honesty}, and
 * {@code simulated} accurately.
 *
 * <p>Sprint 47 — Detection Rules. DET-PREV-001 STAGING CANDIDATE.
 */
@Service
public class RulePreviewService {

    private static final Logger log = LoggerFactory.getLogger(RulePreviewService.class);
    private static final String CLASSNAME = "RulePreviewService";

    /** Maximum time range for preview: 7 days. */
    private static final long MAX_PREVIEW_DAYS = 7;

    /** Maximum matches returned from preview. */
    private static final int MAX_MATCHES = 100;

    /** Maximum sample alerts to build. */
    private static final int MAX_SAMPLE_ALERTS = 5;

    private static final String HONESTY_INJECT =
        "Inject dry-run only — does not query OpenSearch historical indices. "
            + "engineParity=approximate (not full Go CEL).";

    private static final String HONESTY_UNAVAILABLE =
        "Preview unavailable: provide dryRunEvents (or sampleEvents) for inject dry-run. "
            + "OpenSearch historical preview is not wired; empty results are not simulated.";

    private final RuleValidationService validationService;
    private final DetectionRuleDryRunService dryRunService;

    public RulePreviewService(RuleValidationService validationService,
                              DetectionRuleDryRunService dryRunService) {
        this.validationService = validationService;
        this.dryRunService = dryRunService;
    }

    /**
     * Executes a preview of the rule definition.
     *
     * @param ruleDefinition   the rule definition to preview
     * @param from             start of time range (optional for inject dry-run)
     * @param to               end of time range (optional for inject dry-run)
     * @param limit            max matches to return
     * @param tenantIndexPattern tenant index pattern (reserved for future OS path)
     * @param dryRunEvents     injectable sample events (preferred honest path)
     * @return preview results including matches and honesty metadata
     * @throws IllegalArgumentException if validation fails
     */
    public Map<String, Object> preview(Map<String, Object> ruleDefinition,
                                       Instant from, Instant to,
                                       Integer limit, String tenantIndexPattern,
                                       List<Map<String, Object>> dryRunEvents) {
        // Step 1: Validate the rule first
        Map<String, Object> validation = validationService.validate(ruleDefinition);
        boolean valid = (boolean) validation.get("valid");

        if (!valid) {
            throw new IllegalArgumentException("Rule must pass validation before preview. Errors: "
                + validation.get("errors"));
        }

        int effectiveLimit = (limit != null && limit > 0) ? Math.min(limit, MAX_MATCHES) : MAX_MATCHES;
        List<Map<String, Object>> events = dryRunEvents != null ? dryRunEvents : List.of();

        // Preferred path: inject dry-run against provided sample events
        if (!events.isEmpty()) {
            return previewInjectDryRun(ruleDefinition, events, effectiveLimit, from, to, validation);
        }

        // Historical OpenSearch path is not implemented — refuse silent empty simulation
        if (from != null && to != null) {
            validateTimeRange(from, to);
        }

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
        response.put("honesty", HONESTY_UNAVAILABLE);
        response.put("simulated", false);
        response.put("evaluationMode", "unavailable");
        response.put("openSearchQueried", false);
        response.put("engineParity", "n/a");
        response.put("indexPattern", tenantIndexPattern);

        log.info("{}.preview: mode=unavailable (no dryRunEvents; OpenSearch historical not wired)",
            CLASSNAME);
        return response;
    }

    /**
     * Backward-compatible overload without dry-run events (returns unavailable honesty).
     */
    public Map<String, Object> preview(Map<String, Object> ruleDefinition,
                                       Instant from, Instant to,
                                       Integer limit, String tenantIndexPattern) {
        return preview(ruleDefinition, from, to, limit, tenantIndexPattern, List.of());
    }

    private Map<String, Object> previewInjectDryRun(Map<String, Object> ruleDefinition,
                                                    List<Map<String, Object>> events,
                                                    int limit,
                                                    Instant from, Instant to,
                                                    Map<String, Object> validation) {
        long startTime = System.currentTimeMillis();
        String expression = dryRunService.extractExpressionFromMap(ruleDefinition);

        List<Map<String, Object>> matches = new ArrayList<>();
        int scanned = 0;
        for (Map<String, Object> event : events) {
            if (matches.size() >= limit) {
                break;
            }
            scanned++;
            DryRunResult result = dryRunService.evaluateExpression(expression, event);
            if (result.matched()) {
                Map<String, Object> match = new LinkedHashMap<>();
                match.put("event", event);
                match.put("matchedFields", result.matchedFields());
                match.put("explanation", result.explanation());
                match.put("evaluationMode", result.evaluationMode());
                match.put("engineParity", result.engineParity());
                matches.add(match);
            }
        }
        long scanDuration = System.currentTimeMillis() - startTime;

        double hoursScanned = (from != null && to != null)
            ? (double) Duration.between(from, to).toHours() : 0.0;
        double estimatedAlertRate = hoursScanned > 0
            ? Math.round(((double) matches.size() / hoursScanned) * 100.0) / 100.0
            : 0.0;

        List<Map<String, Object>> sampleAlerts = buildSampleAlerts(ruleDefinition, matches);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("matches", matches);
        response.put("matchCount", matches.size());
        response.put("eventsScanned", scanned);
        response.put("scanDuration", scanDuration);
        response.put("estimatedAlertRate", estimatedAlertRate);
        response.put("hoursScanned", hoursScanned);
        response.put("sampleAlerts", sampleAlerts);
        if (from != null && to != null) {
            response.put("timeRange", Map.of("from", from.toString(), "to", to.toString()));
        }
        response.put("validation", validation);
        response.put("mode", "inject_dry_run");
        response.put("honesty", HONESTY_INJECT);
        response.put("simulated", false);
        response.put("evaluationMode", CelDryRunEvaluator.EVALUATION_MODE);
        response.put("openSearchQueried", false);
        response.put("engineParity", CelDryRunEvaluator.ENGINE_PARITY);

        log.info("{}.preview: mode=inject_dry_run matches={} scanned={} duration={}ms",
            CLASSNAME, matches.size(), scanned, scanDuration);
        return response;
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

    /**
     * Builds sample alert documents from preview matches.
     */
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
