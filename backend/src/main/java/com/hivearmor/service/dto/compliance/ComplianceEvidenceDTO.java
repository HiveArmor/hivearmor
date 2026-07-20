package com.hivearmor.service.dto.compliance;

import java.time.Instant;
import java.math.BigDecimal;

public class ComplianceEvidenceDTO {

    private String evidenceId;
    private Long controlId;
    private String mappingType;
    private Instant timestamp;
    private BigDecimal weight;
    private String eventId;
    private String eventSource;
    private String eventSummary;
    private String eventIndexPath;

    public String getEvidenceId() { return evidenceId; }
    public void setEvidenceId(String evidenceId) { this.evidenceId = evidenceId; }

    public Long getControlId() { return controlId; }
    public void setControlId(Long controlId) { this.controlId = controlId; }

    public String getMappingType() { return mappingType; }
    public void setMappingType(String mappingType) { this.mappingType = mappingType; }

    public Instant getTimestamp() { return timestamp; }
    public void setTimestamp(Instant timestamp) { this.timestamp = timestamp; }

    public BigDecimal getWeight() { return weight; }
    public void setWeight(BigDecimal weight) { this.weight = weight; }

    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }

    public String getEventSource() { return eventSource; }
    public void setEventSource(String eventSource) { this.eventSource = eventSource; }

    public String getEventSummary() { return eventSummary; }
    public void setEventSummary(String eventSummary) { this.eventSummary = eventSummary; }

    public String getEventIndexPath() { return eventIndexPath; }
    public void setEventIndexPath(String eventIndexPath) { this.eventIndexPath = eventIndexPath; }
}
