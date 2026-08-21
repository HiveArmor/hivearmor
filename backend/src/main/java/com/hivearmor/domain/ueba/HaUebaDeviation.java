package com.hivearmor.domain.ueba;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * JPA entity mapped to {@code ha_ueba_deviation} table.
 *
 * <p>Represents one deviation score for a single user and metric within a scoring run.
 * Stores the z-score, the points awarded by the tiered rubric, and the raw observed value.
 *
 * <p>Unique constraint: {@code (user_id, metric_name, run_ts)}.
 */
@Entity
@Table(name = "ha_ueba_deviation")
public class HaUebaDeviation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 128)
    private String userId;

    @Column(name = "metric_name", nullable = false, length = 64)
    private String metricName;

    @Column(name = "run_ts", nullable = false)
    private Instant runTs;

    @Column(name = "z_score", nullable = false)
    private double zScore;

    @Column(name = "points", nullable = false)
    private int points;

    @Column(name = "observed_value")
    private Double observedValue;

    @Column(name = "tenant_id", length = 64)
    private String tenantId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    private void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = Instant.now();
        }
    }

    // --- Getters and Setters ---

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getMetricName() {
        return metricName;
    }

    public void setMetricName(String metricName) {
        this.metricName = metricName;
    }

    public Instant getRunTs() {
        return runTs;
    }

    public void setRunTs(Instant runTs) {
        this.runTs = runTs;
    }

    public double getZScore() {
        return zScore;
    }

    public void setZScore(double zScore) {
        this.zScore = zScore;
    }

    public int getPoints() {
        return points;
    }

    public void setPoints(int points) {
        this.points = points;
    }

    public Double getObservedValue() {
        return observedValue;
    }

    public void setObservedValue(Double observedValue) {
        this.observedValue = observedValue;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
