package com.hivearmor.service.dto;

import java.time.Instant;
import java.util.List;

/**
 * DTO for a HiveArmor SOAR playbook.
 *
 * <p>triggerType values: "manual" | "alert-triggered" | "scheduled"</p>
 * <p>lastRunStatus values: "success" | "failure" | "running" | null</p>
 */
public class PlaybookDTO {

    private Long id;
    private String name;
    private String description;
    /** Allowed values: "manual", "alert-triggered", "scheduled". */
    private String triggerType;
    private Boolean active;
    private Integer runCount;
    private Instant lastRunAt;
    /** Allowed values: "success", "failure", "running", or null. */
    private String lastRunStatus;
    private List<PlaybookStepDTO> steps;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getTriggerType() {
        return triggerType;
    }

    public void setTriggerType(String triggerType) {
        this.triggerType = triggerType;
    }

    public Boolean getActive() {
        return active;
    }

    public void setActive(Boolean active) {
        this.active = active;
    }

    public Integer getRunCount() {
        return runCount;
    }

    public void setRunCount(Integer runCount) {
        this.runCount = runCount;
    }

    public Instant getLastRunAt() {
        return lastRunAt;
    }

    public void setLastRunAt(Instant lastRunAt) {
        this.lastRunAt = lastRunAt;
    }

    public String getLastRunStatus() {
        return lastRunStatus;
    }

    public void setLastRunStatus(String lastRunStatus) {
        this.lastRunStatus = lastRunStatus;
    }

    public List<PlaybookStepDTO> getSteps() {
        return steps;
    }

    public void setSteps(List<PlaybookStepDTO> steps) {
        this.steps = steps;
    }
}
