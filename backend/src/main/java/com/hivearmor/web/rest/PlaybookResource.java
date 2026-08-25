package com.hivearmor.web.rest;

import com.hivearmor.service.PlaybookExecutionEvent;
import com.hivearmor.service.PlaybookExecutionInventoryService;
import com.hivearmor.service.PlaybookExecutionStreamService;
import com.hivearmor.service.PlaybookService;
import com.hivearmor.service.dto.PlaybookDTO;
import com.hivearmor.service.dto.PlaybookExecuteRequestDTO;
import com.hivearmor.service.dto.PlaybookExecutionDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * REST controller for HiveArmor SOAR playbooks.
 *
 * <p>All endpoints are mapped under {@code /api/ha-playbooks} and secured with
 * {@code @PreAuthorize}. Read endpoints accept {@code ROLE_ADMIN} and
 * {@code ROLE_USER}; write and execute endpoints require {@code ROLE_ADMIN}.
 *
 * <p>Constructor injection is used exclusively — no field or setter injection,
 * no Lombok annotations.
 *
 * <p>Sprint 18 + P0 SOAR unstub: persists via {@link PlaybookService} to
 * {@code hive_playbook} / {@code hive_playbook_execution}.
 */
@RestController
@RequestMapping("/api")
public class PlaybookResource {

    private static final Logger log = LoggerFactory.getLogger(PlaybookResource.class);
    private static final String CLASSNAME = "PlaybookResource";

    private final PlaybookService playbookService;
    private final PlaybookExecutionStreamService playbookExecutionStreamService;
    private final PlaybookExecutionInventoryService executionInventoryService;

    public PlaybookResource(PlaybookService playbookService,
                            PlaybookExecutionStreamService playbookExecutionStreamService,
                            PlaybookExecutionInventoryService executionInventoryService) {
        this.playbookService = playbookService;
        this.playbookExecutionStreamService = playbookExecutionStreamService;
        this.executionInventoryService = executionInventoryService;
    }

    // -------------------------------------------------------------------------
    // Endpoints
    // -------------------------------------------------------------------------

