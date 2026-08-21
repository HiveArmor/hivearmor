package com.hivearmor.service.hunt;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Generates signed pivot descriptors for contextual hunting from event fields.
 *
 * <p>Scans an event document for pivotable fields (IPs, hostnames, users, processes, hashes,
 * MITRE technique IDs), builds hunt queries from templates, and signs each query with
 * HMAC-SHA256 to prevent tampering.
 *
 * <p><strong>HNT-006:</strong> Signed investigation pivots.
 */
@Service
public class PivotGenerator {

    private static final Logger log = LoggerFactory.getLogger(PivotGenerator.class);
    private static final String CLASSNAME = "PivotGenerator";

    private static final int MAX_PIVOTS = 8;
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final DateTimeFormatter ISO_FORMATTER = DateTimeFormatter.ISO_INSTANT;

    @Value("${ha.pivot.signing.secret}")
    private String signingSecret;

    // ─── Pivot Templates (ordered by investigation priority) ────────────────────

    private static final List<PivotTemplate> PIVOT_TEMPLATES = List.of(
        new PivotTemplate("source.ip", "entity_hunt", "Hunt all activity from {value}",
            "Search for all events with source IP {value} in the last 24 hours",
            "source.ip:\"{value}\" AND @timestamp:[now-24h TO now]", "search", false),
        new PivotTemplate("destination.ip", "entity_hunt", "Hunt all connections to {value}",
            "Search for all inbound connections to this destination IP",
            "destination.ip:\"{value}\" AND @timestamp:[now-24h TO now]", "search", false),
        new PivotTemplate("process.name", "technique_hunt", "Hunt all executions of {value}",
            "Search for all process creation events for {value}",
            "process.name:\"{value}\" AND event.action:\"process_created\" AND @timestamp:[now-7d TO now]", "terminal", false),
        new PivotTemplate("user.name", "entity_hunt", "Hunt activity by {value}",
            "Search for all events associated with user {value}",
            "user.name:\"{value}\" AND @timestamp:[now-24h TO now]", "user", false),
        new PivotTemplate("host.name", "entity_hunt", "Hunt all events on {value}",
            "Search for all events on host {value}",
            "host.name:\"{value}\" AND @timestamp:[now-24h TO now]", "server", false),
        new PivotTemplate("file.hash.sha256", "entity_hunt", "Hunt all occurrences of this hash",
            "Search for all events with this file hash in the last 30 days",
            "file.hash.sha256:\"{value}\" AND @timestamp:[now-30d TO now]", "file", false),
        new PivotTemplate("mitre.technique.id", "technique_hunt", "Hunt technique {value} across environment",
            "Search for all events matching MITRE technique {value}",
            "mitre.technique.id:\"{value}\" AND @timestamp:[now-7d TO now]", "shield", false),
        // Temporal pivot (uses event @timestamp for ±1 hour)
        new PivotTemplate("source.ip", "temporal_hunt", "Hunt {value} activity ±1 hour",
            "Temporal pivot: all activity from this IP within 1 hour of this event",
            "source.ip:\"{value}\" AND @timestamp:[{timeFrom} TO {timeTo}]", "clock", true)
    );

