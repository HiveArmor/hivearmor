package com.hivearmor.service.dto;

import java.time.Instant;

/**
 * DTO representing a single execution record for a HiveArmor SOAR playbook.
 *
 * <p>status values: "running" | "success" | "failure" | "cancelled"</p>
 * <p>triggeredBy values: "admin" or "alert:{alertId}"</p>
 */
public class PlaybookExecutionDTO {

    private String executionId;
    private Long playbookId;
    private String playbookName;
    private Instant startedAt;
    private Instant completedAt;
    private Long durationSeconds;
    /** Allowed values: "running", "success", "failure", "cancelled". */
    private String status;
    /** Either "admin" or "alert:{alertId}". */
    private String triggeredBy;

    public String getExecutionId() {
        return executionId;
    }

    public void setExecutionId(String executionId) {
        this.executionId = executionId;
    }

    public Long getPlaybookId() {
        return playbookId;
    }

    public void setPlaybookId(Long playbookId) {
        this.playbookId = playbookId;
    }

    public String getPlaybookName() {
        return playbookName;
    }

    public void setPlaybookName(String playbookName) {
        this.playbookName = playbookName;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }

    public Long getDurationSeconds() {
        return durationSeconds;
    }

    public void setDurationSeconds(Long durationSeconds) {
        this.durationSeconds = durationSeconds;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getTriggeredBy() {
        return triggeredBy;
    }

    public void setTriggeredBy(String triggeredBy) {
        this.triggeredBy = triggeredBy;
    }
}
