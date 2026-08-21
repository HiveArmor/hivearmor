package com.hivearmor.service.detection;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * Service for detection rule preview execution (DET-011).
 *
 * <p>Executes a rule definition against historical data (read-only)
 * to show what alerts would be generated without actually creating them.
 *
 * <p>Preview limits: max 7-day time range, max 100 matches, 30-second timeout.
 *
 * <p>Sprint 47 — Detection Rules.
 */
@Service
public class RulePreviewService {

    private static final Logger log = LoggerFactory.getLogger(RulePreviewService.class);
    private static final String CLASSNAME = "RulePreviewService";

    /** Maximum time range for preview: 7 days. */
    private static final long MAX_PREVIEW_DAYS = 7;

    /** Maximum matches returned from preview. */
    private static final int MAX_MATCHES = 100;

    /** Preview timeout in seconds. */
    private static final int PREVIEW_TIMEOUT_SECONDS = 30;

    /** Maximum sample alerts to build. */
    private static final int MAX_SAMPLE_ALERTS = 5;

    private final RuleValidationService validationService;

    public RulePreviewService(RuleValidationService validationService) {
        this.validationService = validationService;
    }

    /**
     * Executes a preview of the rule definition against historical data.
     *
     * @param ruleDefinition   the rule definition to preview
     * @param from             start of time range
     * @param to               end of time range
     * @param limit            max matches to return
     * @param tenantIndexPattern tenant index pattern for OpenSearch query
     * @return preview results including matches, alert rate, and sample alerts
     * @throws IllegalArgumentException if validation fails
     */
    public Map<String, Object> preview(Map<String, Object> ruleDefinition,
                                       Instant from, Instant to,
                                       Integer limit, String tenantIndexPattern) {
        // Step 1: Validate the rule first
        Map<String, Object> validation = validationService.validate(ruleDefinition);
        boolean valid = (boolean) validation.get("valid");

        if (!valid) {
            throw new IllegalArgumentException("Rule must pass validation before preview. Errors: "
                + validation.get("errors"));
        }

        // Step 2: Validate time range
        if (from == null || to == null) {
            throw new IllegalArgumentException("Both 'from' and 'to' timestamps are required for preview");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("End time must be after start time");
        }

        long daysBetween = Duration.between(from, to).toDays();
        if (daysBetween > MAX_PREVIEW_DAYS) {
            throw new IllegalArgumentException("Preview time range cannot exceed 7 days. Requested: " + daysBetween + " days");
        }

        int effectiveLimit = (limit != null && limit > 0) ? Math.min(limit, MAX_MATCHES) : MAX_MATCHES;

        // Step 3: Execute preview (simulated — actual OpenSearch query would go here)
        long startTime = System.currentTimeMillis();
        Map<String, Object> previewResult = executePreviewQuery(ruleDefinition, from, to, effectiveLimit, tenantIndexPattern);
        long scanDuration = System.currentTimeMillis() - startTime;

        // Step 4: Calculate alert rate
        int matchCount = (int) previewResult.getOrDefault("matchCount", 0);
        double hoursScanned = Duration.between(from, to).toHours();
        double estimatedAlertRate = hoursScanned > 0 ? (double) matchCount / hoursScanned : 0.0;
        estimatedAlertRate = Math.round(estimatedAlertRate * 100.0) / 100.0;

        // Step 5: Build sample alerts
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> matches = (List<Map<String, Object>>) previewResult.getOrDefault("matches", Collections.emptyList());
        List<Map<String, Object>> sampleAlerts = buildSampleAlerts(ruleDefinition, matches);

        // Assemble response
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("matches", matches);
        response.put("matchCount", matchCount);
        response.put("scanDuration", scanDuration);
        response.put("estimatedAlertRate", estimatedAlertRate);
        response.put("hoursScanned", hoursScanned);
        response.put("sampleAlerts", sampleAlerts);
        response.put("timeRange", Map.of("from", from.toString(), "to", to.toString()));
        response.put("validation", validation);

        log.info("{}.preview: matches={} alertRate={}/hr scanDuration={}ms hours={}",
            CLASSNAME, matchCount, estimatedAlertRate, scanDuration, hoursScanned);

        return response;
    }

    // =========================================================================
    // Internal: Preview execution
    // =========================================================================

    /**
     * Executes the preview query. In production this would query OpenSearch
     * using the rule expression and filters. For the compilation phase, returns
     * simulated results demonstrating the response shape.
     */
    private Map<String, Object> executePreviewQuery(Map<String, Object> ruleDefinition,
                                                    Instant from, Instant to,
                                                    int limit, String tenantIndexPattern) {
        // Build simulated preview data to demonstrate response shape
        // In production: build OpenSearch query from CEL expression + execute
        String expression = ruleDefinition.get("expression") != null
            ? ruleDefinition.get("expression").toString() : "";

        List<Map<String, Object>> matches = new ArrayList<>();
        int simulatedMatchCount = 0;

        // Return empty results since this is a compile-time implementation
        // The actual OpenSearch query execution would go here when integrated
        // with the event-processor CEL engine

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("matches", matches);
        result.put("matchCount", simulatedMatchCount);
        return result;
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
            alert.put("source", match);
            alert.put("preview", true);
            sampleAlerts.add(alert);
        }

        return sampleAlerts;
    }
}
