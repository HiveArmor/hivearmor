package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Produces a PII-safe, whitelisted JSON snippet describing a single alert for
 * use as LLM context.
 *
 * <h3>Whitelist enforcement — inclusion model</h3>
 * <p>The result map is built by iterating over {@link #ALERT_WHITELIST} and
 * copying only those keys from the raw source.  Any field that is <em>not</em>
 * present in the whitelist — including raw log payloads, {@code _source} blobs,
 * credentials, session tokens, and personally-identifiable information — is
 * silently dropped.  Adding a new field to LLM context requires an explicit
 * change to {@link #ALERT_WHITELIST}.
 *
 * <h3>Error handling</h3>
 * <p>Returns {@code null} when the source map is {@code null} or empty, or when
 * any exception is thrown.  Log statements include only the {@code alertId} —
 * never the raw source map or any of its values.
 */
@Service
public class HaAlertContextService {

    private static final Logger log = LoggerFactory.getLogger(HaAlertContextService.class);

    /**
     * Exact set of field keys allowed in the JSON sent to the LLM.
     * Requirement 4.2 — enforced by inclusion, not exclusion.
     */
    static final Set<String> ALERT_WHITELIST = Set.of(
        "id",
        "name",
        "category",
        "severity",
        "description",
        "dataType",
        "mitreTactic",
        "mitreTechnique",
        "source",
        "destination",
        "timestamp"
    );

    private final AlertQueryPort alertQueryPort;
    private final ObjectMapper objectMapper;

    public HaAlertContextService(AlertQueryPort alertQueryPort, ObjectMapper objectMapper) {
        this.alertQueryPort = alertQueryPort;
        this.objectMapper = objectMapper;
    }

    /**
     * Returns a compact JSON string containing only the whitelisted alert fields,
     * or {@code null} when the alert is not found or any error occurs.
     *
     * <p>Log statements reference only {@code alertId} — never the raw source
     * (NoPiiInContextInvariant).
     *
     * @param alertId the alert identifier; must not be {@code null}
     * @return whitelisted JSON string, or {@code null}
     */
    public String loadAlertAsJson(String alertId) {
        try {
            Map<String, Object> raw = alertQueryPort.findById(alertId);
            if (raw == null || raw.isEmpty()) {
                return null;
            }

            // Build the result by iterating whitelist keys only (inclusion model).
            Map<String, Object> filtered = new LinkedHashMap<>();
            for (String key : ALERT_WHITELIST) {
                if (raw.containsKey(key)) {
                    filtered.put(key, raw.get(key));
                }
            }

            if (filtered.isEmpty()) {
                return null;
            }

            return objectMapper.writeValueAsString(filtered);
        } catch (Exception e) {
            // Log only the id — never the raw source (NoPiiInContextInvariant, Req 4.7).
            log.warn("loadAlertAsJson failed for alertId={}", alertId);
            return null;
        }
    }
}
