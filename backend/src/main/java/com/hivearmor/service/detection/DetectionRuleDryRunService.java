package com.hivearmor.service.detection;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.event_processor.EventProcessorManagerService;
import com.hivearmor.service.detection.CelDryRunEvaluator.DryRunResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Extracts a detection expression from rule JSON/YAML definitions and evaluates
 * it via {@link CelDryRunEvaluator} against injectable sample events.
 *
 * <p>DET-TEST-001 / DET-TEST-002 — STAGING CANDIDATE.
 * Sequence / risk / graph never fall back to Java CEL matches.
 */
@Service
public class DetectionRuleDryRunService {

    private static final Logger log = LoggerFactory.getLogger(DetectionRuleDryRunService.class);
    private static final String CLASSNAME = "DetectionRuleDryRunService";

    public static final String ENGINE_CEL = "cel";
    public static final String ENGINE_SEQUENCE = "sequence";
    public static final String ENGINE_RISK = "risk";
    public static final String ENGINE_GRAPH = "graph";

    private final ObjectMapper objectMapper;
    private final EventProcessorManagerService eventProcessorManagerService;

    public DetectionRuleDryRunService(ObjectMapper objectMapper) {
        this(objectMapper, null);
    }

    @Autowired
    public DetectionRuleDryRunService(ObjectMapper objectMapper,
                                      EventProcessorManagerService eventProcessorManagerService) {
        this.objectMapper = objectMapper;
        this.eventProcessorManagerService = eventProcessorManagerService;
    }

    /**
     * Evaluates a rule definition document (JSON string or YAML) against a sample event JSON string.
     */
    public DryRunResult evaluateRuleDefinition(String ruleDefinition, String eventJson) {
        Map<String, Object> event = parseEvent(eventJson);
        String engine = classifyEngineFromText(ruleDefinition);
        if (requiresGoEngine(engine)) {
            return evaluateViaEventProcessor(ruleDefinition, event, engine);
        }
        String expression = extractExpression(ruleDefinition);
        return CelDryRunEvaluator.evaluate(expression, event);
    }

    /**
     * Evaluates an already-extracted expression against an event map.
     */
    public DryRunResult evaluateExpression(String expression, Map<String, Object> event) {
        String engine = classifyEngineFromText(expression);
        if (requiresGoEngine(engine)) {
            return evaluateViaEventProcessor(expression, event, engine);
        }
        return CelDryRunEvaluator.evaluate(expression, event);
    }

    /**
     * Evaluates a rule definition map (modern detection-rule shape) against an event map.
     */
    public DryRunResult evaluateRuleMap(Map<String, Object> ruleDefinition, Map<String, Object> event) {
        String engine = classifyEngine(ruleDefinition);
        if (requiresGoEngine(engine)) {
            return evaluateViaEventProcessor(extractRuleYaml(ruleDefinition), event, engine);
        }
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
        payload.put("honesty", parityHonesty(result) + " " + applied.honesty());
        payload.put("simulated", false);
        return payload;
    }

    public static boolean requiresGoEngine(String engine) {
        return ENGINE_SEQUENCE.equals(engine) || ENGINE_RISK.equals(engine) || ENGINE_GRAPH.equals(engine);
    }

    public static String classifyEngine(Map<String, Object> rule) {
        if (rule == null || rule.isEmpty()) {
            return ENGINE_CEL;
        }
        Object type = rule.get("type");
        if (type != null && "graph_offense".equalsIgnoreCase(String.valueOf(type))) {
            return ENGINE_GRAPH;
        }
        Object engineField = rule.get("engine");
        if (engineField != null && requiresGoEngine(String.valueOf(engineField).toLowerCase(Locale.ROOT))) {
            return String.valueOf(engineField).toLowerCase(Locale.ROOT);
        }
        Object sequence = rule.get("sequence");
        if (sequence instanceof List<?> list && !list.isEmpty()) {
            return ENGINE_SEQUENCE;
        }
        Object risk = rule.get("riskScore");
        if (risk instanceof Number number && number.intValue() > 0) {
            return ENGINE_RISK;
        }
        return classifyEngineFromText(firstDocumentText(rule));
    }

