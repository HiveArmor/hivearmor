package com.hivearmor.service.hunt;

import com.hivearmor.domain.ResponseJob;
import com.hivearmor.repository.ResponseJobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for creating and tracking response action jobs.
 *
 * <p>Handles the lifecycle of a response job:
 * <ol>
 *   <li>Create a new job in PostgreSQL with status {@code "queued"}</li>
 *   <li>Async transition: queued → running → {@code unsupported}</li>
 *   <li>Remote containment is <strong>not</strong> executed — jobs finish honestly as unsupported</li>
 *   <li>Publish SSE event via InvestigationEventPublisher when available</li>
 * </ol>
 *
 * <p>Sprint 41 — ALT-010 Part 2: Response action job tracking (honesty fix: no fabricated success).
 */
@Service
public class ResponseJobService {

    private static final Logger log = LoggerFactory.getLogger(ResponseJobService.class);

    static final String UNSUPPORTED_MESSAGE =
        "Remote response execution is not implemented; no host or account was changed.";

    private final ResponseJobRepository responseJobRepository;

    /**
     * InvestigationEventPublisher is created in Task 6 — optional injection.
     * When null, SSE publish calls are silently skipped.
     */
    @Autowired(required = false)
    private InvestigationEventPublisher investigationEventPublisher;

    public ResponseJobService(ResponseJobRepository responseJobRepository) {
        this.responseJobRepository = responseJobRepository;
    }

    /**
     * Creates a new response job record in PostgreSQL with initial status "queued".
     *
     * @param actionId   the action identifier (e.g., "isolate_host")
     * @param targetId   the target entity identifier
     * @param targetType the type of target entity (host, user, ip, process, file)
     * @param parameters JSON-encoded parameters string
     * @param createdBy  the username of the analyst who initiated the action
     * @param tenantId   the tenant ID for ownership scoping
     * @param alertId    optional alert ID to link this job to an investigation
     * @return the persisted ResponseJob entity
     */
    public ResponseJob createJob(String actionId, String targetId, String targetType,
                                  String parameters, String createdBy, Long tenantId, String alertId) {
        ResponseJob job = new ResponseJob();
        job.setId(UUID.randomUUID().toString());
        job.setActionId(actionId);
        job.setTargetId(targetId);
        job.setTargetType(targetType);
        job.setParameters(parameters);
        job.setStatus("queued");
        job.setCreatedBy(createdBy);
        job.setTenantId(tenantId);
        job.setCreatedAt(Instant.now());
        job.setAlertId(alertId);

        ResponseJob saved = responseJobRepository.save(job);
        log.info("Created response job [{}] for action [{}] on target [{}] by [{}]",
            saved.getId(), actionId, targetId, createdBy);
        return saved;
    }

    /**
     * Marks a response job as {@code unsupported} asynchronously.
     *
     * <p>Remote host containment (isolate, kill process, quarantine, etc.) is not wired
     * through a real agent ProcessCommand path from this service. Fabricating
     * "isolated successfully" after a sleep would mislead operators — instead the job
     * transitions queued → running → unsupported with an explicit message.
     *
     * <p>On finish, publishes a {@code response.status} SSE event via
     * InvestigationEventPublisher if it is available.
     *
     * @param job the job to finalize
     */
    @Async
    public void executeAsync(ResponseJob job) {
        try {
            job.setStatus("running");
            job.setStartedAt(Instant.now());
            responseJobRepository.save(job);
            log.info("Job [{}] transitioned to running (remote execution not implemented)", job.getId());

            job.setStatus("unsupported");
            job.setCompletedAt(Instant.now());
            job.setErrorCode("NOT_IMPLEMENTED");
            job.setErrorMessage(UNSUPPORTED_MESSAGE);
            job.setResult(buildUnsupportedResult(job));
            responseJobRepository.save(job);
            log.info("Job [{}] marked unsupported — remote execution not implemented: {}",
                job.getId(), job.getActionId());

            publishStatusEvent(job);

        } catch (Exception e) {
            job.setStatus("failed");
            job.setCompletedAt(Instant.now());
            job.setErrorCode("EXECUTION_ERROR");
            job.setErrorMessage(e.getMessage());
            responseJobRepository.save(job);
            log.error("Job [{}] failed: {}", job.getId(), e.getMessage(), e);

            publishStatusEvent(job);
        }
    }

    /**
     * Fetches a job by ID and validates tenant ownership.
     *
     * @param jobId    the job identifier
     * @param tenantId the requesting user's tenant ID
     * @return the job if found and owned by the tenant, otherwise empty
     */
    public Optional<ResponseJob> getJob(String jobId, Long tenantId) {
        Optional<ResponseJob> optJob = responseJobRepository.findById(jobId);
        if (optJob.isEmpty()) {
            return Optional.empty();
        }
        ResponseJob job = optJob.get();
        // Validate tenant ownership
        if (!job.getTenantId().equals(tenantId)) {
            log.warn("Tenant [{}] attempted to access job [{}] owned by tenant [{}]",
                tenantId, jobId, job.getTenantId());
            return Optional.empty();
        }
        return Optional.of(job);
    }

    /**
     * Honest result text — never claims successful containment.
     */
    private String buildUnsupportedResult(ResponseJob job) {
        return "Action " + job.getActionId() + " on " + job.getTargetId()
            + " was not executed: remote response dispatch is not implemented.";
    }

    /**
     * Publishes a response.status SSE event if InvestigationEventPublisher is available.
     * Gracefully handles the case where the publisher is null (Task 6 not yet implemented).
     */
    private void publishStatusEvent(ResponseJob job) {
        if (investigationEventPublisher == null) {
            log.debug("InvestigationEventPublisher not available — skipping SSE publish for job [{}]", job.getId());
            return;
        }
        try {
            investigationEventPublisher.publishResponseStatus(job.getAlertId(), job.getId(), job.getStatus(), job.getResult());
        } catch (Exception e) {
            log.warn("Failed to publish SSE event for job [{}]: {}", job.getId(), e.getMessage());
        }
    }
}