    /**
     * Generates pivot descriptors for the given event document.
     *
     * @param event flattened or nested event document from OpenSearch
     * @return list of pivot descriptors (max {@link #MAX_PIVOTS})
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> generate(Map<String, Object> event) {
        if (event == null || event.isEmpty()) {
            return Collections.emptyList();
        }

        // Flatten the event to dot-notation for field lookup
        Map<String, Object> flattened = new LinkedHashMap<>();
        flatten("", event, flattened);

        // Extract event timestamp for temporal pivot
        String eventTimestamp = getStringValue(flattened.get("@timestamp"));

        List<Map<String, Object>> pivots = new ArrayList<>();
        int pivotIndex = 1;

        for (PivotTemplate template : PIVOT_TEMPLATES) {
            if (pivots.size() >= MAX_PIVOTS) {
                break;
            }

            Object fieldValue = flattened.get(template.field());
            if (fieldValue == null) {
                continue;
            }

            String value = getStringValue(fieldValue);
            if (value == null || value.isBlank()) {
                continue;
            }

            // Build the query from template
            String query;
            if (template.isTemporal()) {
                // Temporal pivot: compute ±1 hour from event timestamp
                if (eventTimestamp == null || eventTimestamp.isBlank()) {
                    continue;
                }
                query = buildTemporalQuery(template.queryTemplate(), value, eventTimestamp);
                if (query == null) {
                    continue;
                }
            } else {
                query = template.queryTemplate().replace("{value}", value);
            }

            // Sign the query
            String signature = sign(query);

            // Build pivot descriptor
            Map<String, Object> pivot = new LinkedHashMap<>();
            pivot.put("id", "pivot-" + String.format("%03d", pivotIndex));
            pivot.put("label", template.label().replace("{value}", value));
            pivot.put("description", template.description().replace("{value}", value));
            pivot.put("field", template.field());
            pivot.put("value", value);
            pivot.put("query", query);
            pivot.put("signature", signature);
            pivot.put("icon", template.icon());
            pivot.put("category", template.category());

            pivots.add(pivot);
            pivotIndex++;
        }

        return pivots;
    }

    /**
     * Signs a query string using HMAC-SHA256.
     *
     * @param query the query text to sign
     * @return signature in format "hmac-sha256:{hex}"
     */
    public String sign(String query) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            SecretKeySpec secretKeySpec = new SecretKeySpec(
                signingSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
            mac.init(secretKeySpec);
            byte[] hmacBytes = mac.doFinal(query.getBytes(StandardCharsets.UTF_8));
            return "hmac-sha256:" + bytesToHex(hmacBytes);
        } catch (Exception e) {
            log.error("{}.sign: failed to sign query: {}", CLASSNAME, e.getMessage());
            throw new RuntimeException("Failed to sign pivot query", e);
        }
    }

    /**
     * Verifies that a signature matches the HMAC-SHA256 of the given query.
     *
     * @param query     the query text to verify
     * @param signature the signature to check (format: "hmac-sha256:{hex}")
     * @return true if the signature is valid
     */
    public boolean verifySignature(String query, String signature) {
        if (query == null || signature == null) {
            return false;
        }
        String expected = sign(query);
        return expected.equals(signature);
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Builds a temporal pivot query using ±1 hour from the event timestamp.
     */
    private String buildTemporalQuery(String template, String value, String eventTimestamp) {
        try {
            Instant eventTime = Instant.parse(eventTimestamp);
            Instant from = eventTime.minus(1, ChronoUnit.HOURS);
            Instant to = eventTime.plus(1, ChronoUnit.HOURS);

            String timeFrom = ISO_FORMATTER.format(from.atOffset(ZoneOffset.UTC));
            String timeTo = ISO_FORMATTER.format(to.atOffset(ZoneOffset.UTC));

            return template
                .replace("{value}", value)
                .replace("{timeFrom}", timeFrom)
                .replace("{timeTo}", timeTo);
        } catch (Exception e) {
            log.warn("{}.buildTemporalQuery: invalid timestamp '{}': {}",
                CLASSNAME, eventTimestamp, e.getMessage());
            return null;
        }
    }

    /**
     * Recursively flattens a nested map into dot-notation keys.
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
     * Converts a value to its string representation.
     */
    private String getStringValue(Object value) {
        if (value == null) {
            return null;
        }
        String s = value.toString();
        return s.isBlank() ? null : s;
    }

    /**
     * Converts a byte array to lowercase hex string.
     */
    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    // ─── PivotTemplate record ──────────────────────────────────────────────────

    /**
     * Immutable pivot template definition.
     */
    private record PivotTemplate(
        String field,
        String category,
        String label,
        String description,
        String queryTemplate,
        String icon,
        boolean isTemporal
    ) {}
}