    public static String classifyEngineFromText(String text) {
        if (text == null || text.isBlank()) {
            return ENGINE_CEL;
        }
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.contains("type: graph_offense") || lower.contains("type:graph_offense")) {
            return ENGINE_GRAPH;
        }
        if (text.contains("\nsequence:") || text.trim().startsWith("sequence:")) {
            return ENGINE_SEQUENCE;
        }
        if (lower.contains("riskscore:")) {
            return ENGINE_RISK;
        }
        return ENGINE_CEL;
    }

    DryRunResult evaluateViaEventProcessor(String ruleYaml, Map<String, Object> event, String engine) {
        long start = System.currentTimeMillis();
        if (eventProcessorManagerService == null) {
            return unavailable(engine, start, "Event-processor client is not configured.");
        }
        try {
            Map<String, Object> remote = eventProcessorManagerService.evaluateRule(ruleYaml, event, engine);
            return fromEventProcessor(remote, engine, start);
        } catch (RuntimeException e) {
            log.warn("{}.evaluateViaEventProcessor: {}", CLASSNAME, e.getMessage());
            return unavailable(engine, start, e.getMessage());
        }
    }

    static DryRunResult fromEventProcessor(Map<String, Object> remote, String engine, long start) {
        if (remote == null || remote.isEmpty()) {
            return unavailable(engine, start, "Empty event-processor evaluate response.");
        }
        String parity = stringVal(remote.get("engineParity"), CelDryRunEvaluator.ENGINE_PARITY_GO);
        if (CelDryRunEvaluator.ENGINE_PARITY_UNAVAILABLE.equals(parity)) {
            return unavailable(engine, start, stringVal(remote.get("explanation"), "event-processor evaluate unavailable"));
        }
        boolean matched = boolVal(remote.get("matched"));
        boolean wouldAlert = remote.containsKey("wouldAlert") ? boolVal(remote.get("wouldAlert")) : matched;
        List<String> fields = stringList(remote.get("matchedFields"));
        String explanation = stringVal(remote.get("explanation"), "Go evaluate completed. engineParity=go.");
        if (!wouldAlert && matched && ENGINE_RISK.equals(engine)) {
            // keep matched=true for risk where; wouldAlert stays false from payload honesty
        }
        long duration = remote.get("durationMs") instanceof Number n
            ? n.longValue()
            : System.currentTimeMillis() - start;
        boolean syntaxOk = !remote.containsKey("syntaxOk") || boolVal(remote.get("syntaxOk"));
        return new DryRunResult(
            matched,
            fields,
            explanation,
            duration,
            CelDryRunEvaluator.EVALUATION_MODE_EP,
            false,
            CelDryRunEvaluator.ENGINE_PARITY_GO,
            syntaxOk
        );
    }

    static DryRunResult unavailable(String engine, long start, String detail) {
        String explanation = "engineParity=unavailable for " + engine
            + " — event-processor INTERNAL_KEY evaluate was not reachable. "
            + "Sequence/risk/graph hits were not faked as Java CEL matches. "
            + (detail != null ? detail : "");
        return new DryRunResult(
            false,
            List.of(),
            explanation.trim(),
            System.currentTimeMillis() - start,
            CelDryRunEvaluator.EVALUATION_MODE_UNAVAILABLE,
            false,
            CelDryRunEvaluator.ENGINE_PARITY_UNAVAILABLE,
            true
        );
    }

    private String extractRuleYaml(Map<String, Object> rule) {
        if (rule == null) {
            return "";
        }
        for (String key : List.of("ruleYaml", "ruleDefinition", "expression", "yaml")) {
            Object val = rule.get(key);
            if (val instanceof String text && !text.isBlank() && looksLikeRuleDocument(text)) {
                return text;
            }
        }
        try {
            return objectMapper.writeValueAsString(rule);
        } catch (Exception e) {
            return "";
        }
    }

    private static String firstDocumentText(Map<String, Object> rule) {
        for (String key : List.of("ruleYaml", "ruleDefinition", "expression", "yaml", "where")) {
            Object val = rule.get(key);
            if (val instanceof String text && !text.isBlank()) {
                return text;
            }
        }
        return "";
    }

    private static boolean looksLikeRuleDocument(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        return lower.contains("sequence:")
            || lower.contains("riskscore:")
            || lower.contains("graph_offense")
            || lower.contains("\nwhere:")
            || lower.startsWith("where:")
            || lower.contains("name:");
    }

    private static String parityHonesty(DryRunResult result) {
        return switch (result.engineParity()) {
            case CelDryRunEvaluator.ENGINE_PARITY_GO ->
                "STAGING CANDIDATE — event-processor INTERNAL_KEY evaluate. engineParity=go. "
                    + "Does not query OpenSearch. Sequence hits are never inferred from Java CEL.";
            case CelDryRunEvaluator.ENGINE_PARITY_UNAVAILABLE ->
                "engineParity=unavailable — event-processor evaluate was not reachable. "
                    + "Sequence/risk/graph hits were not faked as Java CEL matches.";
            default ->
                "Inject dry-run only — does not query OpenSearch historical indices. "
                    + "engineParity=approximate (not full Go CEL).";
        };
    }

    private static boolean boolVal(Object value) {
        return value instanceof Boolean b ? b : "true".equalsIgnoreCase(String.valueOf(value));
    }

    private static String stringVal(Object value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String text = String.valueOf(value);
        return text.isBlank() ? fallback : text;
    }

    private static List<String> stringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(String::valueOf).toList();
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
