package com.hivearmor.service.soc_ai;

import com.hivearmor.domain.shared_types.alert.Side;
import com.hivearmor.domain.shared_types.alert.UtmAlert;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Thin ENRICH stub for the agentic triage FSM (STAGING CANDIDATE — not PRODUCTION READY).
 *
 * <p>Inventories IOC-ish keys present on an alert / SOC-AI payload and records a
 * placeholder related-entity count. Does <strong>not</strong> query Neo4j, build
 * attack paths, or claim entity-graph product capabilities.
 */
public final class TriageEnrichmentStub {

    /** Well-known IOC / entity field names scanned on nested alert maps (ECS-ish + HA). */
    private static final List<String> KNOWN_IOC_KEYS = List.of(
        "source.ip",
        "destination.ip",
        "host.name",
        "user.name",
        "url.full",
        "url.original",
        "file.hash.md5",
        "file.hash.sha1",
        "file.hash.sha256",
        "threat.indicator.ip",
        "threat.indicator.url",
        "threat.indicator.file.hash.sha256",
        "ip",
        "host",
        "domain",
        "url",
        "email",
        "md5",
        "sha1",
        "sha256",
        "hash",
        "cve",
        "malware"
    );

    private TriageEnrichmentStub() {}

    /**
     * Build structured enrichment metadata for the ENRICH ledger step.
     *
     * @param parsed   SOC-AI result JSON (may contain {@code alertPayload}/{@code alert}/{@code iocs})
     * @param alert    optional OpenSearch alert document (null-safe)
     * @return immutable-ish LinkedHashMap suitable for JSON serialization into nextSteps
     */
    public static Map<String, Object> build(Map<String, Object> parsed, UtmAlert alert) {
        Set<String> iocKeys = new LinkedHashSet<>();

        if (parsed != null) {
            collectFromPayloadMap(firstMap(parsed, "alertPayload", "alert", "payload"), iocKeys);
            collectExplicitIocList(parsed.get("iocs"), iocKeys);
            collectExplicitIocList(parsed.get("iocKeys"), iocKeys);
        }

        if (alert != null) {
            collectFromSide("adversary", alert.getAdversary(), iocKeys);
            collectFromSide("target", alert.getTarget(), iocKeys);
            if (alert.getName() != null && !alert.getName().isBlank()) {
                iocKeys.add("name");
            }
            if (alert.getDataSource() != null && !alert.getDataSource().isBlank()) {
                iocKeys.add("dataSource");
            }
        }

        // Placeholder only — entity graph is not queried in this stub.
        int relatedEntityCount = 0;

        Map<String, Object> enrichment = new LinkedHashMap<>(6);
        enrichment.put("stub", true);
        enrichment.put("relatedEntityCount", relatedEntityCount);
        enrichment.put("iocKeys", List.copyOf(iocKeys));
        enrichment.put(
            "note",
            "thin stub — IOC key inventory + placeholder entity count; no Neo4j / attack-path");
        return enrichment;
    }

    /** Human-readable one-line detail for logs / ledger {@code details} field. */
    public static String summarize(Map<String, Object> enrichment) {
        if (enrichment == null) {
            return "enrich stub — no metadata";
        }
        Object keys = enrichment.get("iocKeys");
        int keyCount = keys instanceof List<?> list ? list.size() : 0;
        Object entityCount = enrichment.get("relatedEntityCount");
        return String.format(
            "enrich stub — iocKeys=%d relatedEntityCount=%s (placeholder; no Neo4j)",
            keyCount,
            entityCount != null ? entityCount : 0);
    }

    private static Map<String, Object> firstMap(Map<String, Object> parsed, String... keys) {
        for (String key : keys) {
            Object v = parsed.get(key);
            if (v instanceof Map<?, ?> m) {
                @SuppressWarnings("unchecked")
                Map<String, Object> cast = (Map<String, Object>) m;
                return cast;
            }
        }
        return null;
    }

    private static void collectFromPayloadMap(Map<String, Object> payload, Set<String> out) {
        if (payload == null || payload.isEmpty()) {
            return;
        }
        for (String key : KNOWN_IOC_KEYS) {
            if (hasNonBlank(payload, key) || hasNestedPath(payload, key)) {
                out.add(key);
            }
        }
        // Also accept flat keys already present under those exact names.
        for (String key : payload.keySet()) {
            if (KNOWN_IOC_KEYS.contains(key) && isPresent(payload.get(key))) {
                out.add(key);
            }
        }
    }

    private static void collectExplicitIocList(Object raw, Set<String> out) {
        if (!(raw instanceof List<?> list)) {
            return;
        }
        for (Object item : list) {
            if (item == null) {
                continue;
            }
            if (item instanceof String s && !s.isBlank()) {
                out.add(s.trim());
            } else if (item instanceof Map<?, ?> m) {
                Object type = m.get("type");
                Object field = m.get("field");
                Object key = m.get("key");
                if (field instanceof String fs && !fs.isBlank()) {
                    out.add(fs.trim());
                } else if (key instanceof String ks && !ks.isBlank()) {
                    out.add(ks.trim());
                } else if (type instanceof String ts && !ts.isBlank()) {
                    out.add(ts.trim());
                }
            }
        }
    }

    private static void collectFromSide(String prefix, Side side, Set<String> out) {
        if (side == null) {
            return;
        }
        addIfPresent(out, prefix + ".ip", side.getIp());
        addIfPresent(out, prefix + ".host", side.getHost());
        addIfPresent(out, prefix + ".user", side.getUser());
        addIfPresent(out, prefix + ".domain", side.getDomain());
        addIfPresent(out, prefix + ".url", side.getUrl());
        addIfPresent(out, prefix + ".email", side.getEmail());
        addIfPresent(out, prefix + ".md5", side.getMd5());
        addIfPresent(out, prefix + ".sha1", side.getSha1());
        addIfPresent(out, prefix + ".sha256", side.getSha256());
        addIfPresent(out, prefix + ".hash", side.getHash());
        addIfPresent(out, prefix + ".cve", side.getCve());
        addIfPresent(out, prefix + ".malware", side.getMalware());
    }

    private static void addIfPresent(Set<String> out, String key, String value) {
        if (value != null && !value.isBlank()) {
            out.add(key);
        }
    }

    private static boolean hasNonBlank(Map<String, Object> map, String key) {
        return isPresent(map.get(key));
    }

    /** Dot-path lookup for nested maps (e.g. {@code source.ip} → map.source.ip). */
    private static boolean hasNestedPath(Map<String, Object> map, String dotted) {
        if (!dotted.contains(".")) {
            return false;
        }
        String[] parts = dotted.split("\\.");
        Object cur = map;
        for (String part : parts) {
            if (!(cur instanceof Map<?, ?> m)) {
                return false;
            }
            cur = m.get(part);
            if (cur == null) {
                return false;
            }
        }
        return isPresent(cur);
    }

    private static boolean isPresent(Object v) {
        if (v == null) {
            return false;
        }
        if (v instanceof String s) {
            return !s.isBlank();
        }
        if (v instanceof List<?> list) {
            return !list.isEmpty();
        }
        if (v instanceof Map<?, ?> m) {
            return !m.isEmpty();
        }
        return true;
    }

    /** Package-visible for unit tests — known key catalogue size. */
    static List<String> knownIocKeys() {
        return new ArrayList<>(KNOWN_IOC_KEYS);
    }
}
