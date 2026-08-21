package com.hivearmor.service.dto;

import java.time.Instant;

/**
 * DTO for the GET /api/ha-search/timeline endpoint.
 * Represents a single event or alert plotted on the Timeline scatter chart.
 */
public class TimelineEventDTO {

    /** OpenSearch document _id. */
    private String id;

    /** ECS @timestamp field. */
    private Instant timestamp;

    /** Human-readable event bucket, e.g. "process_creation", "alert". */
    private String eventType;

    /**
     * Severity on a 1–5 scale.
     * Null for raw (non-alert) events; present for alerts.
     */
    private Integer severity;

    /** Source data type, e.g. "windows", "linux", "aws_cloudtrail", "alert". */
    private String dataType;

    // -------------------------------------------------------------------------
    // Constructors
    // -------------------------------------------------------------------------

    public TimelineEventDTO() {
    }

    public TimelineEventDTO(String id, Instant timestamp, String eventType,
                            Integer severity, String dataType) {
        this.id = id;
        this.timestamp = timestamp;
        this.eventType = eventType;
        this.severity = severity;
        this.dataType = dataType;
    }

    // -------------------------------------------------------------------------
    // Getters & Setters
    // -------------------------------------------------------------------------

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public Integer getSeverity() {
        return severity;
    }

    public void setSeverity(Integer severity) {
        this.severity = severity;
    }

    public String getDataType() {
        return dataType;
    }

    public void setDataType(String dataType) {
        this.dataType = dataType;
    }
}
