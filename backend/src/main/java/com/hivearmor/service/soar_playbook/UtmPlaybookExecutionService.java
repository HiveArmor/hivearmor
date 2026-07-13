package com.hivearmor.service.soar_playbook;

import com.hivearmor.domain.soar_playbook.UtmPlaybookExecution;
import com.hivearmor.repository.soar_playbook.UtmPlaybookExecutionRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
@Transactional
public class UtmPlaybookExecutionService {

    private static final String CLASSNAME = "UtmPlaybookExecutionService";
    private final Logger log = LoggerFactory.getLogger(UtmPlaybookExecutionService.class);

    private final UtmPlaybookExecutionRepository executionRepository;

    public UtmPlaybookExecution record(Long playbookId, String playbookName, String triggerType,
                                       String triggeredBy, String alertId, String status,
                                       int totalSteps, int completedSteps, String stepsLog,
                                       String errorMessage, Instant startedAt, Instant endedAt) {
        final String ctx = CLASSNAME + ".record";
        try {
            UtmPlaybookExecution execution = new UtmPlaybookExecution();
            execution.setPlaybookId(playbookId);
            execution.setPlaybookName(playbookName);
            execution.setTriggerType(triggerType);
            execution.setTriggeredBy(triggeredBy);
            execution.setAlertId(alertId);
            execution.setStatus(status);
            execution.setTotalSteps(totalSteps);
            execution.setCompletedSteps(completedSteps);
            execution.setStepsLog(stepsLog);
            execution.setErrorMessage(errorMessage);
            execution.setStartedAt(startedAt);
            execution.setEndedAt(endedAt);
            return executionRepository.save(execution);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }

    @Transactional(readOnly = true)
    public Page<UtmPlaybookExecution> findAll(Pageable pageable) {
        final String ctx = CLASSNAME + ".findAll";
        try {
            return executionRepository.findAllByOrderByStartedAtDesc(pageable);
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
        }
    }
}
