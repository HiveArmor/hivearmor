package com.hivearmor.service.soar;

import com.hivearmor.service.dto.PlaybookExecuteRequestDTO;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Thin SOAR condition evaluator for playbook {@code stepType=condition}.
 *
 * <p>Supports a single clause or boolean groups:
 * <pre>
 * { "field": "severity", "op": "eq", "value": "high", "onFalse": "stop_success" }
 * { "all": [ { "field": "...", "op": "...", "value": ... }, ... ] }
 * { "any": [ ... ] }
 * </pre>
 *
 * <p>Field resolution order: {@code inputs.&lt;field&gt;}, then top-level execute
 * context ({@code alertId}, {@code agentId}, {@code hostname}), then dotted paths
 * inside {@code inputs}.
 *
 * <p>Ops: {@code eq}, {@code neq}, {@code gt}, {@code gte}, {@code lt}, {@code lte},
 * {@code contains}, {@code in}, {@code exists}. Unknown ops fail closed.
 *
 * <p>STAGING CANDIDATE — not a full CEL engine.
 */
public final class PlaybookConditionEvaluator {

    public enum OnFalse {
        STOP_SUCCESS,
        FAIL,
        CONTINUE
    }

    public record Result(boolean passed, OnFalse onFalse, Map<String, Object> detail) {}

    private PlaybookConditionEvaluator() {}

