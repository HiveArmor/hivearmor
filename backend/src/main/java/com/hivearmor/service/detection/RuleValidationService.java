package com.hivearmor.service.detection;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Service for detection rule validation (DET-011).
 *
 * <p>Validates CEL expressions, field references, filter syntax,
 * cron schedules, and computes complexity scores.
 *
 * <p>Sprint 47 — Detection Rules.
 */
@Service
public class RuleValidationService {

    private static final Logger log = LoggerFactory.getLogger(RuleValidationService.class);
    private static final String CLASSNAME = "RuleValidationService";

    /** Valid SDK CEL functions. */
    private static final Set<String> VALID_CEL_FUNCTIONS = Set.of(
        "celExists", "safe", "inCIDR", "equals", "equalsIgnoreCase",
        "contains", "containsAll", "oneOf", "startsWith", "endsWith", "regexMatch"
    );

    /** Known ECS field schema for validation. */
    private static final Set<String> KNOWN_ECS_FIELDS = Set.of(
        "source.ip", "destination.ip", "source.port", "destination.port",
        "process.name", "process.executable", "process.command_line", "process.pid",
        "process.parent.name", "process.parent.executable", "process.parent.command_line",
        "file.path", "file.name", "file.hash.sha256", "file.hash.md5",
        "user.name", "user.domain", "user.id",
        "host.name", "host.ip", "host.os.name",
        "network.protocol", "network.direction", "network.bytes",
        "dns.question.name", "dns.resolved_ip",
        "http.request.method", "http.response.status_code", "url.full", "url.domain",
        "event.action", "event.category", "event.type", "event.outcome",
        "registry.path", "registry.key", "registry.value",
        "threat.indicator.ip", "threat.indicator.domain",
        "agent.name", "agent.type",
        "cloud.provider", "cloud.region", "cloud.account.id",
        "service.name", "service.type",
        "log.level", "log.logger"
    );

    /** Valid cron characters pattern. */
    private static final Pattern CRON_PATTERN = Pattern.compile(
        "^[0-9*/,-]+\\s+[0-9*/,-]+\\s+[0-9*/,-]+\\s+[0-9*/,-]+\\s+[0-9*/,-]+$"
    );

    /**
     * Validates a detection rule definition.
     *
     * @param ruleDefinition map containing name, expression, filters, schedule
     * @return validation result with errors, warnings, and complexity
     */
    public Map<String, Object> validate(Map<String, Object> ruleDefinition) {
        List<Map<String, Object>> errors = new ArrayList<>();
        List<Map<String, Object>> warnings = new ArrayList<>();

        String expression = getStr(ruleDefinition, "expression");
        String filters = getStr(ruleDefinition, "filters");
        String schedule = getStr(ruleDefinition, "schedule");
        String name = getStr(ruleDefinition, "name");

        // Validate name
        if (name == null || name.isBlank()) {
            errors.add(createIssue("MISSING_NAME", "Rule name is required", null));
        }

        // Validate expression
        if (expression == null || expression.isBlank()) {
            errors.add(createIssue("MISSING_EXPRESSION", "CEL expression is required", null));
        } else {
            validateCelExpression(expression, errors, warnings);
        }

        // Validate schedule (if provided)
        if (schedule != null && !schedule.isBlank()) {
            validateSchedule(schedule, errors, warnings);
        }

        // Validate filters (if provided)
        if (filters != null && !filters.isBlank()) {
            validateFilters(filters, errors, warnings);
        }

        // Calculate complexity
        Map<String, Object> complexity = calculateComplexity(expression);

        // Determine validity
        boolean valid = errors.isEmpty();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("valid", valid);
        result.put("errors", errors);
        result.put("warnings", warnings);
        result.put("complexity", complexity);

        log.debug("{}.validate: valid={} errors={} warnings={} complexity={}",
            CLASSNAME, valid, errors.size(), warnings.size(), complexity.get("level"));

        return result;
    }

    // =========================================================================
    // CEL Expression Validation
    // =========================================================================

    private void validateCelExpression(String expression, List<Map<String, Object>> errors,
                                       List<Map<String, Object>> warnings) {
        // Check balanced parentheses
        if (!hasBalancedParens(expression)) {
            errors.add(createIssue("UNBALANCED_PARENS", "Expression has unbalanced parentheses", null));
            return; // Cannot continue with unbalanced parens
        }

        // Check for valid function names
        Set<String> usedFunctions = extractFunctionNames(expression);
        for (String func : usedFunctions) {
            if (!VALID_CEL_FUNCTIONS.contains(func)) {
                errors.add(createIssue("UNKNOWN_FUNCTION",
                    "Unknown CEL function: '" + func + "'. Valid functions: " + VALID_CEL_FUNCTIONS,
                    func));
            }
        }

        // Validate field references against known ECS schema
        Set<String> usedFields = extractFieldReferences(expression);
        for (String field : usedFields) {
            if (!KNOWN_ECS_FIELDS.contains(field) && !field.contains("*")) {
                warnings.add(createIssue("UNKNOWN_FIELD",
                    "Field '" + field + "' is not in the known ECS schema. Ensure it exists in your data.",
                    field));
            }
        }

        // Check for empty string comparisons (potential mistake)
        if (expression.contains("equals(\"\")") || expression.contains("contains(\"\")")) {
            warnings.add(createIssue("EMPTY_COMPARISON",
                "Expression contains comparison with empty string — verify this is intentional", null));
        }
    }

    private boolean hasBalancedParens(String expr) {
        int depth = 0;
        for (char c : expr.toCharArray()) {
            if (c == '(') depth++;
            else if (c == ')') depth--;
            if (depth < 0) return false;
        }
        return depth == 0;
    }

