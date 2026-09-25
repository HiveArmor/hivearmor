package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * PT-3 — merges the schema-v1 {@code policyConfig} documents of the templates on one winning
 * association row into a single effective document, per the PT-0 §3 section-merge rules.
 *
 * <p>Templates are applied left-to-right in {@code templates[]} order. The rule is
 * <b>lists append + de-dupe (stable), scalars last-wins</b>. Per PT-0 §3 the de-dupe key differs
 * by section:
 * <ul>
 *   <li>{@code monitor.items[]} — de-dupe by {@code metric}; later {@code intervalSec} wins</li>
 *   <li>{@code event.eventLogs[]} — de-dupe by ({@code type},{@code channel}); later include/exclude wins</li>
 *   <li>{@code event.fileLog.*} — scalar booleans, last-wins</li>
 *   <li>{@code userLog[]} — de-dupe by {@code fullFileName}</li>
 *   <li>{@code fim.rules[]} — de-dupe by {@code path}; {@code fim.mode} last-wins;
 *       {@code fim.registry.keys[]} de-dupe by value</li>
 *   <li>{@code change.registry[]} — de-dupe by {@code rootKey}; {@code installedSoftware} last-wins</li>
 *   <li>{@code script.wmi[]} / {@code script.powershell[]} — de-dupe by exact string</li>
 *   <li>{@code certificate[]} — de-dupe by {@code store}; later flags win</li>
 *   <li>{@code osquery.queries[]} — de-dupe by name</li>
 *   <li>{@code scans.cis} / {@code scans.vuln} — whole-object last-wins</li>
 * </ul>
 *
 * <p>De-dupe is <b>stable</b>: the first occurrence keeps its position; a later duplicate updates
 * the winning fields in place (objects) or is dropped (pure list values). Any section NOT covered
 * by an explicit rule falls back to last-wins for scalars and stable-append+dedupe for arrays of
 * scalars, so an additive future section merges sanely without a code change here.
 *
 * <p>Stateless / thread-safe. STAGING CANDIDATE — not PRODUCTION READY.
 */
@Component
public class PolicyTemplateMerger {

    private final ObjectMapper objectMapper;

