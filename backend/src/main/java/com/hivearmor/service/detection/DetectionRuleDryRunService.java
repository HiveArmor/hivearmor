package com.hivearmor.service.detection;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.detection.CelDryRunEvaluator.DryRunResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Extracts a detection expression from rule JSON/YAML definitions and evaluates
 * it via {@link CelDryRunEvaluator} against injectable sample events.
 *
 * <p>DET-TEST-001 — STAGING CANDIDATE.
 */
@Service
public class DetectionRuleDryRunService {

    private static final Logger log = LoggerFactory.getLogger(DetectionRuleDryRunService.class);
    private static final String CLASSNAME = "DetectionRuleDryRunService";

    private final ObjectMapper objectMapper;

    public DetectionRuleDryRunService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Evaluates a rule definition document (JSON string or YAML) against a sample event JSON string.
     */
    public DryRunResult evaluateRuleDefinition(String ruleDefinition, String eventJson) {
        Map<String, Object> event = parseEvent(eventJson);
        String expression = extractExpression(ruleDefinition);
        return CelDryRunEvaluator.evaluate(expression, event);
    }

    /**
     * Evaluates an already-extracted expression against an event map.
     */
    public DryRunResult evaluateExpression(String expression, Map<String, Object> event) {
        return CelDryRunEvaluator.evaluate(expression, event);
    }

    /**
     * Evaluates a rule definition map (modern detection-rule shape) against an event map.
     */
    public DryRunResult evaluateRuleMap(Map<String, Object> ruleDefinition, Map<String, Object> event) {
        String expression = extractExpressionFromMap(ruleDefinition);
        return CelDryRunEvaluator.evaluate(expression, event);
    }

    /**
     * Parses event JSON into a map. Throws {@link IllegalArgumentException} on bad JSON.
     */
    public Map<String, Object> parseEvent(String eventJson) {
        if (eventJson == null || eventJson.isBlank()) {
            throw new IllegalArgumentException(
                "Sample event JSON is required for inject dry-run "
                    + "(provide eventJson, sampleEvent, or testEventJson)");
        }
        try {
            return objectMapper.readValue(eventJson, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid sample event JSON: " + e.getMessage(), e);
        }
    }

    /**
     * Extracts the CEL-like expression from a rule definition string (JSON preferred, YAML fallback).
     */
    public String extractExpression(String ruleDefinition) {
        if (ruleDefinition == null || ruleDefinition.isBlank()) {
            return "";
        }
        String trimmed = ruleDefinition.trim();
        try {
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                Map<String, Object> map = objectMapper.readValue(
                    trimmed, new TypeReference<Map<String, Object>>() {});
                return extractExpressionFromMap(map);
            }
        } catch (Exception jsonEx) {
            log.debug("{}.extractExpression: JSON parse failed, trying YAML: {}",
                CLASSNAME, jsonEx.getMessage());
        }
        try {
            Yaml yaml = new Yaml();
            Object parsed = yaml.load(trimmed);
            if (parsed instanceof Map<?, ?> raw) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) raw;
                return extractExpressionFromMap(map);
            }
        } catch (Exception yamlEx) {
            log.debug("{}.extractExpression: YAML parse failed: {}", CLASSNAME, yamlEx.getMessage());
        }
        // Treat bare expression string as the expression itself
        if (looksLikeExpression(trimmed)) {
            return trimmed;
        }
        return "";
    }

    /**
     * Pulls expression from common keys: expression, where, ruleExpression.
     */
    public String extractExpressionFromMap(Map<String, Object> map) {
        if (map == null || map.isEmpty()) {
            return "";
        }
        for (String key : List.of("expression", "where", "ruleExpression")) {
            Object val = map.get(key);
            if (val != null && !String.valueOf(val).isBlank()) {
                return String.valueOf(val).trim();
            }
        }
        // Nested definition object
        Object definition = map.get("definition");
        if (definition instanceof Map<?, ?> nested) {
            @SuppressWarnings("unchecked")
            Map<String, Object> nestedMap = (Map<String, Object>) nested;
            return extractExpressionFromMap(nestedMap);
        }
        if (definition instanceof String defStr && !defStr.isBlank()) {
            return extractExpression(defStr);
        }
        return "";
    }

    /**
     * Builds a response map with honesty flags for API surfaces that return Map payloads.
     */
    public Map<String, Object> toHonestyPayload(DryRunResult result) {
        return toHonestyPayload(result, DetectionExceptionConsideration.notApplied(
            "Active exceptions were not considered."));
    }

    /**
     * Honesty payload including exception consideration (DET-FP dry-run).
     *
     * <p>{@code matched} remains the CEL expression result so the UI can show
     * match-but-suppressed. {@code wouldAlert} is the engine-equivalent fire signal.
     */
    public Map<String, Object> toHonestyPayload(DryRunResult result,
                                                DetectionExceptionConsideration consideration) {
        DetectionExceptionConsideration applied = consideration != null
            ? consideration
            : DetectionExceptionConsideration.notApplied("Active exceptions were not considered.");
        boolean suppressed = result.matched() && applied.suppressed();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("matched", result.matched());
        payload.put("wouldAlert", result.matched() && !suppressed);
        payload.put("suppressed", suppressed);
        payload.put("matchedFields", result.matchedFields());
        String explanation = result.explanation();
        if (suppressed) {
            String title = applied.matchingExceptionTitle() != null
                ? applied.matchingExceptionTitle() : "active exception";
            explanation = explanation + " Suppressed by exception #"
                + applied.matchingExceptionId() + " (" + title + "). No alert would be created.";
        }
        payload.put("explanation", explanation);
        payload.put("durationMs", result.durationMs());
        payload.put("syntaxOk", result.syntaxOk());
        payload.put("evaluationMode", result.evaluationMode());
        payload.put("openSearchQueried", result.openSearchQueried());
        payload.put("engineParity", result.engineParity());
        payload.put("mode", result.evaluationMode());
        payload.put("exceptionsApplied", applied.exceptionsApplied());
        payload.put("exceptionsConsideredCount", applied.consideredCount());
        payload.put("exceptionsSuppressedCount", suppressed ? 1 : 0);
        payload.put("matchingExceptionId", applied.matchingExceptionId());
        payload.put("matchingExceptionTitle", applied.matchingExceptionTitle());
        payload.put("honesty",
            "Inject dry-run only — does not query OpenSearch historical indices. "
                + "engineParity=approximate (not full Go CEL). "
                + applied.honesty());
        payload.put("simulated", false);
        return payload;
    }

    private static boolean looksLikeExpression(String text) {
        String lower = text.toLowerCase();
        return lower.contains("equals(")
            || lower.contains("contains(")
            || lower.contains("oneof(")
            || lower.contains("startswith(")
            || lower.contains("endswith(")
            || lower.contains("&&")
            || lower.contains("||");
    }

    public static Map<String, Object> emptyEvent() {
        return Collections.emptyMap();
    }
}
