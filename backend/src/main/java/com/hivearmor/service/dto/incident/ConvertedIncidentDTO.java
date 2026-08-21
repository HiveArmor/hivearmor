package com.hivearmor.service.dto.incident;

/**
 * Response for {@code POST /api/ha-alerts/convert-to-incident} after a PostgreSQL incident exists.
 */
public class ConvertedIncidentDTO {

    private Long id;
    private String title;
    private String incidentName;
    private String incidentDescription;
    private String incidentStatus;
    private Integer incidentSeverity;
    private String createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getIncidentName() { return incidentName; }
    public void setIncidentName(String incidentName) { this.incidentName = incidentName; }

    public String getIncidentDescription() { return incidentDescription; }
    public void setIncidentDescription(String incidentDescription) { this.incidentDescription = incidentDescription; }

    public String getIncidentStatus() { return incidentStatus; }
    public void setIncidentStatus(String incidentStatus) { this.incidentStatus = incidentStatus; }

    public Integer getIncidentSeverity() { return incidentSeverity; }
    public void setIncidentSeverity(Integer incidentSeverity) { this.incidentSeverity = incidentSeverity; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
