package com.hivearmor.web.rest.incident;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.incident.UtmIncident;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.dto.incident.*;
import com.hivearmor.service.dto.incident.AiSummaryDTO;
import com.hivearmor.service.dto.incident.IncidentEntitiesDTO;
import com.hivearmor.service.dto.incident.IncidentEvidenceDTO;
import com.hivearmor.service.dto.incident.TimelineEventDTO;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
import com.hivearmor.repository.incident.UtmIncidentAlertRepository;
import com.hivearmor.service.UtmAlertService;
import com.hivearmor.service.incident.IncidentInvestigationService;
import com.hivearmor.service.incident.IncidentPatchService;
import com.hivearmor.service.incident.IncidentTaskService;
import com.hivearmor.service.incident.SimilarIncidentService;
import com.hivearmor.service.incident.IncidentEventSearchService;
import com.hivearmor.service.incident.IncidentResponseActionService;
import com.hivearmor.service.incident.IncidentActivityService;
import com.hivearmor.service.incident.EvidenceProvenanceService;
import com.hivearmor.service.incident.IncidentSseService;
import com.hivearmor.service.incident.UtmIncidentQueryService;
import com.hivearmor.service.incident.UtmIncidentService;
import com.hivearmor.service.sse.HaSseRateLimiter;
import com.hivearmor.util.exceptions.NoAlertsProvidedException;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import com.hivearmor.web.rest.util.HeaderUtil;
import com.hivearmor.web.rest.util.PaginationUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import com.hivearmor.aop.logging.AuditEvent;

import jakarta.validation.Valid;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST controller for managing UtmIncident.
 */
@RestController
@RequiredArgsConstructor
@Slf4j
@RequestMapping("/api")
@Tag(name = "Incidents", description = "Incident management: create, list, update, timeline (INC-001)")
public class UtmIncidentResource {

    private static final String ENTITY_NAME = "utmIncident";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') " +
        "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private final UtmIncidentService utmIncidentService;

    private final UtmIncidentQueryService utmIncidentQueryService;

    private final IncidentInvestigationService incidentInvestigationService;

    private final UtmIncidentAlertRepository incidentAlertRepository;

    private final UtmAlertService alertService;

    private final IncidentPatchService incidentPatchService;

    private final IncidentTaskService incidentTaskService;

    private final SimilarIncidentService similarIncidentService;

    private final IncidentEventSearchService incidentEventSearchService;

    private final IncidentResponseActionService incidentResponseActionService;

    private final IncidentActivityService incidentActivityService;

    private final EvidenceProvenanceService evidenceProvenanceService;

    private final IncidentSseService incidentSseService;

    private final MsspIndexResolver indexResolver;

    private final HaSseRateLimiter rateLimiter;

    public record IncidentGraphNodeDTO(String id, String type, String label, Map<String, Object> properties) {}
    public record IncidentGraphEdgeDTO(String source, String target, String relation) {}
    public record IncidentEntityGraphDTO(List<IncidentGraphNodeDTO> nodes, List<IncidentGraphEdgeDTO> edges) {}


