package com.hivearmor.service.detection;

import com.hivearmor.event_processor.EventProcessorManagerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * DET-OBS-001 / DET-SLO-001 / DET-INDEX-001b — thin aggregation of event-processor
 * LoadReport, ingest→alert SLO, and afterEvents miss counters.
 *
 * <p>STAGING CANDIDATE — surfaces EP health when reachable; otherwise returns
 * honest {@code unavailable} without inventing green metrics or zero counters.
 */
@Service
public class DetectionPipelineObservabilityService {

    private static final Logger log = LoggerFactory.getLogger(DetectionPipelineObservabilityService.class);
    private static final String CLASSNAME = "DetectionPipelineObservabilityService";
    private static final String INDEX_PATTERN = "v3-hive-<type>-YYYY.MM.DD";

    private static final String HONESTY =
        "STAGING CANDIDATE — pipeline health proxies event-processor /health and /api/rules/status "
            + "via INTERNAL_KEY. Ingest→alert p50/p95 is measured at persist-required; afterEvents "
            + "miss counters are live EP atomics. Missing keys stay null — never invented zeros.";

    private static final String SLO_UNAVAILABLE =
        "STAGING CANDIDATE — ingest→alert latency is not measurable (event-processor unreachable "
            + "or no persisted alerts with a parseable @timestamp).";

    private final EventProcessorManagerService eventProcessorManagerService;

    public DetectionPipelineObservabilityService(EventProcessorManagerService eventProcessorManagerService) {
        this.eventProcessorManagerService = eventProcessorManagerService;
    }

    public Map<String, Object> pipelineHealth() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("honesty", HONESTY);
        response.put("checkedAt", Instant.now().toString());
        response.put("indexPatternConstraint", INDEX_PATTERN);

        try {
            Map<String, Object> health = eventProcessorManagerService.fetchHealth();
            Map<String, Object> status = eventProcessorManagerService.fetchRulesStatus();
            if (status == null) {
                status = Map.of();
            }

            response.put("available", true);
            response.put("mode", "event_processor");
            response.put("status", health.getOrDefault("status", "unknown"));
            response.put("service", health.getOrDefault("service", "hivearmor-event-processor"));
            response.put("injectEnabled", health.get("inject"));
            response.put("plugins", health.get("plugins"));

            Object rules = health.get("rules");
            if (rules instanceof Map<?, ?> report) {
                Map<String, Object> loadReport = new LinkedHashMap<>();
                loadReport.put("loaded", report.get("loaded"));
                loadReport.put("skipped", report.get("skipped"));
                loadReport.put("invalid", report.get("invalid"));
                loadReport.put("pilotPackOk", report.get("pilotPackOk"));
                loadReport.put("pilotMissing", report.get("pilotMissing"));
                loadReport.put("lastLoad", report.get("lastLoad"));
                response.put("loadReport", loadReport);
            } else {
                response.put("loadReport", null);
            }

            // Prefer /api/rules/status; fall back to /health for the same keys.
            response.put("activeRuleCount", firstPresent(status, health, "count"));
            response.put("lastReload", status.get("lastReload"));
            putNullableCounter(response, status, health, "afterEventsMisses");
            putNullableCounter(response, status, health, "afterEventsErrors");
            putNullableCounter(response, status, health, "correlationChecks");
            putNullableCounter(response, status, health, "exceptionsSuppressed");
            putNullableCounter(response, status, health, "activeExceptions");
            response.put("exceptionsLastLoad", status.get("exceptionsLastLoad"));
            putNullableCounter(response, status, health, "afterEventsMissRate");
            Object missRateAvailable = firstPresent(status, health, "afterEventsMissRateAvailable");
            response.put("afterEventsMissRateAvailable", missRateAvailable instanceof Boolean ? missRateAvailable : null);

            response.put("ingestAlertSlo", copyIngestAlertSlo(firstPresent(status, health, "ingestAlertSlo")));
            return response;
        } catch (Exception e) {
            log.warn("{}.pipelineHealth: event-processor unreachable: {}", CLASSNAME, e.getMessage());
            response.put("available", false);
            response.put("mode", "unavailable");
            response.put("status", "unavailable");
            response.put("error", e.getMessage());
            response.put("loadReport", null);
            response.put("activeRuleCount", null);
            response.put("afterEventsMisses", null);
            response.put("afterEventsErrors", null);
            response.put("correlationChecks", null);
            response.put("afterEventsMissRate", null);
            response.put("afterEventsMissRateAvailable", false);
            response.put("exceptionsSuppressed", null);
            response.put("activeExceptions", null);
            response.put("exceptionsLastLoad", null);
            response.put("ingestAlertSlo", unavailableSlo());
            response.put("plugins", List.of());
            return response;
        }
    }

    private static void putNullableCounter(
        Map<String, Object> response,
        Map<String, Object> status,
        Map<String, Object> health,
        String key
    ) {
        Object value = firstPresent(status, health, key);
        response.put(key, value instanceof Number ? value : null);
    }

    private static Object firstPresent(Map<String, Object> primary, Map<String, Object> fallback, String key) {
        if (primary != null && primary.containsKey(key) && primary.get(key) != null) {
            return primary.get(key);
        }
        if (fallback != null && fallback.containsKey(key) && fallback.get(key) != null) {
            return fallback.get(key);
        }
        return null;
    }

    private static Map<String, Object> copyIngestAlertSlo(Object raw) {
        Map<String, Object> slo = new LinkedHashMap<>();
        slo.put("targetP95Ms", 60_000);
        slo.put("window", "last_1024_alert_persists");
        slo.put("indexPatternConstraint", INDEX_PATTERN);
        if (!(raw instanceof Map<?, ?> source)) {
            return unavailableSlo();
        }
        Object available = source.get("available");
        boolean isAvailable = Boolean.TRUE.equals(available);
        slo.put("available", isAvailable);
        slo.put("sampleCount", source.get("sampleCount"));
        slo.put("p50Ms", isAvailable ? source.get("p50Ms") : null);
        slo.put("p95Ms", isAvailable ? source.get("p95Ms") : null);
        slo.put("breached", isAvailable ? source.get("breached") : null);
        slo.put("skippedUnmeasurable", source.get("skippedUnmeasurable"));
        Object honesty = source.get("honesty");
        slo.put("honesty", honesty instanceof String ? honesty : (isAvailable ? HONESTY : SLO_UNAVAILABLE));
        if (source.get("targetP95Ms") instanceof Number target) {
            slo.put("targetP95Ms", target);
        }
        if (source.get("window") instanceof String window) {
            slo.put("window", window);
        }
        return slo;
    }

    private static Map<String, Object> unavailableSlo() {
        Map<String, Object> slo = new LinkedHashMap<>();
        slo.put("available", false);
        slo.put("sampleCount", 0);
        slo.put("p50Ms", null);
        slo.put("p95Ms", null);
        slo.put("targetP95Ms", 60_000);
        slo.put("breached", null);
        slo.put("skippedUnmeasurable", null);
        slo.put("window", "last_1024_alert_persists");
        slo.put("honesty", SLO_UNAVAILABLE);
        slo.put("indexPatternConstraint", INDEX_PATTERN);
        return slo;
    }
}
