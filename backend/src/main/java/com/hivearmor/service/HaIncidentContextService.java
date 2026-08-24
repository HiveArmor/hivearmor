package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.llm.HaPiiRedactor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Produces a PII-safe, whitelisted JSON snippet describing a single incident for
 * use as LLM context.
 *
 * <h3>Whitelist enforcement — inclusion model</h3>
 * <p>The result map is built by iterating over {@link #INCIDENT_WHITELIST} and
 * copying only those keys from the raw source.  Any field that is <em>not</em>
 * present in the whitelist — including raw log payloads, {@code _source} blobs,
 * credentials, session tokens, and personally-identifiable information — is
 * silently dropped.  Adding a new field to LLM context requires an explicit
 * change to {@link #INCIDENT_WHITELIST}.
 *
 * <h3>Value redaction (P1 — STAGING CANDIDATE)</h3>
 * <p>After whitelist filtering, the JSON string is passed through
 * {@link HaPiiRedactor} so residual PII in allowed fields is pseudonymized.
 *
 * <h3>Error handling</h3>
 * <p>Returns {@code null} when the source map is {@code null} or empty, or when
 * any exception is thrown.  Log statements include only the {@code incidentId} —
 * never the raw source map or any of its values.
 */
@Service
public class HaIncidentContextService {

    private static final Logger log = LoggerFactory.getLogger(HaIncidentContextService.class);

    /**
     * Exact set of field keys allowed in the JSON sent to the LLM.
     * Requirement 4.2 — enforced by inclusion, not exclusion.
     */
    static final Set<String> INCIDENT_WHITELIST = Set.of(
        "id",
        "incidentName",
        "incidentStatus",
        "incidentSeverity",
        "incidentObservations"
    );

    private final IncidentQueryPort incidentQueryPort;
    private final ObjectMapper objectMapper;
    private final HaPiiRedactor piiRedactor;

    public HaIncidentContextService(IncidentQueryPort incidentQueryPort, ObjectMapper objectMapper) {
        this(incidentQueryPort, objectMapper, HaPiiRedactor.enabled());
    }

    @Autowired
    public HaIncidentContextService(IncidentQueryPort incidentQueryPort,
                                    ObjectMapper objectMapper,
                                    HaPiiRedactor piiRedactor) {
        this.incidentQueryPort = incidentQueryPort;
        this.objectMapper = objectMapper;
        this.piiRedactor = piiRedactor != null ? piiRedactor : HaPiiRedactor.enabled();
    }

    /**
     * Returns a compact JSON string containing only the whitelisted incident
     * fields, or {@code null} when the incident is not found or any error occurs.
     *
     * <p>Log statements reference only {@code incidentId} — never the raw source
     * (NoPiiInContextInvariant).
     *
     * @param incidentId the incident identifier; must not be {@code null}
     * @return whitelisted JSON string, or {@code null}
     */
    public String loadIncidentAsJson(String incidentId) {
        try {
            Map<String, Object> raw = incidentQueryPort.findById(incidentId);
            if (raw == null || raw.isEmpty()) {
                return null;
            }

            // Build the result by iterating whitelist keys only (inclusion model).
            Map<String, Object> filtered = new LinkedHashMap<>();
            for (String key : INCIDENT_WHITELIST) {
                if (raw.containsKey(key)) {
                    filtered.put(key, raw.get(key));
                }
            }

            if (filtered.isEmpty()) {
                return null;
            }

            String json = objectMapper.writeValueAsString(filtered);
            return piiRedactor.redact(json);
        } catch (Exception e) {
            // Log only the id — never the raw source (NoPiiInContextInvariant, Req 4.7).
            log.warn("loadIncidentAsJson failed for incidentId={}", incidentId);
            return null;
        }
    }
}
