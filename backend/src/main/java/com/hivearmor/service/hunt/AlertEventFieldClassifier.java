package com.hivearmor.service.hunt;

import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Classifies ECS event fields into typed, ordered, emphasis-annotated investigation fields.
 *
 * <p>Given a raw event document (potentially nested), this classifier:
 * <ol>
 *   <li>Flattens the nested map to dot-notation keys (e.g., {@code source.ip})</li>
 *   <li>Assigns a semantic type to each field (ip, hostname, process, hash, etc.)</li>
 *   <li>Assigns an emphasis level (critical, warning, neutral) based on threat relevance</li>
 *   <li>Orders fields by investigation relevance</li>
 * </ol>
 *
 * <p><strong>ALT-011:</strong> Event detail — highlighted view.
 */
@Component
public class AlertEventFieldClassifier {

    // ─── 6.1: Field type mapping ───────────────────────────────────────────────

    private static final Map<String, String> FIELD_TYPES = Map.ofEntries(
        Map.entry("source.ip", "ip"),
        Map.entry("destination.ip", "ip"),
        Map.entry("host.name", "hostname"),
        Map.entry("user.name", "username"),
        Map.entry("process.name", "process"),
        Map.entry("file.hash.sha256", "hash"),
        Map.entry("destination.port", "port"),
        Map.entry("@timestamp", "timestamp")
    );

    // ─── 6.2: Field order (12 entries) ─────────────────────────────────────────

    private static final List<String> FIELD_ORDER = List.of(
        "source.ip",
        "destination.ip",
        "process.name",
        "process.pid",
        "process.command_line",
        "user.name",
        "host.name",
        "file.hash.sha256",
        "file.path",
        "event.action",
        "destination.port",
        "@timestamp"
    );

    // ─── 6.3: Emphasis rules ───────────────────────────────────────────────────

    /** Suspicious process names — matched case-insensitively. */
    private static final Set<String> SUSPICIOUS_PROCESSES = Set.of(
        "powershell", "cmd", "rundll32", "mshta", "certutil", "wscript", "cscript"
    );

    /**
     * Classifies fields in the given event document.
     *
     * <p>Flattens the nested ECS map to dot-notation keys, applies type/emphasis/order,
     * and returns an ordered list of field objects. Fields in {@code FIELD_ORDER} appear
     * first (in that order), followed by any remaining fields sorted alphabetically.
     *
     * @param eventDoc the raw event document (may contain nested maps)
     * @return ordered list of classified field maps, each containing:
     *         {@code key}, {@code value}, {@code type}, {@code emphasis}, {@code order}
     */
    public List<Map<String, Object>> classify(Map<String, Object> eventDoc) {
        if (eventDoc == null || eventDoc.isEmpty()) {
            return Collections.emptyList();
        }

        // Step 1: Flatten nested map to dot-notation
        Map<String, Object> flattened = new LinkedHashMap<>();
        flatten("", eventDoc, flattened);

        // Step 2: Build ordered result — FIELD_ORDER entries first
        List<Map<String, Object>> result = new ArrayList<>();
        int order = 1;

        for (String fieldName : FIELD_ORDER) {
            if (flattened.containsKey(fieldName)) {
                Object value = flattened.get(fieldName);
                result.add(buildFieldEntry(fieldName, value, order));
                order++;
            }
        }

        // Step 3: Append remaining fields not in FIELD_ORDER, sorted alphabetically
        Set<String> orderedSet = new HashSet<>(FIELD_ORDER);
        List<String> remaining = new ArrayList<>();
        for (String key : flattened.keySet()) {
            if (!orderedSet.contains(key)) {
                remaining.add(key);
            }
        }
        Collections.sort(remaining);

        for (String fieldName : remaining) {
            Object value = flattened.get(fieldName);
            result.add(buildFieldEntry(fieldName, value, order));
            order++;
        }

        return result;
    }

