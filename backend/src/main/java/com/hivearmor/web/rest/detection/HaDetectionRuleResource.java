package com.hivearmor.web.rest.detection;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.detection.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.*;

/**
 * REST controller for Detection Rules (DET-008 through DET-016).
 *
 * <p>Sprint 47 — Detection Rules.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Detection Rules", description = "Detection rule CRUD, lifecycle, testing (DET-001 through DET-005)")
public class HaDetectionRuleResource {

    private static final Logger log = LoggerFactory.getLogger(HaDetectionRuleResource.class);
    private static final String CLASSNAME = "HaDetectionRuleResource";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') "
        + "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private static final String SOC_MANAGER_AUTH =
        "hasAuthority('ROLE_SOC_MANAGER') or hasAuthority('ROLE_ADMIN')";

    private static final String DETECTION_ENGINEER_AUTH =
        "hasAuthority('ROLE_SOC_MANAGER') or hasAuthority('ROLE_ADMIN') "
        + "or hasAuthority('ROLE_DETECTION_ENGINEER')";

    private final DetectionRuleInventoryService inventoryService;
    private final RuleExecutionService executionService;
    private final RuleBulkOperationService bulkService;
    private final RuleValidationService validationService;
    private final RulePreviewService previewService;
    private final SigmaImportService sigmaService;
    private final DetectionSseService sseService;
    private final DetectionCoverageService coverageService;
    private final RuleAuthoringService authoringService;

    public HaDetectionRuleResource(DetectionRuleInventoryService inventoryService,
                                   RuleExecutionService executionService,
                                   RuleBulkOperationService bulkService,
                                   RuleValidationService validationService,
                                   RulePreviewService previewService,
                                   SigmaImportService sigmaService,
                                   DetectionSseService sseService,
                                   DetectionCoverageService coverageService,
                                   RuleAuthoringService authoringService) {
        this.inventoryService = inventoryService;
        this.executionService = executionService;
        this.bulkService = bulkService;
        this.validationService = validationService;
        this.previewService = previewService;
        this.sigmaService = sigmaService;
        this.sseService = sseService;
        this.coverageService = coverageService;
        this.authoringService = authoringService;
    }

    // =========================================================================
    // DET-008: Rule inventory with health and facets
    // =========================================================================

    @GetMapping("/ha-detection-rules")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List detection rules with filters",
        description = "Returns a paginated list of detection rules with health metrics and facets. "
            + "Supports filtering by scope, status, severity, MITRE ATT&CK tactics, and free-text search. (DET-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Rule inventory with health and facets"),
        @ApiResponse(responseCode = "400", description = "Invalid filter parameters"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> listRules(
            @RequestParam(required = false) String scope,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String tactics,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        try {
            Long tenantId = resolveTenantId();
            Map<String, Object> result = inventoryService.listRules(
                scope, status, severity, tactics, q, sort, cursor, limit, tenantId);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.listRules: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // DET-009: Execution monitoring and manual-run
    // =========================================================================

    @GetMapping("/ha-detection-rules/executions")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List rule executions",
        description = "Returns execution history for detection rules. Supports filtering by rule ID, "
            + "status, and time range. (DET-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Execution history list"),
        @ApiResponse(responseCode = "400", description = "Invalid parameters (e.g. bad date format)"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> listExecutions(
            @RequestParam(required = false) String ruleId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        try {
            Long tenantId = resolveTenantId();
            Instant fromInstant = from != null ? Instant.parse(from) : null;
            Instant toInstant = to != null ? Instant.parse(to) : null;
            Map<String, Object> result = executionService.listExecutions(
                ruleId, status, fromInstant, toInstant, cursor, limit, tenantId);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.listExecutions: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/{id}/manual-run")
    @PreAuthorize(SOC_MANAGER_AUTH)
    @Operation(
        summary = "Trigger manual rule execution",
        description = "Manually executes a detection rule against a specified time range. "
            + "Requires SOC Manager or Admin role. (DET-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Manual run triggered successfully"),
        @ApiResponse(responseCode = "400", description = "Validation error (e.g. invalid time range)"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Rule not found")
    })
    public ResponseEntity<Map<String, Object>> triggerManualRun(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            String fromStr = getStr(body, "from");
            String toStr = getStr(body, "to");
            Instant from = fromStr != null ? Instant.parse(fromStr) : null;
            Instant to = toStr != null ? Instant.parse(toStr) : null;
            String reason = getStr(body, "reason");
            String userId = getStr(body, "userId");
            Map<String, Object> result = executionService.triggerManualRun(
                id, from, to, reason, userId, tenantId);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            return notFound(e.getMessage());
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.triggerManualRun: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/{id}/gap-fill")
    @PreAuthorize(SOC_MANAGER_AUTH)
    @Operation(
        summary = "Trigger gap-fill execution",
        description = "Fills detection gaps by re-running a rule against a missed time range. "
            + "Requires SOC Manager or Admin role. (DET-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Gap-fill execution started"),
        @ApiResponse(responseCode = "400", description = "Validation error (e.g. invalid time range)"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Rule not found")
    })
    public ResponseEntity<Map<String, Object>> triggerGapFill(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            String fromStr = getStr(body, "from");
            String toStr = getStr(body, "to");
            Instant from = fromStr != null ? Instant.parse(fromStr) : null;
            Instant to = toStr != null ? Instant.parse(toStr) : null;
            String userId = getStr(body, "userId");
            Map<String, Object> result = executionService.triggerGapFill(
                id, from, to, userId, tenantId);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            return notFound(e.getMessage());
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.triggerGapFill: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // DET-010: Bulk lifecycle operations
    // =========================================================================

    @PostMapping("/ha-detection-rules/bulk/status")
    @PreAuthorize(SOC_MANAGER_AUTH)
    @Operation(
        summary = "Bulk update rule status",
        description = "Updates the status of multiple detection rules in a single operation. "
            + "Requires SOC Manager or Admin role. (DET-003)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Bulk status update results"),
        @ApiResponse(responseCode = "400", description = "Validation error (e.g. invalid status)"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> bulkStatus(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            @SuppressWarnings("unchecked")
            List<String> ruleIds = (List<String>) body.get("ruleIds");
            String targetStatus = getStr(body, "targetStatus");
            String reason = getStr(body, "reason");
            Map<String, Object> result = bulkService.bulkStatus(ruleIds, targetStatus, reason, tenantId);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.bulkStatus: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/bulk/export")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Bulk export rules",
        description = "Exports multiple detection rules in the specified format (e.g. YAML, JSON). (DET-003)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Exported rules payload"),
        @ApiResponse(responseCode = "400", description = "Validation error (e.g. unsupported format)"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> bulkExport(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            @SuppressWarnings("unchecked")
            List<String> ruleIds = (List<String>) body.get("ruleIds");
            String format = getStr(body, "format");
            Map<String, Object> result = bulkService.bulkExport(ruleIds, format, tenantId);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.bulkExport: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/bulk/duplicate")
    @PreAuthorize(SOC_MANAGER_AUTH)
    @Operation(
        summary = "Bulk duplicate rules",
        description = "Duplicates multiple detection rules with an optional name prefix. "
            + "Requires SOC Manager or Admin role. (DET-003)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Duplicated rule details"),
        @ApiResponse(responseCode = "400", description = "Validation error"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> bulkDuplicate(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            @SuppressWarnings("unchecked")
            List<String> ruleIds = (List<String>) body.get("ruleIds");
            String prefix = getStr(body, "prefix");
            Map<String, Object> result = bulkService.bulkDuplicate(ruleIds, prefix, tenantId);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.bulkDuplicate: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/bulk/delete")
    @PreAuthorize(SOC_MANAGER_AUTH)
    @Operation(
        summary = "Bulk delete rules",
        description = "Deletes multiple detection rules in a single operation. "
            + "Requires SOC Manager or Admin role. (DET-003)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Bulk deletion results"),
        @ApiResponse(responseCode = "400", description = "Validation error"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> bulkDelete(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            @SuppressWarnings("unchecked")
            List<String> ruleIds = (List<String>) body.get("ruleIds");
            Map<String, Object> result = bulkService.bulkDelete(ruleIds, tenantId);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.bulkDelete: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // DET-011: Validation and preview
    // =========================================================================

    @PostMapping("/ha-detection-rules/validate")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Validate a rule definition",
        description = "Validates a detection rule definition without persisting it. "
            + "Returns validation results including errors and warnings. (DET-004)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Validation results (may include errors)"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> validateRule(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            @SuppressWarnings("unchecked")
            Map<String, Object> ruleDefinition = (Map<String, Object>) body.getOrDefault("rule", body);
            Map<String, Object> result = validationService.validate(ruleDefinition);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.validateRule: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/preview")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Preview rule matches",
        description = "Executes a detection rule definition against historical data and returns matching events "
            + "without creating alerts. Used for rule tuning. (DET-004)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Preview results with matching events"),
        @ApiResponse(responseCode = "400", description = "Validation error in rule definition"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> previewRule(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            @SuppressWarnings("unchecked")
            Map<String, Object> ruleDefinition = (Map<String, Object>) body.getOrDefault("rule", body);
            @SuppressWarnings("unchecked")
            Map<String, Object> timeRange = (Map<String, Object>) body.get("timeRange");
            Instant from = null;
            Instant to = null;
            if (timeRange != null) {
                String fromStr = timeRange.get("from") != null ? timeRange.get("from").toString() : null;
                String toStr = timeRange.get("to") != null ? timeRange.get("to").toString() : null;
                from = fromStr != null ? Instant.parse(fromStr) : null;
                to = toStr != null ? Instant.parse(toStr) : null;
            }
            Integer limit = body.get("limit") != null ? Integer.parseInt(body.get("limit").toString()) : null;
            String indexPattern = "v3-hive-log-*";
            Map<String, Object> result = previewService.preview(ruleDefinition, from, to, limit, indexPattern);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.previewRule: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // DET-012: Sigma import pipeline
    // =========================================================================

    @PostMapping("/ha-detection-rules/import/validate")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Validate Sigma import candidates",
        description = "Validates Sigma rule files for import compatibility. Returns which rules can be converted "
            + "and any issues found. (DET-005)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Validation results per Sigma file"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> importValidate(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> sigmaFiles = (List<Map<String, Object>>) body.get("sigmaFiles");
            if (sigmaFiles == null) sigmaFiles = Collections.emptyList();
            Map<String, Object> result = sigmaService.validateImport(sigmaFiles);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.importValidate: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/import/preview")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Preview Sigma rule conversion",
        description = "Converts selected Sigma rules to HiveArmor format and returns a preview "
            + "without persisting. (DET-005)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Converted rule previews"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> importPreview(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            @SuppressWarnings("unchecked")
            List<String> candidateIds = (List<String>) body.get("candidates");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> sigmaRules = (List<Map<String, Object>>) body.get("sigmaRules");
            if (candidateIds == null) candidateIds = Collections.emptyList();
            if (sigmaRules == null) sigmaRules = Collections.emptyList();
            Map<String, Object> result = sigmaService.previewConversion(candidateIds, sigmaRules);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.importPreview: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/import/execute")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Execute Sigma import",
        description = "Imports selected and converted Sigma rules into the detection rule library. (DET-005)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Import execution results"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> importExecute(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            @SuppressWarnings("unchecked")
            List<String> selectedRuleIds = (List<String>) body.get("rules");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> convertedRules = (List<Map<String, Object>>) body.get("convertedRules");
            String importAsStatus = getStr(body, "importAsStatus");
            String userId = getStr(body, "userId");
            if (selectedRuleIds == null) selectedRuleIds = Collections.emptyList();
            if (convertedRules == null) convertedRules = Collections.emptyList();
            Map<String, Object> result = sigmaService.executeImport(
                selectedRuleIds, convertedRules, importAsStatus, userId, tenantId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.importExecute: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/managed-updates/check")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Check for managed rule updates",
        description = "Checks if any managed detection rules have upstream updates available. (DET-005)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Available updates summary"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> checkManagedUpdates() {
        try {
            Long tenantId = resolveTenantId();
            Map<String, Object> result = sigmaService.checkManagedUpdates(tenantId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.checkManagedUpdates: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/managed-updates/apply")
    @PreAuthorize(SOC_MANAGER_AUTH)
    @Operation(
        summary = "Apply managed rule updates",
        description = "Applies upstream updates to selected managed detection rules. "
            + "Requires SOC Manager or Admin role. (DET-005)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Update application results"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> applyManagedUpdates(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            @SuppressWarnings("unchecked")
            List<String> ruleIds = (List<String>) body.get("ruleIds");
            if (ruleIds == null) ruleIds = Collections.emptyList();
            Map<String, Object> result = sigmaService.applyManagedUpdates(ruleIds, tenantId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.applyManagedUpdates: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // DET-013: Detection health SSE stream
    // =========================================================================

    @GetMapping(value = "/ha-detection-rules/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Stream detection health events",
        description = "Server-Sent Events stream for real-time detection rule health updates. "
            + "Supports Last-Event-ID for reconnection replay. (DET-003)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "SSE stream established"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "429", description = "Too many SSE connections")
    })
    public SseEmitter streamDetectionHealth(
            @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId) {
        try {
            Long tenantId = resolveTenantId();
            return sseService.createEmitter(tenantId, lastEventId);
        } catch (Exception e) {
            log.error("{}.streamDetectionHealth: {}", CLASSNAME, e.getMessage(), e);
            SseEmitter errorEmitter = new SseEmitter(0L);
            errorEmitter.completeWithError(e);
            return errorEmitter;
        }
        // Note: TenantContext NOT cleared here — SSE is long-lived
    }

    // =========================================================================
    // DET-015: ATT&CK coverage matrix
    // =========================================================================

    @GetMapping("/ha-detection-rules/coverage")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get ATT&CK coverage matrix",
        description = "Returns MITRE ATT&CK technique coverage based on active detection rules. "
            + "Optionally filtered by scope (custom, managed, all). (DET-005)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Coverage matrix data"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> getCoverage(
            @RequestParam(required = false) String scope) {
        try {
            Long tenantId = resolveTenantId();
            Map<String, Object> result = coverageService.getCoverage(scope, tenantId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.getCoverage: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // DET-016: Rule authoring lifecycle
    // =========================================================================

    @GetMapping("/ha-detection-rules/{id}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get detection rule by ID",
        description = "Returns the full detection rule including definition, metadata, version history, "
            + "and execution statistics. (DET-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Full rule details"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Rule not found")
    })
    public ResponseEntity<Map<String, Object>> getRule(@PathVariable String id) {
        try {
            Long tenantId = resolveTenantId();
            Map<String, Object> result = authoringService.getFullRule(id, tenantId);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            return notFound(e.getMessage());
        } catch (Exception e) {
            log.error("{}.getRule: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Create a detection rule",
        description = "Creates a new detection rule with the provided definition and metadata. "
            + "Returns the created rule with generated ID and version. (DET-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Rule created successfully"),
        @ApiResponse(responseCode = "400", description = "Validation error in rule definition"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> createRule(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            String userId = getStr(body, "userId");
            if (userId == null) userId = "system";
            Map<String, Object> result = authoringService.createRule(body, userId, tenantId);
            return ResponseEntity.status(201).body(result);
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.createRule: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PatchMapping("/ha-detection-rules/{id}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Update a detection rule",
        description = "Partially updates a detection rule. Creates a new version in the rule's history. (DET-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Rule updated successfully"),
        @ApiResponse(responseCode = "400", description = "Validation error"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Rule not found")
    })
    public ResponseEntity<Map<String, Object>> updateRule(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            String userId = getStr(body, "userId");
            if (userId == null) userId = "system";
            Map<String, Object> result = authoringService.updateRule(id, body, userId, tenantId);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            return notFound(e.getMessage());
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.updateRule: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/{id}/submit-review")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Submit rule for review",
        description = "Submits a detection rule for peer review before activation. "
            + "Transitions the rule to 'pending_review' state. (DET-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Rule submitted for review"),
        @ApiResponse(responseCode = "400", description = "Invalid state transition"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Rule not found")
    })
    public ResponseEntity<Map<String, Object>> submitForReview(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            String userId = getStr(body, "userId");
            if (userId == null) userId = "system";
            Map<String, Object> result = authoringService.submitForReview(id, userId, tenantId);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            return notFound(e.getMessage());
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.submitForReview: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/{id}/approve")
    @PreAuthorize(SOC_MANAGER_AUTH)
    @Operation(
        summary = "Approve a detection rule",
        description = "Approves a rule that is pending review. Transitions to 'active' state. "
            + "Requires SOC Manager or Admin role. (DET-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Rule approved and activated"),
        @ApiResponse(responseCode = "400", description = "Invalid state transition"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Rule not found")
    })
    public ResponseEntity<Map<String, Object>> approveRule(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            String userId = getStr(body, "userId");
            String comment = getStr(body, "comment");
            if (userId == null) userId = "system";
            Map<String, Object> result = authoringService.approveRule(id, comment, userId, tenantId);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            return notFound(e.getMessage());
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.approveRule: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/{id}/reject")
    @PreAuthorize(SOC_MANAGER_AUTH)
    @Operation(
        summary = "Reject a detection rule",
        description = "Rejects a rule that is pending review with an optional comment. "
            + "Requires SOC Manager or Admin role. (DET-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Rule rejected"),
        @ApiResponse(responseCode = "400", description = "Invalid state transition"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Rule not found")
    })
    public ResponseEntity<Map<String, Object>> rejectRule(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            String userId = getStr(body, "userId");
            String comment = getStr(body, "comment");
            if (userId == null) userId = "system";
            Map<String, Object> result = authoringService.rejectRule(id, comment, userId, tenantId);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            return notFound(e.getMessage());
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.rejectRule: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-detection-rules/{id}/revert")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Revert a detection rule to a previous version",
        description = "Reverts a detection rule to a specified previous version. "
            + "If no version is specified, reverts to the immediately prior version. (DET-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Rule reverted successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid target version"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Rule not found")
    })
    public ResponseEntity<Map<String, Object>> revertRule(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantId();
            String userId = getStr(body, "userId");
            Integer targetVersion = body.get("targetVersion") != null
                ? Integer.parseInt(body.get("targetVersion").toString()) : null;
            if (userId == null) userId = "system";
            Map<String, Object> result = authoringService.revertRule(id, targetVersion, userId, tenantId);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            return notFound(e.getMessage());
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}.revertRule: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Long resolveTenantId() {
        Long tenantId = TenantContext.getClientId();
        return tenantId != null ? tenantId : 0L;
    }

    private ResponseEntity<Map<String, Object>> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.badRequest().body(error);
    }

    private ResponseEntity<Map<String, Object>> notFound(String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", "NOT_FOUND");
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.status(404).body(error);
    }

    private String getStr(Map<String, Object> map, String key) {
        if (map == null) return null;
        Object val = map.get(key);
        return val != null ? val.toString() : null;
    }
}
