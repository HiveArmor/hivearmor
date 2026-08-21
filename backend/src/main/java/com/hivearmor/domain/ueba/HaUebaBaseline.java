package com.hivearmor.domain.ueba;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;

/**
 * JPA entity mapped to {@code ha_ueba_baseline} table.
 *
 * <p>Represents the computed baseline (arithmetic mean and sample standard deviation)
 * for one metric within one peer group on a given computation date.
 *
 * <p>Unique constraint: {@code (group_key, metric_name, computed_on)}.
 */
@Entity
@Table(name = "ha_ueba_baseline")
public class HaUebaBaseline {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_key", nullable = false, length = 255)
    private String groupKey;

    @Column(name = "metric_name", nullable = false, length = 64)
    private String metricName;

    @Column(name = "computed_on", nullable = false)
    private LocalDate computedOn;

    @Column(name = "baseline_mean", nullable = false)
    private double baselineMean;

    @Column(name = "baseline_stddev", nullable = false)
    private double baselineStddev;

    @Column(name = "sample_size", nullable = false)
    private int sampleSize;

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

    public String getGroupKey() {
        return groupKey;
    }

    public void setGroupKey(String groupKey) {
        this.groupKey = groupKey;
    }

    public String getMetricName() {
        return metricName;
    }

    public void setMetricName(String metricName) {
        this.metricName = metricName;
    }

    public LocalDate getComputedOn() {
        return computedOn;
    }

    public void setComputedOn(LocalDate computedOn) {
        this.computedOn = computedOn;
    }

    public double getBaselineMean() {
        return baselineMean;
    }

    public void setBaselineMean(double baselineMean) {
        this.baselineMean = baselineMean;
    }

    public double getBaselineStddev() {
        return baselineStddev;
    }

    public void setBaselineStddev(double baselineStddev) {
        this.baselineStddev = baselineStddev;
    }

    public int getSampleSize() {
        return sampleSize;
    }

    public void setSampleSize(int sampleSize) {
        this.sampleSize = sampleSize;
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
