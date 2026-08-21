package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * DTO for GET /api/ha-posture/score
 * Overall security posture — aggregated from all active compliance frameworks.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HivePostureScoreDTO {

    /** Weighted average score across all frameworks, 0–100 */
    private Double overallScore;
    private Integer totalFrameworks;
    private Integer controlsPassed;
    private Integer controlsFailed;
    private Integer controlsTotal;
    /** ISO 8601 timestamp of the most recent evaluation */
    private String lastAssessed;
    /** Trend direction based on last two evaluations: "improving" | "declining" | "stable" */
    private String trend;

    public Double getOverallScore() { return overallScore; }
    public void setOverallScore(Double overallScore) { this.overallScore = overallScore; }

    public Integer getTotalFrameworks() { return totalFrameworks; }
    public void setTotalFrameworks(Integer totalFrameworks) { this.totalFrameworks = totalFrameworks; }

    public Integer getControlsPassed() { return controlsPassed; }
    public void setControlsPassed(Integer controlsPassed) { this.controlsPassed = controlsPassed; }

    public Integer getControlsFailed() { return controlsFailed; }
    public void setControlsFailed(Integer controlsFailed) { this.controlsFailed = controlsFailed; }

    public Integer getControlsTotal() { return controlsTotal; }
    public void setControlsTotal(Integer controlsTotal) { this.controlsTotal = controlsTotal; }

    public String getLastAssessed() { return lastAssessed; }
    public void setLastAssessed(String lastAssessed) { this.lastAssessed = lastAssessed; }

    public String getTrend() { return trend; }
    public void setTrend(String trend) { this.trend = trend; }
}
