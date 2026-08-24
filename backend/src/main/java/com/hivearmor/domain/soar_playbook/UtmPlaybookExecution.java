package com.hivearmor.domain.soar_playbook;

import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_playbook_execution")
@Getter
@Setter
public class UtmPlaybookExecution implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "playbook_id", nullable = false)
    private Long playbookId;

    /** Client-facing execution id used by SSE stream and cancel endpoints. */
    @Column(name = "execution_uuid", length = 36)
    private String executionUuid;

    @Column(name = "playbook_name", length = 200, nullable = false)
    private String playbookName;

    @Column(name = "status", length = 20, nullable = false)
    private String status;

    @Column(name = "trigger_type", length = 50, nullable = false)
    private String triggerType;

    @Column(name = "triggered_by", length = 100, nullable = false)
    private String triggeredBy;

    @Column(name = "alert_id", length = 100)
    private String alertId;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Column(name = "total_steps", nullable = false)
    private Integer totalSteps = 0;

    @Column(name = "completed_steps", nullable = false)
    private Integer completedSteps = 0;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "steps_log", columnDefinition = "TEXT")
    private String stepsLog;

    public UtmPlaybookExecution() {
    }
}
