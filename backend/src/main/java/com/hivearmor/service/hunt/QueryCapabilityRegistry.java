package com.hivearmor.service.hunt;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Runtime-truth capability contract for the bounded Hunt KQL parser. */
@Component
public class QueryCapabilityRegistry {

    private final HuntFieldRegistry fieldRegistry;

    public QueryCapabilityRegistry(HuntFieldRegistry fieldRegistry) {
        this.fieldRegistry = fieldRegistry;
    }

    public Map<String, Object> getCapabilities() {
        Map<String, Object> capabilities = new LinkedHashMap<>();
        capabilities.put("language", Map.of(
            "id", "kql",
            "label", "HiveArmor KQL",
            "parserVersion", "2.0",
            "defaultExpression", "*:*",
            "blankQueryBehavior", "client_expands_to_bounded_match_all"));
        capabilities.put("operators", operators());
        capabilities.put("functions", List.of());
        capabilities.put("fieldTypes", fieldTypes());
        capabilities.put("timeRanges", timeRanges());
        capabilities.put("limits", Map.of(
            "maxResults", 10_000,
            "maxPageSize", 200,
            "maxTimeRange", "90d",
            "maxConcurrent", 5,
            "queryTimeout", 30,
            "maxQueryLength", HuntQueryParser.MAX_QUERY_LENGTH,
            "maxClauses", HuntQueryParser.MAX_CLAUSES,
            "maxNestingDepth", HuntQueryParser.MAX_DEPTH));
        capabilities.put("features", Map.of(
            "parentheses", true,
            "quotedValues", true,
            "wildcards", "bounded",
            "ipCidr", true,
            "exists", true,
            "pipelines", false,
            "regex", false,
            "aggregationsInQuery", false,
            "pagination", "pit_or_index_search_after",
            "indexTypes", List.of("all", "log", "event", "alert")));
        capabilities.put("examples", examples());
        capabilities.put("fields", fieldRegistry.definitions());
        return capabilities;
    }

    private List<Map<String, String>> operators() {
        return List.of(
            operator(":", "equals", "Exact field match; phrase match for text fields", "source.ip:203.0.113.45"),
            operator("!=", "not_equals", "Exclude an exact field value", "event.outcome!=success"),
            operator(">", "greater_than", "Numeric or date comparison", "network.bytes>10000"),
            operator(">=", "greater_or_equal", "Inclusive lower bound", "event.severity>=3"),
            operator("<", "less_than", "Numeric or date comparison", "destination.port<1024"),
            operator("<=", "less_or_equal", "Inclusive upper bound", "source.port<=1024"),
            operator("AND", "and", "Require both conditions", "event.category:process AND process.name:powershell.exe"),
            operator("OR", "or", "Require at least one condition", "event.outcome:failure OR event.severity>=3"),
            operator("NOT", "not", "Negate a condition or group", "NOT source.ip:10.*"),
            operator("EXISTS", "exists", "Require a mapped field value", "file.hash.sha256:EXISTS"),
            operator("*", "wildcard", "Bounded wildcard on string fields; trailing octet wildcard on IP fields", "host.name:FIN-WKS-*")
        );
    }

    private Map<String, String> operator(String symbol, String name, String description, String example) {
        return Map.of("symbol", symbol, "name", name, "description", description, "example", example);
    }

    private List<Map<String, Object>> fieldTypes() {
        return List.of(
            fieldType("keyword", List.of(":", "!=", "*"), true, true),
            fieldType("text", List.of(":", "!="), false, false),
            fieldType("ip", List.of(":", "!="), true, true),
            fieldType("date", List.of(":", "!=", ">", ">=", "<", "<="), true, true),
            fieldType("number", List.of(":", "!=", ">", ">=", "<", "<="), true, true),
            fieldType("boolean", List.of(":", "!="), true, true));
    }

    private Map<String, Object> fieldType(String type, List<String> operators,
                                          boolean sortable, boolean aggregatable) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("type", type);
        item.put("description", "Supported " + type + " hunt field");
        item.put("operators", operators);
        item.put("sortable", sortable);
        item.put("aggregatable", aggregatable);
        return item;
    }

    private List<Map<String, String>> timeRanges() {
        List<Map<String, String>> ranges = new ArrayList<>();
        ranges.add(timeRange("Last 15 minutes", "now-15m"));
        ranges.add(timeRange("Last 1 hour", "now-1h"));
        ranges.add(timeRange("Last 4 hours", "now-4h"));
        ranges.add(timeRange("Last 24 hours", "now-24h"));
        ranges.add(timeRange("Last 7 days", "now-7d"));
        ranges.add(timeRange("Last 30 days", "now-30d"));
        ranges.add(timeRange("Custom", "custom"));
        return List.copyOf(ranges);
    }

    private Map<String, String> timeRange(String label, String value) {
        return Map.of("label", label, "value", value, "description", label + " in the selected tenant scope");
    }

    private List<Map<String, String>> examples() {
        return List.of(
            example("Encoded PowerShell", "process.name:powershell.exe AND process.command_line:*-enc*", "process"),
            example("Failed authentication", "event.category:authentication AND event.outcome:failure", "identity"),
            example("Outbound HTTPS", "destination.port:443 AND network.direction:outbound", "network"),
            example("Privileged severity", "event.severity>=3 AND user.name:EXISTS", "identity"),
            example("Broad bounded view", "*:*", "event")
        );
    }

    private Map<String, String> example(String title, String query, String category) {
        return Map.of("title", title, "description", title + " hunt", "query", query, "category", category);
    }
}
