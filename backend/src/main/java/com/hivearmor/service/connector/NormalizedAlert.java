package com.hivearmor.service.connector;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Vendor-neutral alert shape after {@link HaConnector#normalize(Map)}.
 *
 * <p>Does <strong>not</strong> write to OpenSearch — callers may inspect or
 * queue for a future ADR-approved ingest path (never bypass event-processor
 * correlation without an ADR).
 */
public final class NormalizedAlert {

    private final String source;
    private final String externalId;
    private final String title;
    private final String description;
    private final String severity;
    private final String hostname;
    private final String srcIp;
    private final List<String> mitreTechniques;
    private final Instant createdAt;
    private final Map<String, Object> rawEvent;

    public NormalizedAlert(
            String source,
            String externalId,
            String title,
            String description,
            String severity,
            String hostname,
            String srcIp,
            List<String> mitreTechniques,
            Instant createdAt,
            Map<String, Object> rawEvent) {
        this.source = source;
        this.externalId = externalId;
        this.title = title;
        this.description = description;
        this.severity = severity;
        this.hostname = hostname;
        this.srcIp = srcIp;
        this.mitreTechniques = mitreTechniques != null ? List.copyOf(mitreTechniques) : List.of();
        this.createdAt = createdAt;
        this.rawEvent = rawEvent != null ? Map.copyOf(rawEvent) : Map.of();
    }

    public String getSource() {
        return source;
    }

    public String getExternalId() {
        return externalId;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public String getSeverity() {
        return severity;
    }

    public String getHostname() {
        return hostname;
    }

    public String getSrcIp() {
        return srcIp;
    }

    public List<String> getMitreTechniques() {
        return mitreTechniques;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Map<String, Object> getRawEvent() {
        return rawEvent;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("source", source);
        m.put("externalId", externalId);
        m.put("title", title);
        m.put("description", description);
        m.put("severity", severity);
        m.put("hostname", hostname);
        m.put("srcIp", srcIp);
        m.put("mitreTechniques", new ArrayList<>(mitreTechniques));
        m.put("createdAt", createdAt != null ? createdAt.toString() : null);
        m.put("rawEvent", rawEvent);
        return m;
    }
}