    /**
     * Builds a single field entry map.
     */
    private Map<String, Object> buildFieldEntry(String key, Object value, int order) {
        Map<String, Object> entry = new LinkedHashMap<>(5);
        entry.put("key", key);
        entry.put("value", valueToString(value));
        entry.put("type", resolveType(key, value));
        entry.put("emphasis", resolveEmphasis(key, value));
        entry.put("order", order);
        return entry;
    }

    /**
     * Recursively flattens a nested map into dot-notation keys.
     * Non-map values are stored directly; nested maps are recursed into.
     */
    @SuppressWarnings("unchecked")
    private void flatten(String prefix, Map<String, Object> source, Map<String, Object> target) {
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            String key = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            Object value = entry.getValue();

            if (value instanceof Map) {
                flatten(key, (Map<String, Object>) value, target);
            } else {
                target.put(key, value);
            }
        }
    }

    /**
     * Resolves the semantic type for a field.
     * Uses the static FIELD_TYPES map first, then falls back to inferring from the value.
     */
    private String resolveType(String key, Object value) {
        // Check explicit mapping
        String mapped = FIELD_TYPES.get(key);
        if (mapped != null) {
            return mapped;
        }

        // Default: infer from value type
        if (value instanceof Number) {
            return "number";
        }

        return "string";
    }

    /**
     * Resolves the emphasis level for a field based on threat relevance.
     *
     * <ul>
     *   <li>{@code critical} — source.ip when external (not RFC1918), file.hash.sha256 always</li>
     *   <li>{@code warning} — process.name when in the suspicious process set</li>
     *   <li>{@code neutral} — everything else</li>
     * </ul>
     */
    private String resolveEmphasis(String key, Object value) {
        if ("source.ip".equals(key)) {
            String ip = valueToString(value);
            if (isExternalIp(ip)) {
                return "critical";
            }
            return "neutral";
        }

        if ("file.hash.sha256".equals(key)) {
            return "critical";
        }

        if ("process.name".equals(key)) {
            String processName = valueToString(value);
            if (isSuspiciousProcess(processName)) {
                return "warning";
            }
            return "neutral";
        }

        return "neutral";
    }

    /**
     * Determines if an IP address is external (not in private RFC1918 ranges).
     * Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
     */
    private boolean isExternalIp(String ip) {
        if (ip == null || ip.isBlank()) {
            return false;
        }

        // 10.0.0.0/8
        if (ip.startsWith("10.")) {
            return false;
        }

        // 192.168.0.0/16
        if (ip.startsWith("192.168.")) {
            return false;
        }

        // 172.16.0.0/12 — covers 172.16.x through 172.31.x
        if (ip.startsWith("172.")) {
            try {
                int secondOctet = Integer.parseInt(ip.split("\\.")[1]);
                if (secondOctet >= 16 && secondOctet <= 31) {
                    return false;
                }
            } catch (NumberFormatException | ArrayIndexOutOfBoundsException e) {
                // Malformed IP — treat as external
            }
        }

        return true;
    }

    /**
     * Checks if a process name matches the suspicious process set (case-insensitive).
     * Strips path components and the .exe extension before matching.
     */
    private boolean isSuspiciousProcess(String processName) {
        if (processName == null || processName.isBlank()) {
            return false;
        }

        // Strip path separators — use just the file name
        String name = processName;
        int lastSlash = name.lastIndexOf('/');
        int lastBackslash = name.lastIndexOf('\\');
        int lastSep = Math.max(lastSlash, lastBackslash);
        if (lastSep >= 0 && lastSep < name.length() - 1) {
            name = name.substring(lastSep + 1);
        }

        // Strip .exe suffix for matching
        String normalized = name.toLowerCase(Locale.ROOT);
        if (normalized.endsWith(".exe")) {
            normalized = normalized.substring(0, normalized.length() - 4);
        }

        return SUSPICIOUS_PROCESSES.contains(normalized);
    }

    /**
     * Converts a value to its string representation.
     */
    private String valueToString(Object value) {
        if (value == null) {
            return "";
        }
        return value.toString();
    }
}