    /**
     * Extracts function names from CEL expression by finding word characters before '('.
     */
    private Set<String> extractFunctionNames(String expression) {
        Set<String> functions = new HashSet<>();
        Pattern funcPattern = Pattern.compile("\\b([a-zA-Z][a-zA-Z0-9]*)\\s*\\(");
        var matcher = funcPattern.matcher(expression);
        while (matcher.find()) {
            String funcName = matcher.group(1);
            // Filter out common non-function keywords
            if (!Set.of("true", "false", "null", "if", "else").contains(funcName)) {
                functions.add(funcName);
            }
        }
        return functions;
    }

    /**
     * Extracts field references from CEL expression (dot-notation identifiers like source.ip).
     */
    private Set<String> extractFieldReferences(String expression) {
        Set<String> fields = new HashSet<>();
        Pattern fieldPattern = Pattern.compile("\\b([a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)*)\\b");
        var matcher = fieldPattern.matcher(expression);
        while (matcher.find()) {
            String field = matcher.group(1);
            // Only include dot-notation fields (multi-segment)
            if (field.contains(".") && !VALID_CEL_FUNCTIONS.contains(field.split("\\.")[0])) {
                fields.add(field);
            }
        }
        return fields;
    }

    // =========================================================================
    // Schedule Validation
    // =========================================================================

    private void validateSchedule(String schedule, List<Map<String, Object>> errors,
                                  List<Map<String, Object>> warnings) {
        if (!CRON_PATTERN.matcher(schedule.trim()).matches()) {
            errors.add(createIssue("INVALID_CRON",
                "Invalid cron schedule format: '" + schedule + "'. Expected: minute hour day month weekday",
                schedule));
        }
    }

    // =========================================================================
    // Filter Validation
    // =========================================================================

    private void validateFilters(String filters, List<Map<String, Object>> errors,
                                 List<Map<String, Object>> warnings) {
        // Basic YAML/JSON structure check
        if (filters.contains("{") && !filters.contains("}")) {
            errors.add(createIssue("INVALID_FILTER_SYNTAX",
                "Filter definition has unclosed braces", null));
        }
        if (filters.contains("[") && !filters.contains("]")) {
            errors.add(createIssue("INVALID_FILTER_SYNTAX",
                "Filter definition has unclosed brackets", null));
        }
    }

    // =========================================================================
    // Complexity Scoring
    // =========================================================================

    /**
     * Calculates complexity score for a CEL expression.
     *
     * <p>Scoring:
     * <ul>
     *   <li>Expression length: 1 point per 50 characters</li>
     *   <li>Nested functions: 2 points each</li>
     *   <li>Regex patterns: 3 points each</li>
     *   <li>afterEvents window: 4 points</li>
     * </ul>
     *
     * <p>Thresholds: low (1-3), medium (4-6), high (7-9), critical (10+)
     */
    public Map<String, Object> calculateComplexity(String expression) {
        Map<String, Object> complexity = new LinkedHashMap<>();

        if (expression == null || expression.isBlank()) {
            complexity.put("score", 0);
            complexity.put("level", "low");
            complexity.put("breakdown", Collections.emptyMap());
            return complexity;
        }

        int score = 0;
        Map<String, Integer> breakdown = new LinkedHashMap<>();

        // Length score: 1pt per 50 chars
        int lengthPoints = expression.length() / 50;
        if (lengthPoints > 0) {
            score += lengthPoints;
            breakdown.put("length", lengthPoints);
        }

        // Nested functions: count depth > 1 — 2pt each
        int nestedCount = countNestedFunctions(expression);
        if (nestedCount > 0) {
            int nestedPoints = nestedCount * 2;
            score += nestedPoints;
            breakdown.put("nestedFunctions", nestedPoints);
        }

        // Regex: 3pt each
        int regexCount = countOccurrences(expression, "regexMatch");
        if (regexCount > 0) {
            int regexPoints = regexCount * 3;
            score += regexPoints;
            breakdown.put("regex", regexPoints);
        }

        // afterEvents window: 4pt
        if (expression.contains("afterEvents") || expression.contains("after_events")) {
            score += 4;
            breakdown.put("afterEvents", 4);
        }

        // Determine level
        String level;
        if (score <= 3) level = "low";
        else if (score <= 6) level = "medium";
        else if (score <= 9) level = "high";
        else level = "critical";

        complexity.put("score", score);
        complexity.put("level", level);
        complexity.put("breakdown", breakdown);

        return complexity;
    }

    private int countNestedFunctions(String expression) {
        int maxDepth = 0;
        int currentDepth = 0;
        boolean inFunction = false;

        for (int i = 0; i < expression.length(); i++) {
            char c = expression.charAt(i);
            if (c == '(') {
                currentDepth++;
                inFunction = true;
                if (currentDepth > maxDepth) maxDepth = currentDepth;
            } else if (c == ')') {
                currentDepth--;
            }
        }
        // Nested functions = maxDepth - 1 (at least depth 2 means nesting)
        return Math.max(0, maxDepth - 1);
    }

    private int countOccurrences(String text, String target) {
        int count = 0;
        int idx = 0;
        while ((idx = text.indexOf(target, idx)) != -1) {
            count++;
            idx += target.length();
        }
        return count;
    }

    // =========================================================================
    // Utility
    // =========================================================================

    private Map<String, Object> createIssue(String code, String message, String context) {
        Map<String, Object> issue = new LinkedHashMap<>();
        issue.put("code", code);
        issue.put("message", message);
        if (context != null) {
            issue.put("context", context);
        }
        return issue;
    }

    private String getStr(Map<String, Object> map, String key) {
        if (map == null) return null;
        Object val = map.get(key);
        return val != null ? val.toString() : null;
    }
}
