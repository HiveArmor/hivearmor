package com.hivearmor.service.detection;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Java port of event-processor {@code ExceptionMatches} / {@code exceptionCondMatch}
 * (DET-FP dry-run). Operators: {@code is}, {@code is_not}, {@code contains},
 * {@code starts_with}, {@code ends_with}, {@code in}. Unknown operators fail closed
 * (do not suppress). Conditions within one exception are AND.
 *
 * <p>STAGING CANDIDATE — approximate field flattening vs Go {@code plugins.Event}.
 */
public final class DetectionExceptionMatcher {

    /** Operators enforced by event-processor {@code exceptionCondMatch}. Unknown ops fail closed. */
    public static final Set<String> ALLOWED_OPERATORS = Set.of(
        "is", "is_not", "contains", "starts_with", "ends_with", "in"
    );

    private static final Map<String, String> FIELD_ALIASES = Map.ofEntries(
        Map.entry("host.name", "origin.host"),
        Map.entry("host", "origin.host"),
        Map.entry("user.name", "origin.user"),
        Map.entry("user", "origin.user"),
        Map.entry("source.ip", "origin.ip"),
        Map.entry("source.host", "origin.host"),
        Map.entry("source.user", "origin.user"),
        Map.entry("destination.ip", "target.ip"),
        Map.entry("destination.host", "target.host"),
        Map.entry("destination.user", "target.user"),
        Map.entry("target.host", "target.host"),
        Map.entry("target.user", "target.user"),
        Map.entry("target.ip", "target.ip"),
        Map.entry("origin.host", "origin.host"),
        Map.entry("origin.user", "origin.user"),
        Map.entry("origin.ip", "origin.ip")
    );

    private DetectionExceptionMatcher() {}

    public static boolean isAllowedOperator(String operator) {
        if (operator == null || operator.isBlank()) {
            return false;
        }
        return ALLOWED_OPERATORS.contains(operator.trim().toLowerCase(Locale.ROOT));
    }

    /**
     * Returns true when every condition matches the event (AND). Empty conditions do not match.
     */
    public static boolean matches(List<Map<String, String>> conditions, Map<String, Object> event) {
        if (conditions == null || conditions.isEmpty()) {
            return false;
        }
        Map<String, String> fields = flattenEvent(event);
        for (Map<String, String> condition : conditions) {
            if (!conditionMatches(condition, fields)) {
                return false;
            }
        }
        return true;
    }

    static boolean conditionMatches(Map<String, String> condition, Map<String, String> fields) {
        if (condition == null) {
            return false;
        }
        String field = trim(condition.get("field"));
        String op = trim(condition.get("operator")).toLowerCase(Locale.ROOT);
        String want = condition.get("value") != null ? condition.get("value") : "";
        if (field.isEmpty() || op.isEmpty()) {
            return false;
        }
        Lookup got = lookup(fields, field);
        return switch (op) {
            case "is" -> got.present() && equalsFold(got.value(), want);
            case "is_not" -> !got.present() || !equalsFold(got.value(), want);
            case "contains" -> got.present()
                && got.value().toLowerCase(Locale.ROOT).contains(want.toLowerCase(Locale.ROOT));
            case "starts_with" -> got.present()
                && got.value().toLowerCase(Locale.ROOT).startsWith(want.toLowerCase(Locale.ROOT));
            case "ends_with" -> got.present()
                && got.value().toLowerCase(Locale.ROOT).endsWith(want.toLowerCase(Locale.ROOT));
            case "in" -> {
                if (!got.present()) {
                    yield false;
                }
                for (String part : want.split(",")) {
                    if (equalsFold(got.value(), part.trim())) {
                        yield true;
                    }
                }
                yield false;
            }
            default -> false;
        };
    }

    static Map<String, String> flattenEvent(Map<String, Object> event) {
        Map<String, String> out = new LinkedHashMap<>();
        if (event == null || event.isEmpty()) {
            return out;
        }
        flatten("", event, out);
        copyAlias(out, "origin.host", "host.name");
        copyAlias(out, "host.name", "origin.host");
        copyAlias(out, "origin.user", "user.name");
        copyAlias(out, "user.name", "origin.user");
        copyAlias(out, "origin.ip", "source.ip");
        copyAlias(out, "source.ip", "origin.ip");
        copyAlias(out, "target.ip", "destination.ip");
        copyAlias(out, "destination.ip", "target.ip");
        copyAlias(out, "target.host", "destination.host");
        copyAlias(out, "destination.host", "target.host");
        return out;
    }

    private static void flatten(String prefix, Object node, Map<String, String> out) {
        if (node instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (entry.getKey() == null) {
                    continue;
                }
                String key = String.valueOf(entry.getKey());
                String path = prefix.isEmpty() ? key : prefix + "." + key;
                flatten(path, entry.getValue(), out);
            }
            return;
        }
        if (node == null || prefix.isEmpty()) {
            return;
        }
        out.putIfAbsent(prefix, String.valueOf(node));
    }

    private static void copyAlias(Map<String, String> fields, String from, String to) {
        if (fields.containsKey(to)) {
            return;
        }
        String value = fields.get(from);
        if (value != null && !value.isBlank()) {
            fields.put(to, value);
        }
    }

    private static Lookup lookup(Map<String, String> fields, String field) {
        if (fields.containsKey(field)) {
            return new Lookup(true, fields.get(field));
        }
        String alias = FIELD_ALIASES.get(field);
        if (alias != null && fields.containsKey(alias)) {
            return new Lookup(true, fields.get(alias));
        }
        return new Lookup(false, "");
    }

    private static boolean equalsFold(String a, String b) {
        if (a == null && b == null) {
            return true;
        }
        if (a == null || b == null) {
            return false;
        }
        return a.equalsIgnoreCase(b);
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private record Lookup(boolean present, String value) {}
}