    /**
     * GET /api/ha-playbooks
     *
     * <p>Returns the full list of playbooks available to the authenticated user.
     *
     * @return HTTP 200 with a (possibly empty) list of {@link PlaybookDTO}
     */
    @GetMapping("/ha-playbooks")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_USER')")
    public ResponseEntity<List<PlaybookDTO>> getAllPlaybooks() {
        final String ctx = CLASSNAME + ".getAllPlaybooks";
        try {
            List<PlaybookDTO> playbooks = playbookService.findAll();
            return ResponseEntity.ok(playbooks);
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * GET /api/ha-playbooks/metrics
     *
     * <p>Workload strip summary for the Response playbooks library.
     */
    @GetMapping("/ha-playbooks/metrics")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_USER')")
    public ResponseEntity<Map<String, Object>> getPlaybookMetrics() {
        final String ctx = CLASSNAME + ".getPlaybookMetrics";
        try {
            return ResponseEntity.ok(playbookService.metricsSummary());
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * GET /api/ha-playbooks/{id}
     *
     * <p>Returns a single playbook including its {@code steps} array.
     *
     * @param id the playbook primary key
     * @return HTTP 200 with the {@link PlaybookDTO} (steps included), or HTTP 404
     */
    /** Numeric id only so literal paths like {@code metrics} never bind here. */
    @GetMapping("/ha-playbooks/{id:\\d+}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_USER')")
    public ResponseEntity<PlaybookDTO> getPlaybook(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getPlaybook";
        try {
            Optional<PlaybookDTO> result = playbookService.findOne(id);
            return result
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * GET /api/ha-playbooks/{playbookId}/history
     *
     * <p>Returns all execution records for the specified playbook, sorted by
     * {@code startedAt} descending (most-recent first).
     *
     * @param playbookId the playbook primary key
     * @return HTTP 200 with a (possibly empty) list of {@link PlaybookExecutionDTO}
     */
    @GetMapping("/ha-playbooks/{playbookId}/history")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_USER')")
    public ResponseEntity<List<PlaybookExecutionDTO>> getPlaybookHistory(
            @PathVariable Long playbookId) {
        final String ctx = CLASSNAME + ".getPlaybookHistory";
        try {
            List<PlaybookExecutionDTO> history = playbookService.findExecutionHistory(playbookId);
            return ResponseEntity.ok(history);
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * POST /api/ha-playbooks
     *
     * <p>Creates a new playbook from the request body (including the full {@code steps}
     * array). Returns HTTP 201 Created with a {@code Location} header pointing to the
     * new resource and the created DTO as the response body.
     *
     * <p>Step configs and CEL expressions MUST NOT be logged at any level.
     *
     * @param dto the playbook definition to persist
     * @return HTTP 201 with {@code Location: /api/ha-playbooks/{id}} and the created DTO
     */
    @PostMapping("/ha-playbooks")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<PlaybookDTO> createPlaybook(@RequestBody PlaybookDTO dto) {
        final String ctx = CLASSNAME + ".createPlaybook";
        try {
            PlaybookDTO created = playbookService.create(dto);
            URI location = URI.create("/api/ha-playbooks/" + created.getId());
            return ResponseEntity.created(location).body(created);
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * PUT /api/ha-playbooks/{id}
     *
     * <p>Replaces the stored playbook definition with the supplied DTO (name,
     * description, triggerType, active, and the full {@code steps} array).
     *
     * <p>Step configs and CEL expressions MUST NOT be logged at any level.
     *
     * @param id  the playbook primary key to replace
     * @param dto the updated playbook definition
     * @return HTTP 200 with the updated DTO, or HTTP 404 when the id is missing
     */
    @PutMapping("/ha-playbooks/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<PlaybookDTO> updatePlaybook(@PathVariable Long id,
                                                      @RequestBody PlaybookDTO dto) {
        final String ctx = CLASSNAME + ".updatePlaybook";
        try {
            Optional<PlaybookDTO> result = playbookService.update(id, dto);
            return result
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * POST /api/ha-playbooks/{id}/preview
     *
     * <p>Dry-run validation for the Response UI. Returns previewToken + step summaries.
     */
    @PostMapping("/ha-playbooks/{id}/preview")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Map<String, Object>> previewPlaybook(
            @PathVariable Long id,
            @RequestBody(required = false) PlaybookExecuteRequestDTO body) {
        final String ctx = CLASSNAME + ".previewPlaybook";
        try {
            return ResponseEntity.ok(playbookService.preview(id, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * POST /api/ha-playbooks/{id}/execute
     *
     * <p>Triggers an execution of the specified playbook. Returns HTTP 202 Accepted
     * with a body containing the assigned {@code executionId}.
     *
     * <p>Optional JSON body may include {@code agentId}, {@code alertId}, {@code hostname},
     * and {@code inputs} merged into step configs at runtime.
     *
     * <p>Execution outputs and step configurations MUST NOT be logged at any level.
     *
     * @param id the playbook primary key
     * @return HTTP 202 with {@code { "executionId": "<uuid>" }} (plus Phase-7 compatible fields)
     */
    @PostMapping("/ha-playbooks/{id}/execute")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Map<String, Object>> executePlaybook(
            @PathVariable Long id,
            @RequestBody(required = false) PlaybookExecuteRequestDTO body) {
        final String ctx = CLASSNAME + ".executePlaybook";
        try {
            String executionId = playbookService.execute(id, body);
            playbookService.executeAsync(executionId, id);
            Map<String, Object> response = new java.util.LinkedHashMap<>();
            response.put("executionId", executionId);
            response.put("playbookId", String.valueOf(id));
            response.put("status", "RUNNING");
            response.put("approvalId", null);
            response.put("streamUrl", "/api/ha-playbooks/" + executionId + "/stream");
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * PATCH /api/ha-playbooks/{id}/status?active={boolean}
     *
     * <p>Toggles the {@code active} flag on the specified playbook.
     *
     * @param id     the playbook primary key
     * @param active the desired active state ({@code true} or {@code false})
     * @return HTTP 204 No Content on success
     */
    @PatchMapping("/ha-playbooks/{id}/status")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Void> setPlaybookActive(
            @PathVariable Long id,
            @RequestParam boolean active) {
        final String ctx = CLASSNAME + ".setPlaybookActive";
        try {
            playbookService.setActive(id, active);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * GET /api/ha-playbooks/executions — RESP-018 global execution inventory.
     */
    @GetMapping("/ha-playbooks/executions")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    public ResponseEntity<Map<String, Object>> listExecutions(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String trigger,
            @RequestParam(required = false) Long playbookId,
            @RequestParam(required = false) String triggeredBy,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        final String ctx = CLASSNAME + ".listExecutions";
        try {
            return ResponseEntity.ok(executionInventoryService.inventory(
                search, status, trigger, playbookId, triggeredBy, from, to, cursor, limit));
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * GET /api/ha-playbooks/executions/summary — RESP-018 inventory summary strip.
     */
    @GetMapping("/ha-playbooks/executions/summary")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    public ResponseEntity<Map<String, Object>> executionsSummary(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String trigger,
            @RequestParam(required = false) Long playbookId,
            @RequestParam(required = false) String triggeredBy,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to) {
        final String ctx = CLASSNAME + ".executionsSummary";
        try {
            return ResponseEntity.ok(executionInventoryService.summary(
                search, status, trigger, playbookId, triggeredBy, from, to));
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * GET /api/ha-playbooks/executions/{executionId}/trace — RESP-018 progressive step trace.
     */
    @GetMapping("/ha-playbooks/executions/{executionId}/trace")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    public ResponseEntity<Map<String, Object>> executionTrace(
            @PathVariable String executionId,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        final String ctx = CLASSNAME + ".executionTrace";
        try {
            return ResponseEntity.ok(executionInventoryService.trace(executionId, cursor, limit));
        } catch (ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode()).build();
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * GET /api/ha-playbooks/{executionId}/stream
     *
     * <p>Opens a Server-Sent Events stream for the given execution. The client
     * receives {@code step_started}, {@code step_completed}, and
     * {@code playbook_completed} events in real time.
     *
     * <p>Authentication for SSE is via {@code ?token=} query parameter because
     * {@code EventSource} cannot set {@code Authorization} headers. This pattern is
     * restricted to SSE endpoints only and MUST NOT be replicated on any non-SSE path.
     *
     * <p>SSE payloads MUST NOT be logged at any level.
     *
     * @param executionId the unique execution identifier (UUID string)
     * @return a new {@link SseEmitter} subscribed to the execution stream
     */
    @GetMapping(value = "/ha-playbooks/{executionId}/stream",
                produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_USER')")
    public SseEmitter streamExecution(@PathVariable String executionId) {
        return playbookExecutionStreamService.createEmitter(executionId);
    }

    /**
     * POST /api/ha-playbooks/executions/{executionId}/approve
     *
     * <p>Resumes a playbook paused at an {@code approval} step. STAGING CANDIDATE.
     */
    @PostMapping("/ha-playbooks/executions/{executionId}/approve")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Map<String, Object>> approveExecution(@PathVariable String executionId) {
        try {
            return ResponseEntity.ok(playbookService.approveExecution(executionId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", e.getMessage() != null ? e.getMessage() : "conflict"));
        } catch (Exception e) {
            log.error("{}: {}", CLASSNAME + ".approveExecution", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * POST /api/ha-playbooks/executions/{executionId}/reject
     *
     * <p>Rejects a paused approval gate and fails the execution. Optional body
     * {@code { "reason": "..." }}. STAGING CANDIDATE.
     */
    @PostMapping("/ha-playbooks/executions/{executionId}/reject")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Map<String, Object>> rejectExecution(
            @PathVariable String executionId,
            @RequestBody(required = false) Map<String, Object> body) {
        try {
            String reason = null;
            if (body != null && body.get("reason") != null) {
                reason = String.valueOf(body.get("reason"));
            }
            return ResponseEntity.ok(playbookService.rejectExecution(executionId, reason));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", e.getMessage() != null ? e.getMessage() : "conflict"));
        } catch (Exception e) {
            log.error("{}: {}", CLASSNAME + ".rejectExecution", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * DELETE /api/ha-playbooks/{executionId}
     *
     * <p>Cancels the running execution identified by {@code executionId}, broadcasts a
     * {@code playbook_failed} event with errorMessage {@code "Cancelled by user"}, and
     * returns HTTP 204 No Content.
     *
     * @param executionId the unique execution identifier (UUID string)
     * @return HTTP 204 No Content
     */
    @DeleteMapping("/ha-playbooks/{executionId}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Void> cancelExecution(@PathVariable String executionId) {
        final String ctx = CLASSNAME + ".cancelExecution";
        try {
            playbookService.cancelExecution(executionId);

            PlaybookExecutionEvent event = new PlaybookExecutionEvent();
            event.setType("playbook_failed");
            event.setErrorMessage("Cancelled by user");
            event.setTimestamp(Instant.now().toString());
            playbookExecutionStreamService.broadcastEvent(executionId, event);

            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
