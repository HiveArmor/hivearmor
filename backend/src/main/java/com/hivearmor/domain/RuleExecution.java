package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the {@code rule_executions} table.
 *
 * <p>Tracks individual execution runs of detection rules including duration,
 * alert counts, event scan counts, and error information.
 *
 * <p>Sprint 47 — Detection Rules (DET-009).
 *
 * @see com.hivearmor.repository.RuleExecutionRepository
 */
@Entity
@Table(name = "rule_executions")
public class RuleExecution implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "rule_id", length = 36, nullable = false)
    private String ruleId;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "duration")
    private Long duration;

    @Column(name = "status", length = 32, nullable = false)
    private String status;

    @Column(name = "alerts_generated")
    private Integer alertsGenerated;

    @Column(name = "events_scanned")
    private Long eventsScanned;

    @Column(name = "errors", columnDefinition = "text")
    private String errors;

    @Column(name = "triggered_by", length = 32, nullable = false)
    private String triggeredBy;

    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    // ---- getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getRuleId() { return ruleId; }
    public void setRuleId(String ruleId) { this.ruleId = ruleId; }

    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }

    public Long getDuration() { return duration; }
    public void setDuration(Long duration) { this.duration = duration; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Integer getAlertsGenerated() { return alertsGenerated; }
    public void setAlertsGenerated(Integer alertsGenerated) { this.alertsGenerated = alertsGenerated; }

    public Long getEventsScanned() { return eventsScanned; }
    public void setEventsScanned(Long eventsScanned) { this.eventsScanned = eventsScanned; }

    public String getErrors() { return errors; }
    public void setErrors(String errors) { this.errors = errors; }

    public String getTriggeredBy() { return triggeredBy; }
    public void setTriggeredBy(String triggeredBy) { this.triggeredBy = triggeredBy; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }
}