    public PolicyTemplateMerger(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Merge the given ordered template configs (each a schema-v1 JSON string) into one effective
     * config JSON string. Later configs win scalar conflicts; lists append+dedupe stably.
     * A single config is returned normalized-through-merge (idempotent).
     */
    public String merge(java.util.List<String> orderedConfigs) {
        ObjectNode acc = objectMapper.createObjectNode();
        for (String cfg : orderedConfigs) {
            JsonNode t;
            try {
                t = objectMapper.readTree(cfg == null || cfg.isBlank() ? "{}" : cfg);
            } catch (Exception e) {
                throw new IllegalArgumentException("template policyConfig is not valid JSON: " + e.getMessage());
            }
            if (t != null && t.isObject()) {
                mergeRoot(acc, (ObjectNode) t);
            }
        }
        try {
            return objectMapper.writeValueAsString(acc);
        } catch (Exception e) {
            throw new IllegalStateException("failed to serialize merged policy", e);
        }
    }

    private void mergeRoot(ObjectNode acc, ObjectNode next) {
        next.fieldNames().forEachRemaining(field -> {
            JsonNode nv = next.get(field);
            switch (field) {
                case "monitor" -> mergeMonitor(acc, nv);
                case "event" -> mergeEvent(acc, nv);
                case "userLog" -> acc.set("userLog",
                    dedupeArrayByKey(arrayOf(acc.get("userLog")), nv, "fullFileName"));
                case "fim" -> mergeFim(acc, nv);
                case "change" -> mergeChange(acc, nv);
                case "script" -> mergeScript(acc, nv);
                case "certificate" -> acc.set("certificate",
                    dedupeArrayByKey(arrayOf(acc.get("certificate")), nv, "store"));
                case "osquery" -> mergeOsquery(acc, nv);
                case "scans" -> mergeScans(acc, nv);
                default -> mergeGeneric(acc, field, nv);
            }
        });
    }

    // --- section-specific rules ------------------------------------------------------

    private void mergeMonitor(ObjectNode acc, JsonNode next) {
        ObjectNode dst = objOf(acc.get("monitor"));
        ArrayNode merged = dedupeArrayByKey(arrayOf(dst.get("items")), next.get("items"), "metric");
        dst.set("items", merged);
        acc.set("monitor", dst);
    }

    private void mergeEvent(ObjectNode acc, JsonNode next) {
        ObjectNode dst = objOf(acc.get("event"));
        // fileLog.* — scalar booleans last-wins (whole fileLog object shallow-merged)
        if (next.has("fileLog") && next.get("fileLog").isObject()) {
            ObjectNode fl = objOf(dst.get("fileLog"));
            next.get("fileLog").fields().forEachRemaining(e -> fl.set(e.getKey(), e.getValue()));
            dst.set("fileLog", fl);
        }
        // eventLogs[] — de-dupe by (type,channel)
        if (next.has("eventLogs")) {
            dst.set("eventLogs",
                dedupeArrayByCompositeKey(arrayOf(dst.get("eventLogs")), next.get("eventLogs"),
                    "type", "channel"));
        }
        // any other scalar keys on event: last-wins
        next.fields().forEachRemaining(e -> {
            if (!"fileLog".equals(e.getKey()) && !"eventLogs".equals(e.getKey())) {
                dst.set(e.getKey(), e.getValue());
            }
        });
        acc.set("event", dst);
    }

    private void mergeFim(ObjectNode acc, JsonNode next) {
        ObjectNode dst = objOf(acc.get("fim"));
        if (next.has("mode")) dst.set("mode", next.get("mode"));            // last-wins
        if (next.has("rules")) {
            dst.set("rules", dedupeArrayByKey(arrayOf(dst.get("rules")), next.get("rules"), "path"));
        }
        if (next.has("registry") && next.get("registry").isObject()) {
            ObjectNode reg = objOf(dst.get("registry"));
            JsonNode nreg = next.get("registry");
            if (nreg.has("mode")) reg.set("mode", nreg.get("mode"));         // last-wins
            if (nreg.has("keys")) {
                reg.set("keys", dedupeScalarArray(arrayOf(reg.get("keys")), nreg.get("keys")));
            }
            dst.set("registry", reg);
        }
        acc.set("fim", dst);
    }

    private void mergeChange(ObjectNode acc, JsonNode next) {
        ObjectNode dst = objOf(acc.get("change"));
        if (next.has("registry")) {
            dst.set("registry",
                dedupeArrayByKey(arrayOf(dst.get("registry")), next.get("registry"), "rootKey"));
        }
        if (next.has("installedSoftware")) dst.set("installedSoftware", next.get("installedSoftware")); // last-wins
        acc.set("change", dst);
    }

    private void mergeScript(ObjectNode acc, JsonNode next) {
        ObjectNode dst = objOf(acc.get("script"));
        if (next.has("wmi")) dst.set("wmi", dedupeScalarArray(arrayOf(dst.get("wmi")), next.get("wmi")));
        if (next.has("powershell")) {
            dst.set("powershell", dedupeScalarArray(arrayOf(dst.get("powershell")), next.get("powershell")));
        }
        acc.set("script", dst);
    }

    private void mergeOsquery(ObjectNode acc, JsonNode next) {
        ObjectNode dst = objOf(acc.get("osquery"));
        if (next.has("queries")) {
            dst.set("queries", dedupeScalarArray(arrayOf(dst.get("queries")), next.get("queries")));
        }
        acc.set("osquery", dst);
    }

    private void mergeScans(ObjectNode acc, JsonNode next) {
        ObjectNode dst = objOf(acc.get("scans"));
        // whole-object last-wins per PT-0 §3 (cadence not partially merged)
        if (next.has("cis")) dst.set("cis", next.get("cis"));
        if (next.has("vuln")) dst.set("vuln", next.get("vuln"));
        acc.set("scans", dst);
    }

    /**
     * Fallback for any section without an explicit rule: object → shallow last-wins merge,
     * array-of-scalars → stable append+dedupe, scalar → last-wins. Keeps additive future
     * sections (e.g. schema_version, collectors, response, telemetry) merging sanely.
     */
    private void mergeGeneric(ObjectNode acc, String field, JsonNode nv) {
        JsonNode existing = acc.get(field);
        if (nv.isObject() && existing != null && existing.isObject()) {
            ObjectNode dst = (ObjectNode) existing;
            nv.fields().forEachRemaining(e -> dst.set(e.getKey(), e.getValue()));  // shallow last-wins
            acc.set(field, dst);
        } else if (nv.isArray() && isScalarArray(nv)) {
            acc.set(field, dedupeScalarArray(arrayOf(existing), nv));
        } else {
            acc.set(field, nv);   // scalar or fresh object/array: last-wins
        }
    }

    // --- array de-dupe primitives ----------------------------------------------------

    /** Stable append + de-dupe of an array of objects keyed by one field. Later duplicate updates in place. */
    private ArrayNode dedupeArrayByKey(ArrayNode base, JsonNode incoming, String key) {
        Map<String, ObjectNode> byKey = new LinkedHashMap<>();
        java.util.List<JsonNode> passthrough = new java.util.ArrayList<>();
        collectByKey(base, key, byKey, passthrough);
        collectByKey(incoming, key, byKey, passthrough);
        ArrayNode out = objectMapper.createArrayNode();
        byKey.values().forEach(out::add);
        passthrough.forEach(out::add);
        return out;
    }

    private void collectByKey(JsonNode arr, String key, Map<String, ObjectNode> byKey,
                              java.util.List<JsonNode> passthrough) {
        if (arr == null || !arr.isArray()) return;
        for (JsonNode el : arr) {
            if (el.isObject() && el.has(key) && !el.get(key).isNull()) {
                String k = el.get(key).asText();
                ObjectNode prev = byKey.get(k);
                if (prev == null) {
                    byKey.put(k, ((ObjectNode) el).deepCopy());
                } else {
                    // update the winning fields in place (later template wins), keep position
                    el.fields().forEachRemaining(e -> prev.set(e.getKey(), e.getValue()));
                }
            } else {
                passthrough.add(el.deepCopy());   // keyless element: keep as-is
            }
        }
    }

    /** Stable append + de-dupe keyed by a composite of several fields. */
    private ArrayNode dedupeArrayByCompositeKey(ArrayNode base, JsonNode incoming, String... keys) {
        Map<String, ObjectNode> byKey = new LinkedHashMap<>();
        java.util.List<JsonNode> passthrough = new java.util.ArrayList<>();
        collectByCompositeKey(base, keys, byKey, passthrough);
        collectByCompositeKey(incoming, keys, byKey, passthrough);
        ArrayNode out = objectMapper.createArrayNode();
        byKey.values().forEach(out::add);
        passthrough.forEach(out::add);
        return out;
    }

    private void collectByCompositeKey(JsonNode arr, String[] keys, Map<String, ObjectNode> byKey,
                                       java.util.List<JsonNode> passthrough) {
        if (arr == null || !arr.isArray()) return;
        for (JsonNode el : arr) {
            if (el.isObject()) {
                StringBuilder sb = new StringBuilder();
                for (String k : keys) {
                    sb.append('\u0000').append(el.hasNonNull(k) ? el.get(k).asText() : "");
                }
                String k = sb.toString();
                ObjectNode prev = byKey.get(k);
                if (prev == null) {
                    byKey.put(k, ((ObjectNode) el).deepCopy());
                } else {
                    el.fields().forEachRemaining(e -> prev.set(e.getKey(), e.getValue()));
                }
            } else {
                passthrough.add(el.deepCopy());
            }
        }
    }

    /** Stable append + de-dupe of an array of scalars (by string value). */
    private ArrayNode dedupeScalarArray(ArrayNode base, JsonNode incoming) {
        java.util.LinkedHashSet<String> seen = new java.util.LinkedHashSet<>();
        ArrayNode out = objectMapper.createArrayNode();
        addScalars(base, seen, out);
        addScalars(incoming, seen, out);
        return out;
    }

    private void addScalars(JsonNode arr, java.util.LinkedHashSet<String> seen, ArrayNode out) {
        if (arr == null || !arr.isArray()) return;
        for (JsonNode el : arr) {
            String v = el.isValueNode() ? el.asText() : el.toString();
            if (seen.add(v)) out.add(el.deepCopy());
        }
    }

    private boolean isScalarArray(JsonNode arr) {
        if (!arr.isArray()) return false;
        for (JsonNode el : arr) {
            if (!el.isValueNode()) return false;
        }
        return true;
    }

    // --- node helpers ----------------------------------------------------------------

    private ObjectNode objOf(JsonNode n) {
        return n != null && n.isObject() ? ((ObjectNode) n).deepCopy() : objectMapper.createObjectNode();
    }

    private ArrayNode arrayOf(JsonNode n) {
        return n != null && n.isArray() ? ((ArrayNode) n).deepCopy() : objectMapper.createArrayNode();
    }
}
