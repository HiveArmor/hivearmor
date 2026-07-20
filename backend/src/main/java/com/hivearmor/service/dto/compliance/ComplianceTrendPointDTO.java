package com.hivearmor.service.dto.compliance;

import java.math.BigDecimal;

public class ComplianceTrendPointDTO {
    private String evaluatedAt;
    private BigDecimal overallScore;
    private Integer controlsPassed;
    private Integer controlsFailed;
    private Integer controlsTotal;

    public ComplianceTrendPointDTO(String evaluatedAt, BigDecimal overallScore,
                                   Integer controlsPassed, Integer controlsFailed, Integer controlsTotal) {
        this.evaluatedAt = evaluatedAt;
        this.overallScore = overallScore;
        this.controlsPassed = controlsPassed;
        this.controlsFailed = controlsFailed;
        this.controlsTotal = controlsTotal;
    }

    public String getEvaluatedAt() { return evaluatedAt; }
    public BigDecimal getOverallScore() { return overallScore; }
    public Integer getControlsPassed() { return controlsPassed; }
    public Integer getControlsFailed() { return controlsFailed; }
    public Integer getControlsTotal() { return controlsTotal; }
}
