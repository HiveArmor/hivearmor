package com.hivearmor.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.Constants;
import com.hivearmor.config.HaAirGapConfig;
import com.hivearmor.domain.soar_playbook.UtmPlaybook;
import com.hivearmor.domain.soar_playbook.UtmPlaybookExecution;
import com.hivearmor.repository.soar_playbook.UtmPlaybookExecutionRepository;
import com.hivearmor.repository.soar_playbook.UtmPlaybookRepository;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.dto.PlaybookDTO;
import com.hivearmor.service.dto.PlaybookExecuteRequestDTO;
import com.hivearmor.service.dto.PlaybookExecutionDTO;
import com.hivearmor.service.dto.PlaybookStepDTO;
import com.hivearmor.service.dto.edr.EdrIsolationDTO;
import com.hivearmor.service.dto.edr.EdrQuarantineDTO;
import com.hivearmor.service.edr.EdrService;
import com.hivearmor.service.connector.HybridIsolateRouter;
import com.hivearmor.service.connector.HybridResponseMeshDispatcher;
import com.hivearmor.service.connector.PlaybookConnectorDispatcher;
import com.hivearmor.service.soar.PlaybookConditionEvaluator;
import com.hivearmor.service.soar.PlaybookWebhookExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * HiveArmor SOAR playbooks — persists to {@code hive_playbook} / {@code hive_playbook_execution}.
 *
 * <p>Step execution dispatches known EDR actions via {@link EdrService} when {@code agentId}
 * is present (from step config or execute request context); webhooks via
 * {@link PlaybookWebhookExecutor}; email via {@link MailService}; ticketing via
 * webhook-to-ticket ({@code create-jira-ticket}); connector capability actions via
 * {@link PlaybookConnectorDispatcher}; isolate via {@link HybridResponseMeshDispatcher}
 * (HA agent preferred; vendor ISOLATE_HOST dry-run when feature-flagged); unknown
 * actions fail honestly with {@code not_implemented}.
 * Condition steps use {@link PlaybookConditionEvaluator}; approval steps pause
 * execution as {@code awaiting_approval} until approve/reject.
 * Step configs MUST NOT be logged.
 */
@Service
public class PlaybookService {

    private static final Logger log = LoggerFactory.getLogger(PlaybookService.class);
    private static final int MAX_DELAY_SECONDS = 120;
    private static final Set<String> ISOLATE_IDS = Set.of(
        "isolate_host", "isolate-host", "edr.isolate-host", "edr.isolate_host");
    private static final Set<String> QUARANTINE_IDS = Set.of(
        "quarantine_file", "quarantine-file", "edr.quarantine-file", "edr.quarantine_file");
    private static final Set<String> KILL_IDS = Set.of(
        "kill_process", "kill-process", "edr.kill-process", "edr.kill_process");
    private static final Set<String> WEBHOOK_IDS = Set.of(
        "send-webhook", "send_webhook", "webhook", "http-webhook");
    private static final Set<String> EMAIL_IDS = Set.of(
        "send-email", "send_email", "email", "notify-email");
    private static final Set<String> TICKET_IDS = Set.of(
        "create-jira-ticket", "create_jira_ticket", "jira-ticket", "create-ticket",
        "create_ticket", "webhook-ticket", "webhook_ticket");

    private final PlaybookExecutionStreamService playbookExecutionStreamService;
    private final ObjectMapper objectMapper;
    private final UtmPlaybookRepository playbookRepository;
    private final UtmPlaybookExecutionRepository executionRepository;
    private final EdrService edrService;
    private final PlaybookWebhookExecutor webhookExecutor;
    private final PlaybookConnectorDispatcher connectorDispatcher;
    private final HybridResponseMeshDispatcher hybridResponseMesh;
    private final MailService mailService;
    private final HaAirGapConfig haAirGapConfig;

    /** executionUuid → cancelled */
    private final ConcurrentHashMap<String, Boolean> cancelledExecutions = new ConcurrentHashMap<>();
    /** executionUuid → runtime context from execute request */
    private final ConcurrentHashMap<String, PlaybookExecuteRequestDTO> executionContexts = new ConcurrentHashMap<>();

    public PlaybookService(PlaybookExecutionStreamService playbookExecutionStreamService,
                           ObjectMapper objectMapper,
                           UtmPlaybookRepository playbookRepository,
                           UtmPlaybookExecutionRepository executionRepository,
                           EdrService edrService,
                           PlaybookWebhookExecutor webhookExecutor,
                           PlaybookConnectorDispatcher connectorDispatcher,
                           HybridResponseMeshDispatcher hybridResponseMesh,
                           MailService mailService,
                           HaAirGapConfig haAirGapConfig) {
        this.playbookExecutionStreamService = playbookExecutionStreamService;
        this.objectMapper = objectMapper;
        this.playbookRepository = playbookRepository;
        this.executionRepository = executionRepository;
        this.edrService = edrService;
        this.webhookExecutor = webhookExecutor;
        this.connectorDispatcher = connectorDispatcher;
        this.hybridResponseMesh = hybridResponseMesh;
        this.mailService = mailService;
        this.haAirGapConfig = haAirGapConfig;
    }

    public String serializeSteps(List<PlaybookStepDTO> steps) {
        try {
            return objectMapper.writeValueAsString(steps != null ? steps : List.of());
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new RuntimeException("Failed to serialise playbook steps", e);
        }
    }

