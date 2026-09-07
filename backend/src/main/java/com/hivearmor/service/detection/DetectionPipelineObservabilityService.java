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
 * DET-OBS-001 — thin aggregation of event-processor LoadReport / rule status.
 *
 * <p>STAGING CANDIDATE — surfaces EP health when reachable; otherwise returns
 * honest {@code unavailable} without inventing green metrics.
 */
@Service
public class DetectionPipelineObservabilityService {

    private static final Logger log = LoggerFactory.getLogger(DetectionPipelineObservabilityService.class);
    private static final String CLASSNAME = "DetectionPipelineObservabilityService";

    private static final String HONESTY =
        "STAGING CANDIDATE — pipeline health proxies event-processor /health and /api/rules/status "
            + "via INTERNAL_KEY. afterEvents miss counters require a live EP process.";

    private final EventProcessorManagerService eventProcessorManagerService;

    public DetectionPipelineObservabilityService(EventProcessorManagerService eventProcessorManagerService) {
        this.eventProcessorManagerService = eventProcessorManagerService;
    }

    public Map<String, Object> pipelineHealth() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("honesty", HONESTY);
        response.put("checkedAt", Instant.now().toString());
        response.put("indexPatternConstraint", "v3-hive-<type>-YYYY.MM.DD");

        try {
            Map<String, Object> health = eventProcessorManagerService.fetchHealth();
            Map<String, Object> status = eventProcessorManagerService.fetchRulesStatus();

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

            if (status != null) {
                response.put("activeRuleCount", status.get("count"));
                response.put("lastReload", status.get("lastReload"));
                response.put("afterEventsMisses", status.getOrDefault("afterEventsMisses", 0));
                response.put("afterEventsErrors", status.getOrDefault("afterEventsErrors", 0));
                response.put("correlationChecks", status.getOrDefault("correlationChecks", 0));
            }

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
            response.put("plugins", List.of());
            return response;
        }
    }
}
