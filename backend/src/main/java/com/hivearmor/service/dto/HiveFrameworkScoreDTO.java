package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * DTO for each row in GET /api/ha-posture/frameworks
 * Matches the frontend ComplianceFrameworkDTO shape (compliance.types.ts).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveFrameworkScoreDTO {

    private String id;
    private String name;
    private String version;
    private String description;
    private Integer controlCount;
    private Double overallScore;
    /** ISO 8601 timestamp of the most recent evaluation */
    private String lastAssessed;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Integer getControlCount() { return controlCount; }
    public void setControlCount(Integer controlCount) { this.controlCount = controlCount; }

    public Double getOverallScore() { return overallScore; }
    public void setOverallScore(Double overallScore) { this.overallScore = overallScore; }

    public String getLastAssessed() { return lastAssessed; }
    public void setLastAssessed(String lastAssessed) { this.lastAssessed = lastAssessed; }
}
