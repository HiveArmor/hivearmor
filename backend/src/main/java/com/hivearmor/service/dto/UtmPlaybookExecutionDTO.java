package com.hivearmor.service.dto;

import com.hivearmor.domain.soar_playbook.UtmPlaybookExecution;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UtmPlaybookExecutionDTO {

    private Long id;
    private Long playbookId;
    private String playbookName;
    private String status;
    private String triggerType;
    private String triggeredBy;
    private String alertId;
    private Instant startedAt;
    private Instant endedAt;
    private Integer totalSteps;
    private Integer completedSteps;
    private String errorMessage;
    private String stepsLog;

    public UtmPlaybookExecutionDTO(UtmPlaybookExecution entity) {
        this.id = entity.getId();
        this.playbookId = entity.getPlaybookId();
        this.playbookName = entity.getPlaybookName();
        this.status = entity.getStatus();
        this.triggerType = entity.getTriggerType();
        this.triggeredBy = entity.getTriggeredBy();
        this.alertId = entity.getAlertId();
        this.startedAt = entity.getStartedAt();
        this.endedAt = entity.getEndedAt();
        this.totalSteps = entity.getTotalSteps();
        this.completedSteps = entity.getCompletedSteps();
        this.errorMessage = entity.getErrorMessage();
        this.stepsLog = entity.getStepsLog();
    }
}