    public static Result evaluate(Map<String, Object> config, PlaybookExecuteRequestDTO context) {
        Map<String, Object> cfg = config != null ? config : Map.of();
        OnFalse onFalse = parseOnFalse(cfg.get("onFalse"));
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("onFalse", onFalse.name().toLowerCase(Locale.ROOT));

        if (cfg.containsKey("all") && cfg.get("all") instanceof Collection<?> all) {
            List<Map<String, Object>> clauseResults = new ArrayList<>();
            boolean passed = true;
            for (Object raw : all) {
                if (!(raw instanceof Map<?, ?> m)) {
                    passed = false;
                    clauseResults.add(Map.of("error", "invalid_clause"));
                    break;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> clause = (Map<String, Object>) m;
                ClauseOutcome o = evalClause(clause, context);
                clauseResults.add(o.detail());
                if (!o.passed()) {
                    passed = false;
                    break;
                }
            }
            detail.put("mode", "all");
            detail.put("clauses", clauseResults);
            detail.put("passed", passed);
            return new Result(passed, onFalse, detail);
        }

        if (cfg.containsKey("any") && cfg.get("any") instanceof Collection<?> any) {
            List<Map<String, Object>> clauseResults = new ArrayList<>();
            boolean passed = false;
            for (Object raw : any) {
                if (!(raw instanceof Map<?, ?> m)) {
                    clauseResults.add(Map.of("error", "invalid_clause"));
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> clause = (Map<String, Object>) m;
                ClauseOutcome o = evalClause(clause, context);
                clauseResults.add(o.detail());
                if (o.passed()) {
                    passed = true;
                    break;
                }
            }
            detail.put("mode", "any");
            detail.put("clauses", clauseResults);
            detail.put("passed", passed);
            return new Result(passed, onFalse, detail);
        }

        ClauseOutcome o = evalClause(cfg, context);
        detail.put("mode", "single");
        detail.putAll(o.detail());
        return new Result(o.passed(), onFalse, detail);
    }

    private static OnFalse parseOnFalse(Object raw) {
        if (raw == null) {
            return OnFalse.STOP_SUCCESS;
        }
        String s = String.valueOf(raw).trim().toLowerCase(Locale.ROOT);
        return switch (s) {
            case "fail", "failure", "error" -> OnFalse.FAIL;
            case "continue", "skip" -> OnFalse.CONTINUE;
            default -> OnFalse.STOP_SUCCESS;
        };
    }

    private record ClauseOutcome(boolean passed, Map<String, Object> detail) {}

    private static ClauseOutcome evalClause(Map<String, Object> clause, PlaybookExecuteRequestDTO context) {
        Map<String, Object> detail = new LinkedHashMap<>();
        String field = stringVal(clause.get("field"));
        String op = stringVal(clause.get("op"));
        if (op == null || op.isBlank()) {
            op = "eq";
        }
        op = op.trim().toLowerCase(Locale.ROOT);
        detail.put("field", field);
        detail.put("op", op);

        if (field == null || field.isBlank()) {
            detail.put("error", "missing_field");
            detail.put("passed", false);
            return new ClauseOutcome(false, detail);
        }

        Object actual = resolveField(field, context);
        detail.put("actualPresent", actual != null);
        // Never echo arbitrary customer payloads; only type + short scalar preview.
        detail.put("actualKind", actual == null ? "null" : actual.getClass().getSimpleName());

        boolean passed;
        try {
            passed = switch (op) {
                case "exists" -> actual != null && !String.valueOf(actual).isBlank();
                case "eq", "equals", "==" -> softEquals(actual, clause.get("value"));
                case "neq", "ne", "!=" -> !softEquals(actual, clause.get("value"));
                case "gt", "gte", "lt", "lte" -> compareNumbers(actual, clause.get("value"), op);
                case "contains" -> contains(actual, clause.get("value"));
                case "in" -> inCollection(actual, clause.get("value"));
                default -> {
                    detail.put("error", "unknown_op");
                    yield false;
                }
            };
        } catch (IllegalArgumentException ex) {
            detail.put("error", ex.getMessage());
            passed = false;
        }
        detail.put("passed", passed);
        return new ClauseOutcome(passed, detail);
    }

    static Object resolveField(String field, PlaybookExecuteRequestDTO context) {
        if (field == null) {
            return null;
        }
        String path = field.startsWith("inputs.") ? field.substring("inputs.".length()) : field;
        if (context != null && context.getInputs() != null) {
            Object fromInputs = dig(context.getInputs(), path);
            if (fromInputs != null) {
                return fromInputs;
            }
            // also try full key as-is
            if (context.getInputs().containsKey(field)) {
                return context.getInputs().get(field);
            }
        }
        if (context == null) {
            return null;
        }
        return switch (path.toLowerCase(Locale.ROOT)) {
            case "alertid", "alert_id" -> context.getAlertId();
            case "agentid", "agent_id" -> context.getAgentId();
            case "hostname", "host" -> context.getHostname();
            default -> null;
        };
    }

    @SuppressWarnings("unchecked")
    private static Object dig(Map<String, Object> root, String path) {
        if (root == null || path == null || path.isBlank()) {
            return null;
        }
        if (root.containsKey(path)) {
            return root.get(path);
        }
        String[] parts = path.split("\\.");
        Object cur = root;
        for (String p : parts) {
            if (!(cur instanceof Map<?, ?> m)) {
                return null;
            }
            cur = ((Map<String, Object>) m).get(p);
            if (cur == null) {
                return null;
            }
        }
        return cur;
    }

    private static boolean softEquals(Object actual, Object expected) {
        if (actual == null && expected == null) {
            return true;
        }
        if (actual == null || expected == null) {
            return false;
        }
        if (actual instanceof Number || expected instanceof Number) {
            try {
                return toDecimal(actual).compareTo(toDecimal(expected)) == 0;
            } catch (IllegalArgumentException ignored) {
                // fall through to string
            }
        }
        if (actual instanceof Boolean || expected instanceof Boolean) {
            return Boolean.parseBoolean(String.valueOf(actual))
                == Boolean.parseBoolean(String.valueOf(expected));
        }
        return Objects.equals(
            String.valueOf(actual).trim().toLowerCase(Locale.ROOT),
            String.valueOf(expected).trim().toLowerCase(Locale.ROOT));
    }

    private static boolean compareNumbers(Object actual, Object expected, String op) {
        BigDecimal a = toDecimal(actual);
        BigDecimal b = toDecimal(expected);
        int cmp = a.compareTo(b);
        return switch (op) {
            case "gt" -> cmp > 0;
            case "gte" -> cmp >= 0;
            case "lt" -> cmp < 0;
            case "lte" -> cmp <= 0;
            default -> false;
        };
    }

    private static BigDecimal toDecimal(Object v) {
        if (v == null) {
            throw new IllegalArgumentException("null_number");
        }
        if (v instanceof BigDecimal bd) {
            return bd;
        }
        if (v instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        try {
            return new BigDecimal(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("not_numeric");
        }
    }

    private static boolean contains(Object actual, Object expected) {
        if (actual == null || expected == null) {
            return false;
        }
        if (actual instanceof Collection<?> c) {
            for (Object item : c) {
                if (softEquals(item, expected)) {
                    return true;
                }
            }
            return false;
        }
        return String.valueOf(actual).toLowerCase(Locale.ROOT)
            .contains(String.valueOf(expected).toLowerCase(Locale.ROOT));
    }

    private static boolean inCollection(Object actual, Object expected) {
        if (!(expected instanceof Collection<?> c)) {
            if (expected instanceof String s && s.contains(",")) {
                for (String part : s.split(",")) {
                    if (softEquals(actual, part.trim())) {
                        return true;
                    }
                }
                return false;
            }
            return softEquals(actual, expected);
        }
        for (Object item : c) {
            if (softEquals(actual, item)) {
                return true;
            }
        }
        return false;
    }

    private static String stringVal(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