    /**
     * Creates a new incident based on the provided details.
     *
     * This endpoint accepts a {@link NewIncidentDTO} object, validates the data,
     * and attempts to create a new incident. The process includes:
     * - Verifying that the alert list is not empty.
     * - Checking if any of the provided alerts are already associated with another incident.
     * - Creating the incident if all validations pass.
     *
     * @param newIncidentDTO the DTO containing the details of the incident to create, including associated alerts.
     * @return a {@link ResponseEntity} containing:
     *         - HTTP 201 (Created) if the incident is successfully created.
     *         - HTTP 400 (Bad Request) if the alert list is empty.
     *         - HTTP 409 (Conflict) if one or more alerts are already associated with another incident.
     *         - HTTP 500 (Internal Server Error) if an unexpected error occurs during processing.
     * @throws IllegalArgumentException if the input data is invalid.
     */
    @PostMapping("/ha-incidents")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @AuditEvent(
        attemptType = ApplicationEventType.INCIDENT_CREATION_ATTEMPT,
        attemptMessage = "Attempt to create a new incident initiated",
        successType = ApplicationEventType.INCIDENT_CREATION_SUCCESS,
        successMessage = "Incident created successfully"
    )
    @Operation(
        summary = "Create a new incident",
        description = "Creates a new incident from provided alerts and metadata. Returns 409 if alerts are already assigned to another incident. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Incident created successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid request or empty alert list"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "409", description = "Alerts already associated with another incident"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<UtmIncident> createUtmIncident(@Valid @RequestBody NewIncidentDTO newIncidentDTO) {
        return ResponseEntity.ok(utmIncidentService.createIncident(newIncidentDTO));
    }

    /**
     * POST /ha-incidents/add-alerts : Add alerts to an existing utmIncident.
     *
     * This endpoint allows users to associate a list of alerts with an existing utmIncident.
     * If any of the provided alerts are already linked to another incident, a conflict response is returned.
     *
     * @param addToIncidentDTO the DTO containing the details of the utmIncident and the list of alerts to add
     * @return the ResponseEntity with:
     *         - status 201 (Created) and the updated utmIncident if successful,
     *         - status 400 (Bad Request) if the alert list is empty,
     *         - status 409 (Conflict) if some alerts are already associated with another incident,
     *         - status 500 (Internal Server Error) if an unexpected error occurs.
     * @throws URISyntaxException if the Location URI syntax is incorrect
     */
    @PostMapping("/ha-incidents/add-alerts")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @AuditEvent(
        attemptType = ApplicationEventType.INCIDENT_ALERT_ADD_ATTEMPT,
        attemptMessage = "Attempt to add alerts to incident initiated",
        successType = ApplicationEventType.INCIDENT_ALERT_ADD_SUCCESS,
        successMessage = "Alerts added to incident successfully"
    )
    @Operation(
        summary = "Add alerts to an existing incident",
        description = "Associates a list of alerts with an existing incident. Returns 409 if any alert is already linked to another incident. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Alerts added to incident successfully"),
        @ApiResponse(responseCode = "400", description = "Empty alert list"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "409", description = "Alerts already associated with another incident"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<UtmIncident> addAlertsToUtmIncident(@Valid @RequestBody AddToIncidentDTO addToIncidentDTO) throws URISyntaxException {

        if (CollectionUtils.isEmpty(addToIncidentDTO.getAlertList())) {
            throw new NoAlertsProvidedException("Add utmIncident cannot already have an empty related alerts");
        }

        UtmIncident result = utmIncidentService.addAlertsIncident(addToIncidentDTO);
           return ResponseEntity.created(new URI("/api/ha-incidents/add-alerts/" + result.getId()))
                .headers(HeaderUtil.createEntityCreationAlert(ENTITY_NAME, result.getId().toString()))
                .body(result);
    }

    /**
     * PUT  /ha-incidents : Updates an existing utmIncident.
     *
     * @param utmIncident the utmIncident to update
     * @return the ResponseEntity with status 200 (OK) and with body the updated utmIncident,
     * or with status 400 (Bad Request) if the utmIncident is not valid,
     * or with status 500 (Internal Server Error) if the utmIncident couldn't be updated
     * @throws URISyntaxException if the Location URI syntax is incorrect
     */
    @PutMapping("/ha-incidents/change-status")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @AuditEvent(
        attemptType = ApplicationEventType.INCIDENT_UPDATE_ATTEMPT,
        attemptMessage = "Attempt to update incident status initiated",
        successType = ApplicationEventType.INCIDENT_UPDATE_SUCCESS,
        successMessage = "Incident status updated successfully"
    )
    @Operation(
        summary = "Update incident status",
        description = "Changes the status of an existing incident. Requires a valid incident ID in the request body. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Incident status updated successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid request or missing incident ID"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<UtmIncident> updateUtmIncident(@Valid @RequestBody UtmIncident utmIncident) {

        if (utmIncident.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        UtmIncident result = utmIncidentService.changeStatus(utmIncident);

        return ResponseEntity.ok()
                .headers(HeaderUtil.createEntityUpdateAlert(ENTITY_NAME, utmIncident.getId().toString()))
                .body(result);
    }

    /**
     * GET  /ha-incidents : get all the utmIncidents.
     *
     * @param pageable the pagination information
     * @param criteria the criterias which the requested entities should match
     * @return the ResponseEntity with status 200 (OK) and the list of utmIncidents in body
     */
    @GetMapping("/ha-incidents")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List all incidents",
        description = "Returns a paginated list of incidents matching the given filter criteria. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Paginated list of incidents"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<List<UtmIncident>> getAllUtmIncidents(UtmIncidentCriteria criteria, Pageable pageable) {

        Page<UtmIncident> page = utmIncidentQueryService.findByCriteria(criteria, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-incidents");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * GET  /ha-incidents/users-assigned : get all users assigned to incidents.
     *
     * @return the ResponseEntity with status 200 (OK) and the list of IncidentUserAssignedDTO in body
     */
    @GetMapping("/ha-incidents/users-assigned")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List users assigned to incidents",
        description = "Returns all users currently assigned to at least one incident. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "List of assigned users"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<List<IncidentUserAssignedDTO>> getAllUserAssigned() {
        return ResponseEntity.ok().body(utmIncidentQueryService.getAllUsersAssigned());
    }

    /**
     * GET  /ha-incidents/:id : get the "id" utmIncident.
     *
     * @param id the id of the utmIncident to retrieve
     * @return the ResponseEntity with status 200 (OK) and with body the utmIncident, or with status 404 (Not Found)
     */
    @GetMapping("/ha-incidents/{id}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get incident by ID",
        description = "Returns the incident with the specified ID or 404 if not found. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Incident found"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "404", description = "Incident not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<UtmIncident> getUtmIncident(@PathVariable Long id) {

        Optional<UtmIncident> utmIncident = utmIncidentService.findOne(id);
        return tech.jhipster.web.util.ResponseUtil.wrapOrNotFound(utmIncident);

    }

    // =========================================================================
    // PATCH /ha-incidents/{id} — Metadata edit with optimistic concurrency (INC-001)
    // =========================================================================

    /**
     * PATCH /ha-incidents/{id} : Sparse merge update of incident metadata.
     *
     * <p>Requires {@code If-Match} header containing the expected version.
     * Returns 428 Precondition Required if header is missing.
     * Returns 409 Conflict with field-level diff if version mismatch.
     * Returns 404 if incident not found.
     * Returns 200 OK with updated incident and ETag header on success.
     *
     * @param id       the incident document ID (OpenSearch)
     * @param ifMatch  the expected incident version (If-Match header)
     * @param body     sparse patch fields to update
     * @return the patched incident or error response
     */
    @PatchMapping("/ha-incidents/{id}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Patch incident metadata",
        description = "Sparse merge update of incident metadata with optimistic concurrency via If-Match header. Returns 409 on version conflict with field-level diff. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Incident patched successfully with ETag"),
        @ApiResponse(responseCode = "400", description = "Invalid If-Match header format"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Incident not found"),
        @ApiResponse(responseCode = "409", description = "Version conflict with field-level diff"),
        @ApiResponse(responseCode = "428", description = "If-Match header is required"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> patchIncident(
            @PathVariable String id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody Map<String, Object> body) {
        try {
            log.debug("PATCH /api/ha-incidents/{} If-Match={}", id, ifMatch);

            // Validate If-Match header is present (428 Precondition Required)
            if (ifMatch == null || ifMatch.isBlank()) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 428);
                error.put("title", "Precondition Required");
                error.put("detail", "If-Match header is required for PATCH operations");
                return ResponseEntity.status(HttpStatus.valueOf(428)).body(error);
            }

            // Parse version from If-Match (strip quotes if ETag-style, strip 'v' prefix)
            String cleanIfMatch = ifMatch.replace("\"", "").trim();
            if (cleanIfMatch.startsWith("v")) {
                cleanIfMatch = cleanIfMatch.substring(1);
            }
            int ifMatchVersion;
            try {
                ifMatchVersion = Integer.parseInt(cleanIfMatch);
            } catch (NumberFormatException e) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 400);
                error.put("title", "Bad Request");
                error.put("detail", "If-Match header must contain a valid version number");
                return ResponseEntity.badRequest().body(error);
            }

            // Resolve tenant index pattern and actor
            String indexPattern = indexResolver.resolveIndexPattern("incident");
            String actorId = SecurityUtils.getCurrentUserLogin().orElse("system");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            // Execute patch
            IncidentPatchService.PatchResult result = incidentPatchService.patchIncident(
                id, body, ifMatchVersion, indexPattern, actorId, tenantId);

            // 404 Not Found
            if (result.isNotFound()) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 404);
                error.put("title", "Not Found");
                error.put("detail", "Incident not found: " + id);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
            }

            // 409 Conflict
            if (!result.isSuccess()) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(result.getConflictBody());
            }

            // 200 OK — extract version for ETag
            Map<String, Object> updated = result.getUpdatedIncident();
            Object versionObj = updated.get("version");
            int newVersion = versionObj instanceof Number ? ((Number) versionObj).intValue() : 1;

            return ResponseEntity.ok()
                .header("ETag", "\"v" + newVersion + "\"")
                .body(updated);

        } catch (Exception e) {
            log.error("PATCH /api/ha-incidents/{}: {}", id, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to patch incident");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Task CRUD endpoints — INC-002 (subtasks 4.9, 4.10, 4.11, 4.12, 4.13)
    // =========================================================================

    /**
     * GET /ha-incidents/{id}/tasks : List tasks for an incident with cursor pagination.
     *
     * @param id     the incident identifier
     * @param cursor Base64-encoded pagination cursor (optional)
     * @param limit  max items per page (default 20, max 100)
     * @param status optional task status filter (open, in_progress, completed, blocked)
     * @return paginated task list
     */
    @GetMapping("/ha-incidents/{id}/tasks")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List incident tasks",
        description = "Returns cursor-paginated tasks for the specified incident with optional status filter. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Paginated task list"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> listIncidentTasks(
            @PathVariable("id") String id,
            @RequestParam(value = "cursor", required = false) String cursor,
            @RequestParam(value = "limit", required = false, defaultValue = "20") int limit,
            @RequestParam(value = "status", required = false) String status) {
        try {
            log.debug("GET /api/ha-incidents/{}/tasks cursor={} limit={} status={}", id, cursor, limit, status);

            // Check incident exists in OpenSearch
            if (!incidentExistsInOpenSearch(id)) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 404);
                error.put("title", "Not Found");
                error.put("detail", "Incident not found: " + id);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
            }

            // Clamp limit
            if (limit < 1) limit = 20;
            if (limit > 100) limit = 100;

            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            IncidentTaskService.TaskListResult result = incidentTaskService.listTasks(id, cursor, limit, status, tenantId);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("items", result.getItems());
            response.put("cursor", result.getCursor());
            response.put("total", result.getTotal());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("GET /api/ha-incidents/{}/tasks: {}", id, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to list tasks");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * POST /ha-incidents/{id}/tasks : Create a new task for an incident.
     *
     * @param id   the incident identifier
     * @param body task creation body (title required)
     * @return the created task with generated IDs
     */
    @PostMapping("/ha-incidents/{id}/tasks")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Create an incident task",
        description = "Creates a new task for the specified incident. Title is required in the request body. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Task created successfully with ETag"),
        @ApiResponse(responseCode = "400", description = "Invalid request body"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> createIncidentTask(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body) {
        try {
            log.debug("POST /api/ha-incidents/{}/tasks", id);

            String userId = SecurityUtils.getCurrentUserLogin().orElse("system");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            IncidentTaskService.TaskResult result = incidentTaskService.createTask(id, body, userId, tenantId);

            if (!result.isSuccess()) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 400);
                error.put("title", "Bad Request");
                error.put("detail", result.getErrorMessage());
                return ResponseEntity.badRequest().body(error);
            }

            Map<String, Object> task = result.getTask();
            Object versionObj = task.get("version");
            int version = versionObj instanceof Number ? ((Number) versionObj).intValue() : 1;

            return ResponseEntity.status(HttpStatus.CREATED)
                .header("ETag", "\"" + version + "\"")
                .body(task);
        } catch (Exception e) {
            log.error("POST /api/ha-incidents/{}/tasks: {}", id, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to create task");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * PATCH /ha-incidents/{id}/tasks/{taskId} : Update an incident task with optimistic versioning.
     *
     * <p>Requires {@code If-Match} header containing the expected task version.
     * Returns 409 Conflict if version mismatch.
     * Returns 428 Precondition Required if If-Match header is missing.
     *
     * @param id      the incident identifier
     * @param taskId  the task identifier
     * @param ifMatch the expected task version (If-Match header)
     * @param body    sparse patch fields
     * @return the updated task or error response
     */
    @PatchMapping("/ha-incidents/{id}/tasks/{taskId}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Update an incident task",
        description = "Sparse patch update of an incident task with optimistic versioning via If-Match header. Returns 409 on version conflict. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Task updated successfully with ETag"),
        @ApiResponse(responseCode = "400", description = "Invalid If-Match header format"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Task not found"),
        @ApiResponse(responseCode = "409", description = "Version conflict"),
        @ApiResponse(responseCode = "428", description = "If-Match header is required"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> updateIncidentTask(
            @PathVariable("id") String id,
            @PathVariable("taskId") String taskId,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody Map<String, Object> body) {
        try {
            log.debug("PATCH /api/ha-incidents/{}/tasks/{} If-Match={}", id, taskId, ifMatch);

            // Validate If-Match header (428 Precondition Required)
            if (ifMatch == null || ifMatch.isBlank()) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 428);
                error.put("title", "Precondition Required");
                error.put("detail", "If-Match header is required for PATCH operations");
                return ResponseEntity.status(HttpStatus.valueOf(428)).body(error);
            }

            // Parse version from If-Match (strip quotes)
            String cleanIfMatch = ifMatch.replace("\"", "").trim();
            int ifMatchVersion;
            try {
                ifMatchVersion = Integer.parseInt(cleanIfMatch);
            } catch (NumberFormatException e) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 400);
                error.put("title", "Bad Request");
                error.put("detail", "If-Match header must contain a valid version number");
                return ResponseEntity.badRequest().body(error);
            }

            String userId = SecurityUtils.getCurrentUserLogin().orElse("system");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            IncidentTaskService.TaskResult result = incidentTaskService.updateTask(
                id, taskId, body, ifMatchVersion, userId, tenantId);

            // Handle errors
            if (!result.isSuccess()) {
                if (result.isConflict()) {
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(result.getConflictBody());
                }
                // Task not found or does not belong
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 404);
                error.put("title", "Not Found");
                error.put("detail", result.getErrorMessage());
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
            }

            Map<String, Object> task = result.getTask();
            Object versionObj = task.get("version");
            int newVersion = versionObj instanceof Number ? ((Number) versionObj).intValue() : 1;

            return ResponseEntity.ok()
                .header("ETag", "\"" + newVersion + "\"")
                .body(task);
        } catch (Exception e) {
            log.error("PATCH /api/ha-incidents/{}/tasks/{}: {}", id, taskId, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to update task");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * GET /ha-incidents/{id}/entity-graph
     *
     * Builds an entity graph for the given incident by collecting all entities
     * (IPs, hosts, users, processes) from linked alert data. Nodes represent unique
     * entities; edges connect adversary entities to target entities within each alert.
     */
    @GetMapping("/ha-incidents/{id}/entity-graph")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")
    @Operation(
        summary = "Get incident entity graph",
        description = "Builds an entity graph for the incident by collecting entities from linked alerts. Nodes represent unique entities; edges connect adversary to target entities. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Entity graph with nodes and edges"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<IncidentEntityGraphDTO> getIncidentEntityGraph(@PathVariable Long id) {
        log.debug("GET /api/ha-incidents/{}/entity-graph", id);

        List<String> alertIds = incidentAlertRepository.findAllByIncidentId(id)
                .stream().map(a -> a.getAlertId()).collect(Collectors.toList());
        if (alertIds.isEmpty()) {
            return ResponseEntity.ok(new IncidentEntityGraphDTO(List.of(), List.of()));
        }

        List<UtmAlert> alerts;
        try {
            alerts = alertService.getAlertsByIds(alertIds);
        } catch (Exception e) {
            log.warn("Failed to fetch alerts for incident entity graph {}: {}", id, e.getMessage());
            return ResponseEntity.ok(new IncidentEntityGraphDTO(List.of(), List.of()));
        }

        // Build unique node sets — keyed by nodeId to deduplicate
        Map<String, IncidentGraphNodeDTO> nodeMap = new LinkedHashMap<>();
        List<IncidentGraphEdgeDTO> edges = new ArrayList<>();
        Set<String> edgeKeys = new HashSet<>();

        for (UtmAlert alert : alerts) {
            List<String> alertNodeIds = new ArrayList<>();

            // Adversary side
            if (alert.getAdversary() != null) {
                var adv = alert.getAdversary();
                if (StringUtils.hasText(adv.getIp())) {
                    String nid = "ip:" + adv.getIp();
                    nodeMap.computeIfAbsent(nid, k -> {
                        Map<String, Object> props = new LinkedHashMap<>();
                        props.put("malicious", false);
                        if (adv.getGeolocation() != null && StringUtils.hasText(adv.getGeolocation().getCountry()))
                            props.put("country", adv.getGeolocation().getCountry());
                        return new IncidentGraphNodeDTO(nid, "ip", adv.getIp(), props);
                    });
                    alertNodeIds.add(nid);
                }
                if (StringUtils.hasText(adv.getUser())) {
                    String nid = "user:" + adv.getUser();
                    nodeMap.computeIfAbsent(nid, k -> {
                        Map<String, Object> props = new LinkedHashMap<>();
                        if (StringUtils.hasText(adv.getDomain())) props.put("domain", adv.getDomain());
                        return new IncidentGraphNodeDTO(nid, "user", adv.getUser(), props);
                    });
                    alertNodeIds.add(nid);
                }
                if (StringUtils.hasText(adv.getHost())) {
                    String nid = "host:" + adv.getHost();
                    nodeMap.computeIfAbsent(nid, k ->
                        new IncidentGraphNodeDTO(nid, "host", adv.getHost(), new LinkedHashMap<>()));
                    alertNodeIds.add(nid);
                }
                if (StringUtils.hasText(adv.getProcess())) {
                    String nid = "process:" + adv.getProcess();
                    nodeMap.computeIfAbsent(nid, k ->
                        new IncidentGraphNodeDTO(nid, "process", adv.getProcess(), new LinkedHashMap<>()));
                    alertNodeIds.add(nid);
                }
            }

            // Target side
            if (alert.getTarget() != null) {
                var tgt = alert.getTarget();
                if (StringUtils.hasText(tgt.getIp())) {
                    String nid = "ip:" + tgt.getIp();
                    nodeMap.computeIfAbsent(nid, k -> {
                        Map<String, Object> props = new LinkedHashMap<>();
                        props.put("malicious", false);
                        if (tgt.getGeolocation() != null && StringUtils.hasText(tgt.getGeolocation().getCountry()))
                            props.put("country", tgt.getGeolocation().getCountry());
                        return new IncidentGraphNodeDTO(nid, "ip", tgt.getIp(), props);
                    });
                    alertNodeIds.add(nid);
                }
                if (StringUtils.hasText(tgt.getUser())) {
                    String nid = "user:" + tgt.getUser();
                    nodeMap.computeIfAbsent(nid, k ->
                        new IncidentGraphNodeDTO(nid, "user", tgt.getUser(), new LinkedHashMap<>()));
                    alertNodeIds.add(nid);
                }
                if (StringUtils.hasText(tgt.getHost())) {
                    String nid = "host:" + tgt.getHost();
                    nodeMap.computeIfAbsent(nid, k ->
                        new IncidentGraphNodeDTO(nid, "host", tgt.getHost(), new LinkedHashMap<>()));
                    alertNodeIds.add(nid);
                }
            }

            // Connect first adversary entity to first target entity within the same alert
            if (alert.getAdversary() != null && alert.getTarget() != null) {
                String advIp   = StringUtils.hasText(alert.getAdversary().getIp())   ? "ip:"   + alert.getAdversary().getIp()   : null;
                String tgtIp   = StringUtils.hasText(alert.getTarget().getIp())       ? "ip:"   + alert.getTarget().getIp()       : null;
                String advUser = StringUtils.hasText(alert.getAdversary().getUser())  ? "user:" + alert.getAdversary().getUser()  : null;
                String tgtHost = StringUtils.hasText(alert.getTarget().getHost())     ? "host:" + alert.getTarget().getHost()     : null;

                addEdge(edges, edgeKeys, advIp, tgtIp, "targeted");
                addEdge(edges, edgeKeys, advIp, advUser, "used_by");
                addEdge(edges, edgeKeys, advIp, tgtHost, "attacked");
                addEdge(edges, edgeKeys, advUser, tgtIp, "accessed");
            }
        }

        return ResponseEntity.ok(new IncidentEntityGraphDTO(new ArrayList<>(nodeMap.values()), edges));
    }

    @GetMapping("/ha-incidents/{id}/evidence")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get incident evidence",
        description = "Returns all evidence items collected for the specified incident from OpenSearch. (INC-007)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "List of evidence items"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Incident not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<?> getIncidentEvidence(@PathVariable("id") String id) {
        try {
            log.debug("GET /api/ha-incidents/{}/evidence", id);

            // Check incident exists in OpenSearch
            if (!incidentExistsInOpenSearch(id)) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 404);
                error.put("title", "Not Found");
                error.put("detail", "Incident not found: " + id);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
            }

            // Query OpenSearch for evidence linked to this incident
            String evidenceIndexPattern = indexResolver.resolveIndexPattern("evidence");
            org.opensearch.client.opensearch.core.SearchRequest request =
                org.opensearch.client.opensearch.core.SearchRequest.of(r -> r
                    .index(evidenceIndexPattern)
                    .query(org.opensearch.client.opensearch._types.query_dsl.Query.of(q -> q.bool(b -> b
                        .should(s -> s.term(t -> t.field("incidentId").value(v -> v.stringValue(id))))
                        .should(s -> s.term(t -> t.field("incident_id").value(v -> v.stringValue(id))))
                        .should(s -> s.term(t -> t.field("incidentId.keyword").value(v -> v.stringValue(id))))
                        .should(s -> s.term(t -> t.field("incident_id.keyword").value(v -> v.stringValue(id))))
                        .minimumShouldMatch("1"))))
                    .size(100));

            org.opensearch.client.opensearch.core.SearchResponse<Map> response =
                evidenceProvenanceService.getOsClient().execute(os -> os.search(request, Map.class));

            List<Map<String, Object>> items = new ArrayList<>();
            if (response.hits() != null && response.hits().hits() != null) {
                for (var hit : response.hits().hits()) {
                    Map<String, Object> doc = hit.source() != null
                        ? new LinkedHashMap<>((Map<String, Object>) hit.source())
                        : new LinkedHashMap<>();
                    doc.putIfAbsent("id", hit.id());
                    items.add(doc);
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("items", items);
            result.put("total", items.size());
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("GET /api/ha-incidents/{}/evidence: {}", id, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to get evidence");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    @GetMapping("/ha-incidents/{id}/timeline")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")
    @Operation(
        summary = "Get incident timeline",
        description = "Returns the chronological timeline of events for the specified incident. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Ordered timeline events"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<List<TimelineEventDTO>> getIncidentTimeline(@PathVariable Long id) {
        return ResponseEntity.ok(incidentInvestigationService.getTimeline(id));
    }

    @GetMapping("/ha-incidents/{id}/entities")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")
    @Operation(
        summary = "Get incident entities",
        description = "Returns entities (IPs, hosts, users, processes) associated with the specified incident. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Incident entities grouped by type"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<IncidentEntitiesDTO> getIncidentEntities(@PathVariable Long id) {
        return ResponseEntity.ok(incidentInvestigationService.getEntities(id));
    }

    @PostMapping("/ha-incidents/{id}/ai-summary")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")
    @Operation(
        summary = "Generate AI summary for incident",
        description = "Triggers AI-based summarization of the incident including key findings, affected entities, and recommended actions. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "AI-generated incident summary"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<AiSummaryDTO> generateIncidentAiSummary(@PathVariable Long id) {
        return ResponseEntity.ok(incidentInvestigationService.generateAiSummary(id));
    }

    // =========================================================================
    // Similar Incidents — INC-003 (Task 5)
    // =========================================================================

    /**
     * GET /ha-incidents/{id}/similar : Find incidents similar to the specified incident.
     *
     * @param id     the incident identifier
     * @param window time window (default "30d", max "90d")
     * @param limit  max results (default 20, max 50)
     * @return scored similar incidents with reasons
     */
    @GetMapping("/ha-incidents/{id}/similar")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Find similar incidents",
        description = "Finds incidents similar to the specified one within a time window. Returns scored matches with similarity reasons. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Scored list of similar incidents"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> findSimilarIncidents(
            @PathVariable("id") String id,
            @RequestParam(value = "window", required = false, defaultValue = "30d") String window,
            @RequestParam(value = "limit", required = false, defaultValue = "20") int limit) {
        try {
            log.debug("GET /api/ha-incidents/{}/similar window={} limit={}", id, window, limit);

            // Check incident exists in OpenSearch
            if (!incidentExistsInOpenSearch(id)) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 404);
                error.put("title", "Not Found");
                error.put("detail", "Incident not found: " + id);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
            }

            // Validate and clamp params
            if (limit < 1) limit = 20;
            if (limit > 50) limit = 50;

            // Validate window — max 90d
            String cleanWindow = window != null ? window.trim().toLowerCase() : "30d";
            int windowDays = 30;
            if (cleanWindow.endsWith("d")) {
                try {
                    windowDays = Integer.parseInt(cleanWindow.substring(0, cleanWindow.length() - 1));
                    if (windowDays > 90) windowDays = 90;
                    if (windowDays < 1) windowDays = 30;
                } catch (NumberFormatException e) {
                    windowDays = 30;
                }
            }

            String indexPattern = indexResolver.resolveIndexPattern("incident");

            Map<String, Object> result = similarIncidentService.findSimilar(
                id, windowDays, limit, indexPattern);
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("GET /api/ha-incidents/{}/similar: {}", id, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to find similar incidents");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Incident-Scoped Event Search — INC-004 (Task 6)
    // =========================================================================

    /**
     * POST /ha-incidents/{id}/events/search : Search events scoped to an incident.
     *
     * @param id   the incident identifier
     * @param body search request body (query, timeRange, entities, limit, projection, cursor)
     * @return bounded event search results with cursor pagination
     */
    @PostMapping("/ha-incidents/{id}/events/search")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Search events scoped to incident",
        description = "Searches events within the scope of a specific incident. Supports query, time range, entity filters, and cursor pagination. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Bounded event search results with cursor"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> searchIncidentEvents(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body) {
        try {
            log.debug("POST /api/ha-incidents/{}/events/search", id);

            String indexPattern = indexResolver.resolveIndexPattern("incident");

            Map<String, Object> result = incidentEventSearchService.searchEvents(
                id, body, indexPattern);
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("POST /api/ha-incidents/{}/events/search: {}", id, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to search events");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Response Action Catalog — INC-005 (Task 7)
    // =========================================================================

    /**
     * GET /ha-incidents/{id}/response-actions : List available response actions.
     *
     * @param id the incident identifier
     * @return action catalog grouped by category
     */
    @GetMapping("/ha-incidents/{id}/response-actions")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List response actions for incident",
        description = "Returns the catalog of available response actions for the specified incident, grouped by category. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Action catalog grouped by category"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> listResponseActions(@PathVariable("id") String id) {
        try {
            log.debug("GET /api/ha-incidents/{}/response-actions", id);

            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            Map<String, Object> result = incidentResponseActionService.listActions(id, tenantId);
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("GET /api/ha-incidents/{}/response-actions: {}", id, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to list response actions");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * POST /ha-incidents/{id}/response-actions/{actionId}/preview : Preview a response action.
     *
     * @param id       the incident identifier
     * @param actionId the action identifier
     * @return preview result with targets, impact, and previewToken
     */
    @PostMapping("/ha-incidents/{id}/response-actions/{actionId}/preview")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Preview a response action",
        description = "Previews the impact of a response action before execution. Returns targets, impact assessment, and a previewToken for execution. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Preview result with targets and impact"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Action not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> previewResponseAction(
            @PathVariable("id") String id,
            @PathVariable("actionId") String actionId) {
        try {
            log.debug("POST /api/ha-incidents/{}/response-actions/{}/preview", id, actionId);

            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            Map<String, Object> result = incidentResponseActionService.previewAction(id, actionId, tenantId);

            if (result.containsKey("error")) {
                int status = result.get("status") instanceof Number n ? n.intValue() : 500;
                return ResponseEntity.status(status).body(result);
            }

            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("POST /api/ha-incidents/{}/response-actions/{}/preview: {}", id, actionId, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to preview action");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * POST /ha-incidents/{id}/response-actions/{actionId}/execute : Execute a response action.
     *
     * @param id       the incident identifier
     * @param actionId the action identifier
     * @param body     execution body (must contain previewToken)
     * @return execution result with job status
     */
    @PostMapping("/ha-incidents/{id}/response-actions/{actionId}/execute")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Execute a response action",
        description = "Executes a previously previewed response action. Requires a valid previewToken in the request body. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Execution result with job status"),
        @ApiResponse(responseCode = "400", description = "Missing or invalid previewToken"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> executeResponseAction(
            @PathVariable("id") String id,
            @PathVariable("actionId") String actionId,
            @RequestBody Map<String, Object> body) {
        try {
            log.debug("POST /api/ha-incidents/{}/response-actions/{}/execute", id, actionId);

            String userId = SecurityUtils.getCurrentUserLogin().orElse("system");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            Map<String, Object> result = incidentResponseActionService.executeAction(
                id, actionId, body, userId, tenantId);

            if (result.containsKey("error")) {
                int status = result.get("status") instanceof Number n ? n.intValue() : 500;
                return ResponseEntity.status(status).body(result);
            }

            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("POST /api/ha-incidents/{}/response-actions/{}/execute: {}", id, actionId, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to execute action");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Collaboration Activity Feed — INC-006 (Task 8)
    // =========================================================================

    /**
     * GET /ha-incidents/{id}/activity : Get the activity feed for an incident.
     *
     * @param id     the incident identifier
     * @param cursor Base64-encoded pagination cursor (optional)
     * @param limit  max items per page (default 20, max 100)
     * @param types  comma-separated activity type filter (optional)
     * @return paginated activity feed
     */
    @GetMapping("/ha-incidents/{id}/activity")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get incident activity feed",
        description = "Returns the cursor-paginated activity feed for an incident, optionally filtered by activity type. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Paginated activity feed"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> getIncidentActivity(
            @PathVariable("id") String id,
            @RequestParam(value = "cursor", required = false) String cursor,
            @RequestParam(value = "limit", required = false, defaultValue = "20") int limit,
            @RequestParam(value = "types", required = false) String types) {
        try {
            log.debug("GET /api/ha-incidents/{}/activity cursor={} limit={} types={}", id, cursor, limit, types);

            // Check incident exists in OpenSearch
            if (!incidentExistsInOpenSearch(id)) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 404);
                error.put("title", "Not Found");
                error.put("detail", "Incident not found: " + id);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
            }

            if (limit < 1) limit = 20;
            if (limit > 100) limit = 100;

            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            Map<String, Object> result = incidentActivityService.getActivity(
                id, cursor, limit, types, tenantId);
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("GET /api/ha-incidents/{}/activity: {}", id, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to get activity");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * POST /ha-incidents/{id}/activity/notes : Add a note to the incident activity feed.
     *
     * @param id   the incident identifier
     * @param body note body (content required, mentions optional)
     * @return the created activity entry
     */
    @PostMapping("/ha-incidents/{id}/activity/notes")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Add a note to incident activity",
        description = "Adds a collaboration note to the incident activity feed. Supports @mentions of other users. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Note added to activity feed"),
        @ApiResponse(responseCode = "400", description = "Note content is required"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> addIncidentNote(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body) {
        try {
            log.debug("POST /api/ha-incidents/{}/activity/notes", id);

            String content = body.get("content") instanceof String s ? s : null;
            if (content == null || content.isBlank()) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 400);
                error.put("title", "Bad Request");
                error.put("detail", "Note content is required");
                return ResponseEntity.badRequest().body(error);
            }

            List<String> mentions = null;
            if (body.get("mentions") instanceof List<?> mentionsList) {
                mentions = new ArrayList<>();
                for (Object m : mentionsList) {
                    if (m instanceof String s) mentions.add(s);
                }
            }

            String userId = SecurityUtils.getCurrentUserLogin().orElse("system");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            Map<String, Object> result = incidentActivityService.addNote(
                id, content, mentions, userId, tenantId);
            return ResponseEntity.status(HttpStatus.CREATED).body(result);

        } catch (IllegalArgumentException e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 400);
            error.put("title", "Bad Request");
            error.put("detail", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        } catch (Exception e) {
            log.error("POST /api/ha-incidents/{}/activity/notes: {}", id, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to add note");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Evidence Provenance and Custody — INC-007 (Task 9)
    // =========================================================================

    /**
     * POST /ha-incidents/{id}/evidence/{evidenceId}/custody : Add a custody event.
     *
     * @param id         the incident identifier
     * @param evidenceId the evidence item identifier
     * @param body       custody event body (actor, action, notes)
     * @return the created custody event
     */
    @PostMapping("/ha-incidents/{id}/evidence/{evidenceId}/custody")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Add evidence custody event",
        description = "Records a custody chain event for a specific evidence item in the incident. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Custody event recorded"),
        @ApiResponse(responseCode = "400", description = "Invalid custody event data"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Incident or evidence not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> addEvidenceCustody(
            @PathVariable("id") String id,
            @PathVariable("evidenceId") String evidenceId,
            @RequestBody Map<String, Object> body) {
        try {
            log.debug("POST /api/ha-incidents/{}/evidence/{}/custody", id, evidenceId);

            String actor = body.get("actor") instanceof String s ? s
                : SecurityUtils.getCurrentUserLogin().orElse("system");
            String action = body.get("action") instanceof String s ? s : null;
            String notes = body.get("notes") instanceof String s ? s : null;
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            EvidenceProvenanceService.CustodyResult result =
                evidenceProvenanceService.addCustodyEvent(id, evidenceId, actor, action, notes, tenantId);

            if (!result.isSuccess()) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", result.getErrorStatus());
                error.put("title", result.getErrorStatus() == 404 ? "Not Found" : "Bad Request");
                error.put("detail", result.getErrorMessage());
                return ResponseEntity.status(result.getErrorStatus()).body(error);
            }

            return ResponseEntity.status(HttpStatus.CREATED).body(result.getData());

        } catch (Exception e) {
            log.error("POST /api/ha-incidents/{}/evidence/{}/custody: {}", id, evidenceId, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to add custody event");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * PATCH /ha-incidents/{id}/evidence/{evidenceId} : Update evidence classification.
     *
     * @param id         the incident identifier
     * @param evidenceId the evidence item identifier
     * @param body       patch body (classification, notes)
     * @return updated evidence with custody event
     */
    @PatchMapping("/ha-incidents/{id}/evidence/{evidenceId}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Update evidence classification",
        description = "Updates the classification of an evidence item and records a custody event for the change. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Evidence classification updated"),
        @ApiResponse(responseCode = "400", description = "Classification is required"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Incident or evidence not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> updateEvidenceClassification(
            @PathVariable("id") String id,
            @PathVariable("evidenceId") String evidenceId,
            @RequestBody Map<String, Object> body) {
        try {
            log.debug("PATCH /api/ha-incidents/{}/evidence/{}", id, evidenceId);

            String classification = body.get("classification") instanceof String s ? s : null;
            String notes = body.get("notes") instanceof String s ? s : null;
            String userId = SecurityUtils.getCurrentUserLogin().orElse("system");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            if (classification == null || classification.isBlank()) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", 400);
                error.put("title", "Bad Request");
                error.put("detail", "Classification is required");
                return ResponseEntity.badRequest().body(error);
            }

            EvidenceProvenanceService.CustodyResult result =
                evidenceProvenanceService.updateClassification(
                    id, evidenceId, classification, notes, userId, tenantId);

            if (!result.isSuccess()) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("status", result.getErrorStatus());
                error.put("title", result.getErrorStatus() == 404 ? "Not Found" : "Bad Request");
                error.put("detail", result.getErrorMessage());
                return ResponseEntity.status(result.getErrorStatus()).body(error);
            }

            return ResponseEntity.ok(result.getData());

        } catch (Exception e) {
            log.error("PATCH /api/ha-incidents/{}/evidence/{}: {}", id, evidenceId, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("status", 500);
            error.put("title", "Internal Server Error");
            error.put("detail", "Failed to update evidence");
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Workbench Live SSE — INC-008 (Task 10)
    // =========================================================================

    /**
     * GET /ha-incidents/{id}/stream : SSE stream for live incident updates.
     *
     * <p>Creates an SseEmitter with 30-minute timeout, registers it for the incident,
     * and supports Last-Event-ID replay from in-memory buffer.
     *
     * @param id          the incident identifier
     * @param lastEventId Last-Event-ID header for replay (optional)
     * @return SseEmitter producing live incident events
     */
    @GetMapping(value = "/ha-incidents/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Stream live incident updates (SSE)",
        description = "Opens an SSE connection for real-time incident updates. Supports Last-Event-ID header for reconnection replay from in-memory buffer. (INC-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "SSE stream opened successfully"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Incident not found"),
        @ApiResponse(responseCode = "429", description = "Too many SSE connections"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public SseEmitter streamIncidentUpdates(
            @PathVariable("id") String id,
            @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId,
            jakarta.servlet.http.HttpServletResponse response) {
        try {
            log.debug("GET /api/ha-incidents/{}/stream Last-Event-ID={}", id, lastEventId);

            // Check incident exists in OpenSearch — return 404 if not found
            if (!incidentExistsInOpenSearch(id)) {
                response.setStatus(404);
                response.setContentType("application/json");
                response.getWriter().write("{\"status\":404,\"title\":\"Not Found\",\"detail\":\"Incident not found: " + id + "\"}");
                response.getWriter().flush();
                return null;
            }

            // HAR-006: Check SSE rate limits before creating emitter
            String tenantPrefix = TenantContext.get();
            String endpoint = "/ha-incidents/stream";
            rateLimiter.checkLimit(tenantPrefix, endpoint, id);
            HaSseRateLimiter.ConnectionHandle connectionHandle = rateLimiter.register(tenantPrefix, endpoint, id);

            // Create emitter with 30-minute timeout
            SseEmitter emitter = new SseEmitter(IncidentSseService.EMITTER_TIMEOUT_MS);

            // Register emitter for this incident
            incidentSseService.register(id, emitter);

            // Register rate limiter cleanup on disconnect
            emitter.onCompletion(connectionHandle::close);
            emitter.onTimeout(connectionHandle::close);
            emitter.onError(e -> connectionHandle.close());

            // Replay events from last event ID if provided
            if (lastEventId != null && !lastEventId.isBlank()) {
                incidentSseService.replayFrom(id, lastEventId, emitter);
            }

            // Send initial connection event
            try {
                emitter.send(SseEmitter.event()
                    .name("connected")
                    .data("{\"incidentId\":\"" + id + "\",\"timestamp\":\"" + java.time.Instant.now() + "\"}"));
            } catch (Exception e) {
                log.debug("Failed to send initial SSE event: {}", e.getMessage());
            }

            return emitter;

        } catch (Exception e) {
            log.error("GET /api/ha-incidents/{}/stream: {}", id, e.getMessage(), e);
            SseEmitter errorEmitter = new SseEmitter(0L);
            errorEmitter.completeWithError(e);
            return errorEmitter;
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Private helper: Check incident exists in OpenSearch
    // =========================================================================

    /**
     * Checks if an incident with the given ID exists in the v3-hive-incident-* index.
     * Uses the same ID-based query as IncidentPatchService.
     *
     * @param incidentId the incident identifier
     * @return true if the incident exists, false otherwise
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private boolean incidentExistsInOpenSearch(String incidentId) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("incident");
            org.opensearch.client.opensearch.core.SearchRequest request =
                org.opensearch.client.opensearch.core.SearchRequest.of(r -> r
                    .index(indexPattern)
                    .query(org.opensearch.client.opensearch._types.query_dsl.Query.of(
                        qr -> qr.ids(i -> i.values(List.of(incidentId)))))
                    .size(1)
                    .source(sc -> sc.fetch(false)));

            org.opensearch.client.opensearch.core.SearchResponse<Map> response =
                incidentPatchService.getOsClient().execute(os -> os.search(request, Map.class));

            return response.hits() != null
                && response.hits().hits() != null
                && !response.hits().hits().isEmpty();
        } catch (Exception e) {
            log.warn("incidentExistsInOpenSearch({}): {}", incidentId, e.getMessage());
            return false;
        }
    }

    private void addEdge(List<IncidentGraphEdgeDTO> edges, Set<String> seen, String src, String tgt, String relation) {
        if (src == null || tgt == null || src.equals(tgt)) return;
        if (seen.add(src + "->" + tgt)) {
            edges.add(new IncidentGraphEdgeDTO(src, tgt, relation));
        }
    }
}
