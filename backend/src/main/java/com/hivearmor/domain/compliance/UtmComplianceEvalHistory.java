package com.hivearmor.domain.compliance;

import jakarta.persistence.*;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "hive_compliance_eval_history")
public class UtmComplianceEvalHistory implements Serializable {
    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "framework_id", nullable = false)
    private Long frameworkId;

    @Column(name = "evaluated_at", nullable = false)
    private Instant evaluatedAt;

    @Column(name = "overall_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal overallScore;

    @Column(name = "controls_passed")
    private Integer controlsPassed;

    @Column(name = "controls_failed")
    private Integer controlsFailed;

    @Column(name = "controls_total")
    private Integer controlsTotal;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getFrameworkId() { return frameworkId; }
    public void setFrameworkId(Long frameworkId) { this.frameworkId = frameworkId; }
    public Instant getEvaluatedAt() { return evaluatedAt; }
    public void setEvaluatedAt(Instant evaluatedAt) { this.evaluatedAt = evaluatedAt; }
    public BigDecimal getOverallScore() { return overallScore; }
    public void setOverallScore(BigDecimal overallScore) { this.overallScore = overallScore; }
    public Integer getControlsPassed() { return controlsPassed; }
    public void setControlsPassed(Integer controlsPassed) { this.controlsPassed = controlsPassed; }
    public Integer getControlsFailed() { return controlsFailed; }
    public void setControlsFailed(Integer controlsFailed) { this.controlsFailed = controlsFailed; }
    public Integer getControlsTotal() { return controlsTotal; }
    public void setControlsTotal(Integer controlsTotal) { this.controlsTotal = controlsTotal; }
}
