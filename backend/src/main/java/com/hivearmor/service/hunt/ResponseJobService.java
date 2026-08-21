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
 * Service for creating and executing response action jobs asynchronously.
 *
 * <p>Handles the full lifecycle of a response job:
 * <ol>
 *   <li>Create a new job in PostgreSQL with status {@code "queued"}</li>
 *   <li>Dispatch async execution (simulated 5-second delay)</li>
 *   <li>Transition status: queued → running → completed/failed</li>
 *   <li>On completion, publish SSE event via InvestigationEventPublisher (when available)</li>
 * </ol>
 *
 * <p>Sprint 41 — ALT-010 Part 2: Response action execution and job tracking.
 */
@Service
public class ResponseJobService {

    private static final Logger log = LoggerFactory.getLogger(ResponseJobService.class);

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
     * Executes a response job asynchronously. Simulates execution with a 5-second delay,
     * then updates status to "completed" with a result message.
     *
     * <p>Status transitions: queued → running (on start) → completed/failed (on finish).
     *
     * <p>On completion, publishes a {@code response.status} SSE event via
     * InvestigationEventPublisher if it is available.
     *
     * @param job the job to execute
     */
    @Async
    public void executeAsync(ResponseJob job) {
        try {
            // Transition: queued → running
            job.setStatus("running");
            job.setStartedAt(Instant.now());
            responseJobRepository.save(job);
            log.info("Job [{}] transitioned to running", job.getId());

            // Simulate execution (5-second delay)
            Thread.sleep(5000);

            // Transition: running → completed
            job.setStatus("completed");
            job.setCompletedAt(Instant.now());
            job.setResult(buildResultMessage(job));
            responseJobRepository.save(job);
            log.info("Job [{}] completed successfully: {}", job.getId(), job.getResult());

            // Publish SSE event if publisher is available
            publishStatusEvent(job);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            // Transition: running → failed
            job.setStatus("failed");
            job.setCompletedAt(Instant.now());
            job.setErrorCode("INTERRUPTED");
            job.setErrorMessage("Job execution was interrupted");
            responseJobRepository.save(job);
            log.warn("Job [{}] was interrupted", job.getId());

            publishStatusEvent(job);

        } catch (Exception e) {
            // Transition: running → failed
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
     * Builds a human-readable result message based on the action and target.
     */
    private String buildResultMessage(ResponseJob job) {
        return switch (job.getActionId()) {
            case "isolate_host" -> "Host " + job.getTargetId() + " isolated from network successfully";
            case "kill_process" -> "Process " + job.getTargetId() + " terminated successfully";
            case "block_ip" -> "IP " + job.getTargetId() + " blocked at firewall successfully";
            case "disable_account" -> "Account " + job.getTargetId() + " disabled in Active Directory";
            case "quarantine_file" -> "File " + job.getTargetId() + " quarantined successfully";
            case "revoke_sessions" -> "All sessions for " + job.getTargetId() + " revoked";
            case "collect_forensics" -> "Forensic artifacts collected from " + job.getTargetId();
            case "run_scan" -> "Antivirus scan completed on " + job.getTargetId();
            default -> "Action " + job.getActionId() + " completed on " + job.getTargetId();
        };
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