    public List<PlaybookStepDTO> deserializeSteps(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<PlaybookStepDTO>>() {});
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialise playbook steps", e);
        }
    }

    @Transactional
    public PlaybookDTO create(PlaybookDTO dto) {
        UtmPlaybook entity = new UtmPlaybook();
        applyDtoToEntity(entity, dto, true);
        UtmPlaybook saved = playbookRepository.save(entity);
        return toDto(saved, true);
    }

    @Transactional
    public Optional<PlaybookDTO> update(Long id, PlaybookDTO dto) {
        Optional<UtmPlaybook> entityOpt = playbookRepository.findById(id);
        if (entityOpt.isEmpty()) {
            return Optional.empty();
        }
        UtmPlaybook entity = entityOpt.get();
        applyDtoToEntity(entity, dto, false);
        return Optional.of(toDto(playbookRepository.save(entity), true));
    }

    @Transactional(readOnly = true)
    public List<PlaybookDTO> findAll() {
        List<UtmPlaybook> entities = playbookRepository.findAll();
        List<PlaybookDTO> results = new ArrayList<>(entities.size());
        for (UtmPlaybook entity : entities) {
            results.add(toDto(entity, true));
        }
        return results;
    }

    /**
     * Compact metrics for the Response playbooks workload strip.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> metricsSummary() {
        List<PlaybookDTO> playbooks = findAll();
        long active = playbooks.stream().filter(p -> Boolean.TRUE.equals(p.getActive())).count();
        Instant since = Instant.now().minus(Duration.ofHours(24));
        List<UtmPlaybookExecution> recent = executionRepository.findAll().stream()
            .filter(e -> e.getStartedAt() != null && !e.getStartedAt().isBefore(since))
            .toList();
        long success = recent.stream()
            .filter(e -> "success".equalsIgnoreCase(normalizeStatus(e.getStatus())))
            .count();
        double successRate = recent.isEmpty() ? 0.0 : (success * 100.0) / recent.size();

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("total", playbooks.size());
        metrics.put("active", active);
        metrics.put("executionsLast24h", recent.size());
        metrics.put("successRate24h", Math.round(successRate * 10.0) / 10.0);
        metrics.put("pendingApprovals", 0);
        metrics.put("activeQuarantines", 0);
        metrics.put("snapshotAt", Instant.now().toString());
        return metrics;
    }

    @Transactional(readOnly = true)
    public Optional<PlaybookDTO> findOne(Long id) {
        return playbookRepository.findById(id).map(e -> toDto(e, true));
    }

    @Transactional(readOnly = true)
    public List<PlaybookExecutionDTO> findExecutionHistory(Long playbookId) {
        List<UtmPlaybookExecution> rows =
            executionRepository.findByPlaybookIdOrderByStartedAtDesc(playbookId);
        List<PlaybookExecutionDTO> history = new ArrayList<>(rows.size());
        for (UtmPlaybookExecution row : rows) {
            history.add(toExecutionDto(row));
        }
        return Collections.unmodifiableList(history);
    }

    /**
     * Creates a RUNNING execution row and returns its UUID for SSE / cancel.
     */
    @Transactional
    public String execute(Long id) {
        return execute(id, null);
    }

    /**
     * Creates a RUNNING execution with optional runtime context (agentId, alertId, inputs).
     */
    @Transactional
    public String execute(Long id, PlaybookExecuteRequestDTO request) {
        UtmPlaybook playbook = playbookRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Playbook not found: " + id));
        List<PlaybookStepDTO> steps = deserializeSteps(playbook.getStepsJson());
        String executionUuid = UUID.randomUUID().toString();
        String triggeredBy = SecurityUtils.getCurrentUserLogin().orElse("system");

        UtmPlaybookExecution execution = new UtmPlaybookExecution();
        execution.setPlaybookId(playbook.getId());
        execution.setPlaybookName(playbook.getName());
        execution.setExecutionUuid(executionUuid);
        execution.setStatus("running");
        execution.setTriggerType(readTriggerType(playbook.getDefinitionJson()));
        execution.setTriggeredBy(triggeredBy);
        if (request != null && request.getAlertId() != null && !request.getAlertId().isBlank()) {
            execution.setAlertId(request.getAlertId());
        }
        execution.setStartedAt(Instant.now());
        execution.setTotalSteps(steps.size());
        execution.setCompletedSteps(0);
        execution.setStepsLog(serializeExecutionMeta(executionUuid, List.of(), null));
        executionRepository.save(execution);

        cancelledExecutions.remove(executionUuid);
        if (request != null) {
            executionContexts.put(executionUuid, request);
        } else {
            executionContexts.remove(executionUuid);
        }
        return executionUuid;
    }

    /**
     * Dry-run preview for the Response UI — validates playbook exists and returns a token
     * plus step summaries. Does not enforce token on execute yet (MVP).
     */
    @Transactional(readOnly = true)
    public Map<String, Object> preview(Long id, PlaybookExecuteRequestDTO request) {
        UtmPlaybook playbook = playbookRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Playbook not found: " + id));
        List<PlaybookStepDTO> steps = deserializeSteps(playbook.getStepsJson());
        List<Map<String, Object>> summaries = new ArrayList<>();
        boolean approvalRequired = false;
        for (int i = 0; i < steps.size(); i++) {
            PlaybookStepDTO step = steps.get(i);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("stepOrder", i);
            row.put("actionName", step.getLabel() != null ? step.getLabel() : "Step " + (i + 1));
            row.put("targetDescription", describeStepTarget(step, request));
            row.put("estimatedDurationMs", "delay".equalsIgnoreCase(step.getStepType()) ? 2000 : 500);
            summaries.add(row);
            if ("approval".equalsIgnoreCase(step.getStepType())) {
                approvalRequired = true;
            }
            if (step.getConfig() != null && Boolean.TRUE.equals(step.getConfig().get("approvalRequired"))) {
                approvalRequired = true;
            }
        }
        Map<String, Object> blast = new LinkedHashMap<>();
        blast.put("affectedTargets", List.of());
        blast.put("riskLevel", approvalRequired ? "HIGH" : "MEDIUM");
        blast.put("reversible", true);
        blast.put("rollbackGuidance", "Use cancel on the live execution stream if a step has not completed.");
        blast.put("requiredPermission", "ROLE_ADMIN");
        blast.put("mitreReference", null);

        Map<String, Object> validation = new LinkedHashMap<>();
        validation.put("valid", true);
        validation.put("errors", List.of());
        validation.put("warnings", List.of());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("previewToken", UUID.randomUUID().toString());
        body.put("playbookId", String.valueOf(id));
        body.put("estimatedDurationSeconds", Math.max(1, steps.size()));
        body.put("stepCount", steps.size());
        body.put("blastRadius", blast);
        body.put("approvalRequired", approvalRequired);
        body.put("validationResult", validation);
        body.put("stepSummaries", summaries);
        return body;
    }

    private String describeStepTarget(PlaybookStepDTO step, PlaybookExecuteRequestDTO request) {
        if (request != null && request.getAgentId() != null && !request.getAgentId().isBlank()) {
            return "agent:" + request.getAgentId();
        }
        if (request != null && request.getHostname() != null && !request.getHostname().isBlank()) {
            return "host:" + request.getHostname();
        }
        if (step.getConfig() != null && step.getConfig().get("actionId") != null) {
            return String.valueOf(step.getConfig().get("actionId"));
        }
        return step.getStepType() != null ? step.getStepType() : "step";
    }

    @Transactional
    public void setActive(Long id, boolean active) {
        UtmPlaybook playbook = playbookRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Playbook not found: " + id));
        playbook.setIsActive(active);
        playbookRepository.save(playbook);
    }

    public void cancelExecution(String executionId) {
        if (executionId == null || executionId.isBlank()) {
            return;
        }
        cancelledExecutions.put(executionId, Boolean.TRUE);
        executionRepository.findByExecutionUuid(executionId).ifPresent(row -> {
            String st = row.getStatus() != null ? row.getStatus().toLowerCase(Locale.ROOT) : "";
            if ("running".equals(st) || "awaiting_approval".equals(st)) {
                row.setStatus("cancelled");
                row.setEndedAt(Instant.now());
                row.setErrorMessage("Cancelled by operator");
                executionRepository.save(row);
            }
        });
        executionContexts.remove(executionId);
    }

    /**
     * Approve a paused playbook and resume from the step after the approval gate.
     * Admin-only (enforced at REST). STAGING CANDIDATE.
     */
    @Transactional
    public Map<String, Object> approveExecution(String executionId) {
        return resolveApprovalGate(executionId, true, null);
    }

    /**
     * Reject a paused playbook — marks failure and does not resume actions.
     */
    @Transactional
    public Map<String, Object> rejectExecution(String executionId, String reason) {
        return resolveApprovalGate(executionId, false, reason);
    }

    private Map<String, Object> resolveApprovalGate(String executionId, boolean approved, String reason) {
        if (executionId == null || executionId.isBlank()) {
            throw new IllegalArgumentException("executionId required");
        }
        UtmPlaybookExecution execution = executionRepository.findByExecutionUuid(executionId)
            .orElseThrow(() -> new IllegalArgumentException("Execution not found: " + executionId));
        if (!"awaiting_approval".equalsIgnoreCase(execution.getStatus())) {
            throw new IllegalStateException("Execution is not awaiting approval (status="
                + execution.getStatus() + ")");
        }
        int pendingIndex = readPendingApprovalStepIndex(execution.getStepsLog());
        if (pendingIndex < 0) {
            throw new IllegalStateException("Missing pendingApprovalStepIndex in execution log");
        }

        List<Map<String, Object>> stepLog = readStepLog(execution.getStepsLog());
        String actor = SecurityUtils.getCurrentUserLogin().orElse("operator");

        if (!approved) {
            String msg = (reason != null && !reason.isBlank())
                ? reason.trim()
                : "Rejected by " + actor;
            Map<String, Object> rejectEntry = new LinkedHashMap<>();
            rejectEntry.put("stepIndex", pendingIndex);
            rejectEntry.put("stepType", "approval");
            rejectEntry.put("status", "rejected");
            rejectEntry.put("output", Map.of("approved", false, "actor", actor, "reason", msg));
            stepLog.add(rejectEntry);
            execution.setStepsLog(serializeExecutionMeta(executionId, stepLog, null));
            execution.setStatus("failure");
            execution.setErrorMessage(msg);
            execution.setEndedAt(Instant.now());
            executionRepository.save(execution);
            executionContexts.remove(executionId);
            PlaybookExecutionEvent failed = new PlaybookExecutionEvent();
            failed.setType("playbook_failed");
            failed.setErrorMessage(msg);
            failed.setTimestamp(Instant.now().toString());
            playbookExecutionStreamService.broadcastEvent(executionId, failed);
            return Map.of(
                "executionId", executionId,
                "status", "failure",
                "approved", false
            );
        }

        Map<String, Object> approveEntry = new LinkedHashMap<>();
        approveEntry.put("stepIndex", pendingIndex);
        approveEntry.put("stepType", "approval");
        approveEntry.put("status", "approved");
        approveEntry.put("output", Map.of("approved", true, "actor", actor));
        stepLog.add(approveEntry);
        execution.setStatus("running");
        execution.setErrorMessage(null);
        execution.setEndedAt(null);
        execution.setStepsLog(serializeExecutionMeta(executionId, stepLog, null));
        execution.setCompletedSteps(Math.max(execution.getCompletedSteps(), pendingIndex + 1));
        executionRepository.save(execution);

        PlaybookExecutionEvent approvedEvt = new PlaybookExecutionEvent();
        approvedEvt.setType("step_completed");
        approvedEvt.setStepIndex(pendingIndex);
        approvedEvt.setStepLabel("Approval");
        approvedEvt.setStepType("approval");
        approvedEvt.setOutput(Map.of("approved", true, "actor", actor));
        approvedEvt.setTimestamp(Instant.now().toString());
        playbookExecutionStreamService.broadcastEvent(executionId, approvedEvt);

        Long playbookId = execution.getPlaybookId();
        // Continue on this thread. (@Async self-invoke would skip the proxy; unit tests
        // also need deterministic resume without racing a daemon thread.)
        executeAsyncFrom(executionId, playbookId, pendingIndex + 1, new ArrayList<>(stepLog));

        String finalStatus = executionRepository.findByExecutionUuid(executionId)
            .map(UtmPlaybookExecution::getStatus)
            .orElse("RUNNING");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("executionId", executionId);
        body.put("status", finalStatus);
        body.put("approved", true);
        body.put("resumeFromStep", pendingIndex + 1);
        return body;
    }

    @Async
    public void executeAsync(String executionId, Long playbookId) {
        executeAsyncFrom(executionId, playbookId, 0, new ArrayList<>());
    }

    private void executeAsyncFrom(String executionId, Long playbookId, int fromStepIndex,
                                  List<Map<String, Object>> priorLog) {
        Optional<UtmPlaybook> playbookOpt = playbookRepository.findById(playbookId);
        Optional<UtmPlaybookExecution> executionOpt =
            executionRepository.findByExecutionUuid(executionId);

        if (playbookOpt.isEmpty() || executionOpt.isEmpty()) {
            broadcastFailed(executionId, "Playbook or execution record not found");
            return;
        }

        UtmPlaybook playbook = playbookOpt.get();
        UtmPlaybookExecution execution = executionOpt.get();
        PlaybookExecuteRequestDTO context = executionContexts.get(executionId);
        List<PlaybookStepDTO> steps = mergeContextIntoSteps(
            deserializeSteps(playbook.getStepsJson()), context);
        List<Map<String, Object>> stepLog = priorLog != null
            ? new ArrayList<>(priorLog)
            : new ArrayList<>();
        int completed = Math.max(0, fromStepIndex);
        boolean failed = false;
        boolean awaitingApproval = false;
        boolean stopSuccess = false;
        String failureMessage = null;
        Integer pendingApprovalStep = null;

        try {
            for (int i = Math.max(0, fromStepIndex); i < steps.size(); i++) {
                if (Boolean.TRUE.equals(cancelledExecutions.get(executionId))) {
                    failed = true;
                    failureMessage = "Cancelled by operator";
                    break;
                }

                PlaybookStepDTO step = steps.get(i);
                String label = step.getLabel() != null ? step.getLabel() : "Step " + (i + 1);
                String stepType = step.getStepType() != null ? step.getStepType() : "action";

                PlaybookExecutionEvent started = new PlaybookExecutionEvent();
                started.setType("step_started");
                started.setStepIndex(i);
                started.setStepLabel(label);
                started.setStepType(stepType);
                started.setTimestamp(Instant.now().toString());
                playbookExecutionStreamService.broadcastEvent(executionId, started);

                StepResult result = runStep(step, playbook.getName(), context);
                Map<String, Object> logEntry = new LinkedHashMap<>();
                logEntry.put("stepIndex", i);
                logEntry.put("label", label);
                logEntry.put("stepType", stepType);
                if (result.pause) {
                    logEntry.put("status", "awaiting_approval");
                } else if (result.ok) {
                    logEntry.put("status", "success");
                } else {
                    logEntry.put("status", "failure");
                }
                logEntry.put("output", result.output);
                if (result.errorMessage != null) {
                    logEntry.put("error", result.errorMessage);
                }
                stepLog.add(logEntry);

                if (result.pause) {
                    awaitingApproval = true;
                    pendingApprovalStep = i;
                    PlaybookExecutionEvent pausedEvt = new PlaybookExecutionEvent();
                    pausedEvt.setType("approval_required");
                    pausedEvt.setStepIndex(i);
                    pausedEvt.setStepLabel(label);
                    pausedEvt.setStepType(stepType);
                    pausedEvt.setOutput(result.output);
                    pausedEvt.setTimestamp(Instant.now().toString());
                    playbookExecutionStreamService.broadcastEvent(executionId, pausedEvt);
                    break;
                }

                if (result.ok) {
                    completed = i + 1;
                    PlaybookExecutionEvent completedEvt = new PlaybookExecutionEvent();
                    completedEvt.setType("step_completed");
                    completedEvt.setStepIndex(i);
                    completedEvt.setStepLabel(label);
                    completedEvt.setStepType(stepType);
                    completedEvt.setOutput(result.output);
                    completedEvt.setTimestamp(Instant.now().toString());
                    playbookExecutionStreamService.broadcastEvent(executionId, completedEvt);
                    if (result.stopSuccess) {
                        stopSuccess = true;
                        break;
                    }
                } else {
                    failed = true;
                    failureMessage = result.errorMessage != null
                        ? result.errorMessage
                        : "Step failed";
                    PlaybookExecutionEvent failedEvt = new PlaybookExecutionEvent();
                    failedEvt.setType("step_failed");
                    failedEvt.setStepIndex(i);
                    failedEvt.setStepLabel(label);
                    failedEvt.setStepType(stepType);
                    failedEvt.setErrorMessage(failureMessage);
                    failedEvt.setTimestamp(Instant.now().toString());
                    playbookExecutionStreamService.broadcastEvent(executionId, failedEvt);
                    break;
                }
            }

            if (Boolean.TRUE.equals(cancelledExecutions.get(executionId))) {
                failed = true;
                failureMessage = "Cancelled by operator";
                awaitingApproval = false;
            }

            execution.setCompletedSteps(completed);
            if (awaitingApproval) {
                execution.setStatus("awaiting_approval");
                execution.setEndedAt(null);
                execution.setErrorMessage(null);
                execution.setStepsLog(serializeExecutionMeta(
                    executionId, stepLog, pendingApprovalStep));
                executionRepository.save(execution);
                // Keep executionContexts so resume has inputs/agentId.
                return;
            }

            PlaybookExecutionEvent terminal = new PlaybookExecutionEvent();
            terminal.setType(failed ? "playbook_failed" : "playbook_completed");
            terminal.setErrorMessage(failed ? failureMessage : null);
            terminal.setTimestamp(Instant.now().toString());
            playbookExecutionStreamService.broadcastEvent(executionId, terminal);

            execution.setStepsLog(serializeExecutionMeta(executionId, stepLog, null));
            execution.setEndedAt(Instant.now());
            if (Boolean.TRUE.equals(cancelledExecutions.get(executionId))) {
                execution.setStatus("cancelled");
                execution.setErrorMessage(failureMessage);
            } else if (failed) {
                execution.setStatus("failure");
                execution.setErrorMessage(failureMessage);
            } else {
                execution.setStatus("success");
                if (stopSuccess) {
                    // condition short-circuit — still success
                    execution.setErrorMessage(null);
                }
            }
            executionRepository.save(execution);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            broadcastFailed(executionId, "Execution interrupted");
            execution.setStatus("failure");
            execution.setErrorMessage("Execution interrupted");
            execution.setEndedAt(Instant.now());
            execution.setCompletedSteps(completed);
            execution.setStepsLog(serializeExecutionMeta(executionId, stepLog, null));
            executionRepository.save(execution);
        } catch (Exception e) {
            log.warn("Playbook execution {} failed: {}", executionId, e.getClass().getSimpleName());
            broadcastFailed(executionId, "Execution engine error");
            execution.setStatus("failure");
            execution.setErrorMessage("Execution engine error");
            execution.setEndedAt(Instant.now());
            execution.setCompletedSteps(completed);
            execution.setStepsLog(serializeExecutionMeta(executionId, stepLog, null));
            executionRepository.save(execution);
            executionContexts.remove(executionId);
        } finally {
            cancelledExecutions.remove(executionId);
            // Keep executionContexts when paused for approval so resume retains inputs.
            UtmPlaybookExecution latest = executionRepository.findByExecutionUuid(executionId).orElse(null);
            if (latest == null || !"awaiting_approval".equalsIgnoreCase(latest.getStatus())) {
                executionContexts.remove(executionId);
            }
        }
    }

    /**
     * Merges execute-time agentId/hostname/inputs into each step config so EDR/webhook
     * actions can resolve targets without editing the saved playbook.
     */
    List<PlaybookStepDTO> mergeContextIntoSteps(List<PlaybookStepDTO> steps,
                                                PlaybookExecuteRequestDTO context) {
        if (context == null || steps == null || steps.isEmpty()) {
            return steps != null ? steps : List.of();
        }
        List<PlaybookStepDTO> merged = new ArrayList<>(steps.size());
        for (PlaybookStepDTO step : steps) {
            PlaybookStepDTO copy = new PlaybookStepDTO();
            copy.setStepIndex(step.getStepIndex());
            copy.setStepType(step.getStepType());
            copy.setLabel(step.getLabel());
            Map<String, Object> cfg = new HashMap<>();
            if (step.getConfig() != null) {
                cfg.putAll(step.getConfig());
            }
            if (context.getInputs() != null) {
                for (Map.Entry<String, Object> e : context.getInputs().entrySet()) {
                    cfg.putIfAbsent(e.getKey(), e.getValue());
                }
                Object nestedParams = cfg.get("params");
                if (nestedParams instanceof Map<?, ?> existing) {
                    Map<String, Object> params = new HashMap<>();
                    existing.forEach((k, v) -> params.put(String.valueOf(k), v));
                    for (Map.Entry<String, Object> e : context.getInputs().entrySet()) {
                        params.putIfAbsent(e.getKey(), e.getValue());
                    }
                    cfg.put("params", params);
                }
            }
            if (context.getAgentId() != null && !context.getAgentId().isBlank()) {
                cfg.putIfAbsent("agentId", context.getAgentId());
            }
            if (context.getHostname() != null && !context.getHostname().isBlank()) {
                cfg.putIfAbsent("hostname", context.getHostname());
            }
            if (context.getAlertId() != null && !context.getAlertId().isBlank()) {
                cfg.putIfAbsent("alertId", context.getAlertId());
            }
            copy.setConfig(cfg);
            merged.add(copy);
        }
        return merged;
    }

    // -------------------------------------------------------------------------
    // Step runners
    // -------------------------------------------------------------------------

    private StepResult runStep(PlaybookStepDTO step, String playbookName,
                               PlaybookExecuteRequestDTO context) throws InterruptedException {
        String type = step.getStepType() != null
            ? step.getStepType().trim().toLowerCase(Locale.ROOT)
            : "action";
        Map<String, Object> config = step.getConfig() != null ? step.getConfig() : Map.of();

        return switch (type) {
            case "delay" -> runDelay(config);
            case "condition" -> runCondition(config, context);
            case "loop" -> StepResult.ok(Map.of(
                "result", "skipped",
                "note", "Loop steps are not executed in MVP; treat as no-op success"));
            case "approval" -> StepResult.pause(Map.of(
                "result", "awaiting_approval",
                "note", "Paused for analyst approval (STAGING CANDIDATE)"));
            case "action" -> runAction(config, playbookName);
            default -> StepResult.fail("Unknown stepType: " + type);
        };
    }

    private StepResult runCondition(Map<String, Object> config, PlaybookExecuteRequestDTO context) {
        PlaybookConditionEvaluator.Result evaluated =
            PlaybookConditionEvaluator.evaluate(config, context);
        Map<String, Object> out = new LinkedHashMap<>(evaluated.detail());
        out.put("result", evaluated.passed() ? "passed" : "failed");
        if (evaluated.passed()) {
            return StepResult.ok(out);
        }
        return switch (evaluated.onFalse()) {
            case FAIL -> StepResult.fail("Condition not met");
            case CONTINUE -> StepResult.ok(out);
            case STOP_SUCCESS -> StepResult.stopSuccess(out);
        };
    }

    private StepResult runDelay(Map<String, Object> config) throws InterruptedException {
        int seconds = 1;
        Object raw = config.get("delaySeconds");
        if (raw == null) {
            raw = config.get("seconds");
        }
        if (raw == null) {
            raw = config.get("duration");
        }
        if (raw instanceof Number n) {
            seconds = n.intValue();
        } else if (raw instanceof String s) {
            try {
                seconds = Integer.parseInt(s.trim());
            } catch (NumberFormatException ignored) {
                seconds = 1;
            }
        }
        Object unit = config.get("unit");
        if (unit != null && "minutes".equalsIgnoreCase(String.valueOf(unit))) {
            seconds = Math.min(seconds * 60, MAX_DELAY_SECONDS);
        }
        seconds = Math.max(0, Math.min(seconds, MAX_DELAY_SECONDS));
        if (seconds > 0) {
            Thread.sleep(seconds * 1000L);
        }
        return StepResult.ok(Map.of("delayedSeconds", seconds));
    }

    private StepResult runAction(Map<String, Object> config, String playbookName) {
        String actionId = firstString(config, "actionId", "action", "id");
        if (actionId == null || actionId.isBlank()) {
            return StepResult.fail("Action step missing config.actionId");
        }
        String normalized = actionId.trim().toLowerCase(Locale.ROOT);
        String agentId = firstString(config, "agentId", "agent_id");
        if (agentId == null) {
            Object params = config.get("params");
            if (params instanceof Map<?, ?> pm) {
                Object v = pm.get("agentId");
                if (v == null) {
                    v = pm.get("agent_id");
                }
                if (v != null) {
                    agentId = String.valueOf(v);
                }
            }
        }

        String actor = SecurityUtils.getCurrentUserLogin().orElse("playbook-engine");

        if (ISOLATE_IDS.contains(normalized)) {
            boolean haEnrolled = agentId != null && !agentId.isBlank();
            HybridIsolateRouter.Decision mesh = hybridResponseMesh.planIsolate(haEnrolled);
            if (mesh.path() == HybridIsolateRouter.Path.HA_AGENT) {
                try {
                    EdrIsolationDTO dto = new EdrIsolationDTO();
                    dto.setAgentId(agentId);
                    dto.setHostname(firstString(config, "hostname", "host"));
                    dto.setReason("Playbook: " + playbookName);
                    dto.setIsolationType("full");
                    EdrIsolationDTO result = edrService.isolateAgent(dto, actor);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("action", "isolate_host");
                    out.put("path", HybridIsolateRouter.Path.HA_AGENT.name());
                    out.put("agentId", agentId);
                    out.put("status", result.getStatus() != null ? result.getStatus() : "requested");
                    return StepResult.ok(out);
                } catch (Exception e) {
                    return StepResult.fail("EDR isolate failed: " + safeMsg(e));
                }
            }
            if (mesh.path() == HybridIsolateRouter.Path.VENDOR_CONNECTOR) {
                try {
                    String hostname = firstString(config, "hostname", "host");
                    String connectorId = firstString(config, "connectorId", "connector_id");
                    Map<String, Object> planned = hybridResponseMesh.vendorIsolateDryRun(connectorId, hostname);
                    return StepResult.ok(planned);
                } catch (Exception e) {
                    return StepResult.fail("Vendor isolate plan failed: " + safeMsg(e));
                }
            }
            return StepResult.fail(mesh.reason());
        }

        if (QUARANTINE_IDS.contains(normalized)) {
            if (agentId == null || agentId.isBlank()) {
                return StepResult.fail(
                    "quarantine_file requires config.agentId for EDR dispatch");
            }
            String path = firstString(config, "path", "filePath");
            if (path == null && config.get("params") instanceof Map<?, ?> pm) {
                Object v = pm.get("path");
                if (v != null) {
                    path = String.valueOf(v);
                }
            }
            if (path == null || path.isBlank()) {
                return StepResult.fail("quarantine_file requires config.path");
            }
            try {
                EdrQuarantineDTO dto = new EdrQuarantineDTO();
                dto.setAgentId(agentId);
                dto.setFilePath(path);
                dto.setReason("Playbook: " + playbookName);
                EdrQuarantineDTO result = edrService.quarantineFile(dto, actor);
                return StepResult.ok(Map.of(
                    "action", "quarantine_file",
                    "agentId", agentId,
                    "status", result.getStatus() != null ? result.getStatus() : "requested"));
            } catch (Exception e) {
                return StepResult.fail("EDR quarantine failed: " + safeMsg(e));
            }
        }

        if (KILL_IDS.contains(normalized)) {
            if (agentId == null || agentId.isBlank()) {
                return StepResult.fail("kill_process requires config.agentId");
            }
            Integer pid = null;
            Object pidRaw = config.get("pid");
            if (pidRaw instanceof Number n) {
                pid = n.intValue();
            }
            if (pid == null && config.get("params") instanceof Map<?, ?> pm) {
                Object v = pm.get("pid");
                if (v instanceof Number n) {
                    pid = n.intValue();
                }
            }
            if (pid == null) {
                return StepResult.fail("kill_process requires config.pid");
            }
            try {
                String processName = firstString(config, "processName", "process");
                String result = edrService.killProcess(agentId, pid, processName, actor);
                return StepResult.ok(Map.of(
                    "action", "kill_process",
                    "agentId", agentId,
                    "pid", pid,
                    "result", result != null ? result : "requested"));
            } catch (Exception e) {
                return StepResult.fail("EDR kill-process failed: " + safeMsg(e));
            }
        }

        if (WEBHOOK_IDS.contains(normalized)) {
            String url = configString(config, "url", "webhookUrl");
            String method = firstString(config, "method", "httpMethod");
            String body = configString(config, "body", "payload", "payload_template");
            try {
                return StepResult.ok(webhookExecutor.send(url, method, body));
            } catch (Exception e) {
                return StepResult.fail("Webhook failed: " + safeMsg(e));
            }
        }

        if (EMAIL_IDS.contains(normalized)) {
            return runSendEmail(config, playbookName);
        }

        if (TICKET_IDS.contains(normalized)) {
            return runCreateTicket(config, playbookName);
        }

        if (connectorDispatcher.supports(normalized)) {
            try {
                return StepResult.ok(connectorDispatcher.dispatch(normalized, config));
            } catch (Exception e) {
                return StepResult.fail("Connector action failed: " + safeMsg(e));
            }
        }

        // Honest failure for catalogue actions not yet wired.
        return StepResult.fail(
            "Action '" + actionId + "' is not implemented in the playbook engine yet");
    }

    private StepResult runSendEmail(Map<String, Object> config, String playbookName) {
        if (haAirGapConfig != null && haAirGapConfig.isAirGap()) {
            return StepResult.fail("Email failed: air-gap mode is active — SMTP dispatch disabled");
        }
        String host = Constants.CFG.get(Constants.PROP_MAIL_HOST);
        if (host == null || host.isBlank()) {
            return StepResult.fail("Email failed: SMTP host is not configured");
        }

        String to = configString(config, "to", "recipient", "email");
        String subject = configString(config, "subject");
        String body = configString(config, "body", "body_template", "content");
        if (to == null || to.isBlank()) {
            return StepResult.fail("send-email requires config.to");
        }
        if (subject == null || subject.isBlank()) {
            subject = "HiveArmor playbook: " + (playbookName != null ? playbookName : "notification");
        }
        if (body == null) {
            body = "";
        }

        List<String> recipients = new ArrayList<>();
        for (String part : to.split("[,;]")) {
            String addr = part.trim();
            if (!addr.isEmpty()) {
                recipients.add(addr);
            }
        }
        if (recipients.isEmpty()) {
            return StepResult.fail("send-email requires at least one recipient in config.to");
        }

        try {
            // Validate SMTP is reachable before queueing async send — honest fail if unset/broken.
            mailService.getJavaMailSender();
            mailService.sendEmail(recipients, subject, body, false, false);
            return StepResult.ok(Map.of(
                "action", "send-email",
                "recipients", recipients.size(),
                "status", "queued"));
        } catch (Exception e) {
            return StepResult.fail("Email failed: " + safeMsg(e));
        }
    }

    private StepResult runCreateTicket(Map<String, Object> config, String playbookName) {
        String url = configString(config, "url", "webhookUrl");
        if (url == null || url.isBlank()) {
            return StepResult.fail(
                "create-jira-ticket requires config.url or config.webhookUrl (webhook-to-ticket)");
        }

        String project = configString(config, "project", "projectKey");
        String summary = configString(config, "summary", "title");
        String priority = configString(config, "priority");
        String description = configString(config, "description", "body", "body_template");

        if (summary == null || summary.isBlank()) {
            summary = "HiveArmor playbook: " + (playbookName != null ? playbookName : "ticket");
        }
        if (priority == null || priority.isBlank()) {
            priority = "Medium";
        }
        if (description == null) {
            description = "";
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        if (project != null && !project.isBlank()) {
            payload.put("project", project);
        }
        payload.put("summary", summary);
        payload.put("priority", priority);
        payload.put("description", description);
        payload.put("source", "hivearmor");
        payload.put("playbook", playbookName != null ? playbookName : "");

        String method = firstString(config, "method", "httpMethod");
        if (method == null || method.isBlank()) {
            method = "POST";
        }

        try {
            String body = objectMapper.writeValueAsString(payload);
            Map<String, Object> webhookResult = webhookExecutor.send(url, method, body);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("action", "create-jira-ticket");
            out.put("mode", "webhook-to-ticket");
            if (project != null) {
                out.put("project", project);
            }
            out.put("summary", summary);
            Object statusCode = webhookResult.get("statusCode");
            if (statusCode != null) {
                out.put("statusCode", statusCode);
            }
            Object host = webhookResult.get("host");
            if (host != null) {
                out.put("host", host);
            }
            return StepResult.ok(out);
        } catch (Exception e) {
            return StepResult.fail("Ticket webhook failed: " + safeMsg(e));
        }
    }

    /** Reads a string from top-level config keys, then from nested {@code params}. */
    private static String configString(Map<String, Object> config, String... keys) {
        String top = firstString(config, keys);
        if (top != null) {
            return top;
        }
        Object params = config.get("params");
        if (params instanceof Map<?, ?> pm) {
            for (String key : keys) {
                Object v = pm.get(key);
                if (v != null && !String.valueOf(v).isBlank()) {
                    return String.valueOf(v);
                }
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Mapping helpers
    // -------------------------------------------------------------------------

    private void applyDtoToEntity(UtmPlaybook entity, PlaybookDTO dto, boolean creating) {
        if (dto.getName() != null || creating) {
            entity.setName(dto.getName() != null ? dto.getName() : "");
        }
        if (dto.getDescription() != null || creating) {
            entity.setDescription(dto.getDescription());
        }
        if (dto.getActive() != null || creating) {
            entity.setIsActive(dto.getActive() != null ? dto.getActive() : true);
        }
        if (creating) {
            entity.setSystemOwner(false);
        }
        if (dto.getSteps() != null || creating) {
            entity.setStepsJson(serializeSteps(dto.getSteps()));
        }
        String trigger = dto.getTriggerType() != null ? dto.getTriggerType() : "manual";
        entity.setDefinitionJson(writeDefinitionJson(entity.getDefinitionJson(), trigger));
    }

    private PlaybookDTO toDto(UtmPlaybook entity, boolean includeSteps) {
        PlaybookDTO dto = new PlaybookDTO();
        dto.setId(entity.getId());
        dto.setName(entity.getName());
        dto.setDescription(entity.getDescription());
        dto.setActive(entity.getIsActive());
        dto.setTriggerType(readTriggerType(entity.getDefinitionJson()));
        if (includeSteps) {
            dto.setSteps(deserializeSteps(entity.getStepsJson()));
        }
        List<UtmPlaybookExecution> history =
            executionRepository.findByPlaybookIdOrderByStartedAtDesc(entity.getId());
        dto.setRunCount(history.size());
        if (!history.isEmpty()) {
            UtmPlaybookExecution last = history.get(0);
            dto.setLastRunAt(last.getStartedAt());
            dto.setLastRunStatus(normalizeStatus(last.getStatus()));
        }
        return dto;
    }

    private PlaybookExecutionDTO toExecutionDto(UtmPlaybookExecution row) {
        PlaybookExecutionDTO dto = new PlaybookExecutionDTO();
        dto.setExecutionId(row.getExecutionUuid() != null
            ? row.getExecutionUuid()
            : String.valueOf(row.getId()));
        dto.setPlaybookId(row.getPlaybookId());
        dto.setPlaybookName(row.getPlaybookName());
        dto.setStartedAt(row.getStartedAt());
        dto.setCompletedAt(row.getEndedAt());
        dto.setStatus(normalizeStatus(row.getStatus()));
        dto.setTriggeredBy(row.getTriggeredBy());
        if (row.getStartedAt() != null && row.getEndedAt() != null) {
            dto.setDurationSeconds(Duration.between(row.getStartedAt(), row.getEndedAt()).getSeconds());
        }
        return dto;
    }

    private String normalizeStatus(String status) {
        if (status == null) {
            return null;
        }
        String s = status.toLowerCase(Locale.ROOT);
        return switch (s) {
            case "success", "completed" -> "success";
            case "failure", "failed", "error" -> "failure";
            case "running", "pending" -> "running";
            case "cancelled", "canceled" -> "cancelled";
            default -> s;
        };
    }

    private String readTriggerType(String definitionJson) {
        if (definitionJson == null || definitionJson.isBlank()) {
            return "manual";
        }
        try {
            Map<String, Object> map = objectMapper.readValue(
                definitionJson, new TypeReference<Map<String, Object>>() {});
            Object t = map.get("triggerType");
            if (t != null && !String.valueOf(t).isBlank()) {
                return String.valueOf(t);
            }
        } catch (Exception ignored) {
            // fall through
        }
        return "manual";
    }

    private String writeDefinitionJson(String existing, String triggerType) {
        Map<String, Object> map = new HashMap<>();
        if (existing != null && !existing.isBlank()) {
            try {
                map.putAll(objectMapper.readValue(
                    existing, new TypeReference<Map<String, Object>>() {}));
            } catch (Exception ignored) {
                // replace corrupt blob
            }
        }
        map.put("triggerType", triggerType != null ? triggerType : "manual");
        try {
            return objectMapper.writeValueAsString(map);
        } catch (Exception e) {
            return "{\"triggerType\":\"manual\"}";
        }
    }

    private String serializeExecutionMeta(String executionUuid, List<Map<String, Object>> stepLog,
                                          Integer pendingApprovalStepIndex) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("executionUuid", executionUuid);
        meta.put("steps", stepLog);
        if (pendingApprovalStepIndex != null) {
            meta.put("pendingApprovalStepIndex", pendingApprovalStepIndex);
        }
        try {
            return objectMapper.writeValueAsString(meta);
        } catch (Exception e) {
            return "{\"executionUuid\":\"" + executionUuid + "\",\"steps\":[]}";
        }
    }

    private int readPendingApprovalStepIndex(String stepsLogJson) {
        if (stepsLogJson == null || stepsLogJson.isBlank()) {
            return -1;
        }
        try {
            Map<String, Object> meta = objectMapper.readValue(
                stepsLogJson, new TypeReference<Map<String, Object>>() {});
            Object raw = meta.get("pendingApprovalStepIndex");
            if (raw instanceof Number n) {
                return n.intValue();
            }
            if (raw != null) {
                return Integer.parseInt(String.valueOf(raw));
            }
        } catch (Exception ignored) {
            // fall through
        }
        return -1;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readStepLog(String stepsLogJson) {
        if (stepsLogJson == null || stepsLogJson.isBlank()) {
            return new ArrayList<>();
        }
        try {
            Map<String, Object> meta = objectMapper.readValue(
                stepsLogJson, new TypeReference<Map<String, Object>>() {});
            Object steps = meta.get("steps");
            if (steps instanceof List<?> list) {
                List<Map<String, Object>> out = new ArrayList<>();
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) {
                        out.add(new LinkedHashMap<>((Map<String, Object>) m));
                    }
                }
                return out;
            }
        } catch (Exception ignored) {
            // fall through
        }
        return new ArrayList<>();
    }

    private void broadcastFailed(String executionId, String message) {
        PlaybookExecutionEvent failed = new PlaybookExecutionEvent();
        failed.setType("playbook_failed");
        failed.setErrorMessage(message);
        failed.setTimestamp(Instant.now().toString());
        playbookExecutionStreamService.broadcastEvent(executionId, failed);
    }

    private static String firstString(Map<String, Object> config, String... keys) {
        for (String key : keys) {
            Object v = config.get(key);
            if (v != null && !String.valueOf(v).isBlank()) {
                return String.valueOf(v);
            }
        }
        return null;
    }

    private static String safeMsg(Exception e) {
        String msg = e.getMessage();
        if (msg == null || msg.isBlank()) {
            return e.getClass().getSimpleName();
        }
        // Avoid leaking stack / secrets — keep short and generic-ish
        return msg.length() > 180 ? msg.substring(0, 180) : msg;
    }

    private static final class StepResult {
        final boolean ok;
        final boolean pause;
        final boolean stopSuccess;
        final Object output;
        final String errorMessage;

        private StepResult(boolean ok, boolean pause, boolean stopSuccess,
                           Object output, String errorMessage) {
            this.ok = ok;
            this.pause = pause;
            this.stopSuccess = stopSuccess;
            this.output = output;
            this.errorMessage = errorMessage;
        }

        static StepResult ok(Object output) {
            return new StepResult(true, false, false, output, null);
        }

        static StepResult stopSuccess(Object output) {
            return new StepResult(true, false, true, output, null);
        }

        static StepResult pause(Object output) {
            return new StepResult(true, true, false, output, null);
        }

        static StepResult fail(String errorMessage) {
            return new StepResult(false, false, false, null, errorMessage);
        }
    }
}
