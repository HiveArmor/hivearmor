package com.hivearmor.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import com.hivearmor.service.connector.PlaybookConnectorDispatcher;
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
 * {@link PlaybookWebhookExecutor}; connector capability actions via
 * {@link PlaybookConnectorDispatcher}; unknown actions fail honestly with {@code not_implemented}.
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

    private final PlaybookExecutionStreamService playbookExecutionStreamService;
    private final ObjectMapper objectMapper;
    private final UtmPlaybookRepository playbookRepository;
    private final UtmPlaybookExecutionRepository executionRepository;
    private final EdrService edrService;
    private final PlaybookWebhookExecutor webhookExecutor;
    private final PlaybookConnectorDispatcher connectorDispatcher;

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
                           PlaybookConnectorDispatcher connectorDispatcher) {
        this.playbookExecutionStreamService = playbookExecutionStreamService;
        this.objectMapper = objectMapper;
        this.playbookRepository = playbookRepository;
        this.executionRepository = executionRepository;
        this.edrService = edrService;
        this.webhookExecutor = webhookExecutor;
        this.connectorDispatcher = connectorDispatcher;
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
        execution.setStepsLog(serializeExecutionMeta(executionUuid, List.of()));
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
            if ("running".equalsIgnoreCase(row.getStatus())) {
                row.setStatus("cancelled");
                row.setEndedAt(Instant.now());
                row.setErrorMessage("Cancelled by operator");
                executionRepository.save(row);
            }
        });
    }

    @Async
    public void executeAsync(String executionId, Long playbookId) {
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
        List<Map<String, Object>> stepLog = new ArrayList<>();
        int completed = 0;
        boolean failed = false;
        String failureMessage = null;

        try {
            for (int i = 0; i < steps.size(); i++) {
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

                StepResult result = runStep(step, playbook.getName());
                Map<String, Object> logEntry = new LinkedHashMap<>();
                logEntry.put("stepIndex", i);
                logEntry.put("label", label);
                logEntry.put("stepType", stepType);
                logEntry.put("status", result.ok ? "success" : "failure");
                logEntry.put("output", result.output);
                if (result.errorMessage != null) {
                    logEntry.put("error", result.errorMessage);
                }
                stepLog.add(logEntry);

                if (result.ok) {
                    completed++;
                    PlaybookExecutionEvent completedEvt = new PlaybookExecutionEvent();
                    completedEvt.setType("step_completed");
                    completedEvt.setStepIndex(i);
                    completedEvt.setStepLabel(label);
                    completedEvt.setStepType(stepType);
                    completedEvt.setOutput(result.output);
                    completedEvt.setTimestamp(Instant.now().toString());
                    playbookExecutionStreamService.broadcastEvent(executionId, completedEvt);
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
            }

            PlaybookExecutionEvent terminal = new PlaybookExecutionEvent();
            terminal.setType(failed ? "playbook_failed" : "playbook_completed");
            terminal.setErrorMessage(failed ? failureMessage : null);
            terminal.setTimestamp(Instant.now().toString());
            playbookExecutionStreamService.broadcastEvent(executionId, terminal);

            execution.setCompletedSteps(completed);
            execution.setStepsLog(serializeExecutionMeta(executionId, stepLog));
            execution.setEndedAt(Instant.now());
            if (Boolean.TRUE.equals(cancelledExecutions.get(executionId))) {
                execution.setStatus("cancelled");
                execution.setErrorMessage(failureMessage);
            } else if (failed) {
                execution.setStatus("failure");
                execution.setErrorMessage(failureMessage);
            } else {
                execution.setStatus("success");
            }
            executionRepository.save(execution);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            broadcastFailed(executionId, "Execution interrupted");
            execution.setStatus("failure");
            execution.setErrorMessage("Execution interrupted");
            execution.setEndedAt(Instant.now());
            execution.setCompletedSteps(completed);
            execution.setStepsLog(serializeExecutionMeta(executionId, stepLog));
            executionRepository.save(execution);
        } catch (Exception e) {
            log.warn("Playbook execution {} failed: {}", executionId, e.getClass().getSimpleName());
            broadcastFailed(executionId, "Execution engine error");
            execution.setStatus("failure");
            execution.setErrorMessage("Execution engine error");
            execution.setEndedAt(Instant.now());
            execution.setCompletedSteps(completed);
            execution.setStepsLog(serializeExecutionMeta(executionId, stepLog));
            executionRepository.save(execution);
        } finally {
            cancelledExecutions.remove(executionId);
            executionContexts.remove(executionId);
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

    private StepResult runStep(PlaybookStepDTO step, String playbookName) throws InterruptedException {
        String type = step.getStepType() != null
            ? step.getStepType().trim().toLowerCase(Locale.ROOT)
            : "action";
        Map<String, Object> config = step.getConfig() != null ? step.getConfig() : Map.of();

        return switch (type) {
            case "delay" -> runDelay(config);
            case "condition" -> StepResult.ok(Map.of(
                "result", "passed",
                "note", "Condition evaluated as pass (MVP — full CEL conditions deferred)"));
            case "loop" -> StepResult.ok(Map.of(
                "result", "skipped",
                "note", "Loop steps are not executed in MVP; treat as no-op success"));
            case "approval" -> StepResult.fail(
                "Approval steps require an analyst gate (not wired in this execution path)");
            case "action" -> runAction(config, playbookName);
            default -> StepResult.fail("Unknown stepType: " + type);
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
            if (agentId == null || agentId.isBlank()) {
                return StepResult.fail(
                    "isolate_host requires config.agentId (or params.agentId) for EDR dispatch");
            }
            try {
                EdrIsolationDTO dto = new EdrIsolationDTO();
                dto.setAgentId(agentId);
                dto.setHostname(firstString(config, "hostname", "host"));
                dto.setReason("Playbook: " + playbookName);
                dto.setIsolationType("full");
                EdrIsolationDTO result = edrService.isolateAgent(dto, actor);
                return StepResult.ok(Map.of(
                    "action", "isolate_host",
                    "agentId", agentId,
                    "status", result.getStatus() != null ? result.getStatus() : "requested"));
            } catch (Exception e) {
                return StepResult.fail("EDR isolate failed: " + safeMsg(e));
            }
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
            String url = firstString(config, "url", "webhookUrl");
            if (url == null && config.get("params") instanceof Map<?, ?> pm) {
                Object v = pm.get("url");
                if (v == null) {
                    v = pm.get("webhookUrl");
                }
                if (v != null) {
                    url = String.valueOf(v);
                }
            }
            String method = firstString(config, "method", "httpMethod");
            String body = firstString(config, "body", "payload", "payload_template");
            if (body == null && config.get("params") instanceof Map<?, ?> pm) {
                Object v = pm.get("body");
                if (v == null) {
                    v = pm.get("payload");
                }
                if (v == null) {
                    v = pm.get("payload_template");
                }
                if (v != null) {
                    body = String.valueOf(v);
                }
            }
            try {
                return StepResult.ok(webhookExecutor.send(url, method, body));
            } catch (Exception e) {
                return StepResult.fail("Webhook failed: " + safeMsg(e));
            }
        }

        if (connectorDispatcher.supports(normalized)) {
            try {
                return StepResult.ok(connectorDispatcher.dispatch(normalized, config));
            } catch (Exception e) {
                return StepResult.fail("Connector action failed: " + safeMsg(e));
            }
        }

        // Honest failure for catalogue actions not yet wired (email/jira/…).
        return StepResult.fail(
            "Action '" + actionId + "' is not implemented in the playbook engine yet");
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

    private String serializeExecutionMeta(String executionUuid, List<Map<String, Object>> stepLog) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("executionUuid", executionUuid);
        meta.put("steps", stepLog);
        try {
            return objectMapper.writeValueAsString(meta);
        } catch (Exception e) {
            return "{\"executionUuid\":\"" + executionUuid + "\",\"steps\":[]}";
        }
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
        final Object output;
        final String errorMessage;

        private StepResult(boolean ok, Object output, String errorMessage) {
            this.ok = ok;
            this.output = output;
            this.errorMessage = errorMessage;
        }

        static StepResult ok(Object output) {
            return new StepResult(true, output, null);
        }

        static StepResult fail(String errorMessage) {
            return new StepResult(false, null, errorMessage);
        }
    }
}
