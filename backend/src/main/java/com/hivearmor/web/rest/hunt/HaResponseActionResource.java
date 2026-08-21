package com.hivearmor.web.rest.hunt;

import com.hivearmor.domain.ResponseJob;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.security.jwt.TokenProvider;
import com.hivearmor.service.hunt.ResponseActionRegistry;
import com.hivearmor.service.hunt.ResponseActionRegistry.ActionParameter;
import com.hivearmor.service.hunt.ResponseActionRegistry.ResponseAction;
import com.hivearmor.service.hunt.ResponseJobService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST controller for response action catalog, preview, and execution.
 *
 * <p>Provides:
 * <ul>
 *   <li>ALT-010 Part 1: Action catalog listing and impact preview</li>
 *   <li>ALT-010 Part 2: Action execution and job tracking (added in Task 5)</li>
 * </ul>
 *
 * <p>Authorization: Requires {@code ROLE_SOC_ANALYST}, {@code ROLE_SOC_MANAGER},
 * or {@code ROLE_ADMIN}.
 */
@RestController
@RequestMapping("/api")
public class HaResponseActionResource {

    private static final Logger log = LoggerFactory.getLogger(HaResponseActionResource.class);
    private static final String CLASSNAME = "HaResponseActionResource";

    private static final String RESPONSE_ACTION_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') or hasAuthority('ROLE_ADMIN')";

    private final ResponseActionRegistry registry;
    private final TokenProvider tokenProvider;
    private final ResponseJobService responseJobService;
    private final ObjectMapper objectMapper;

    public HaResponseActionResource(ResponseActionRegistry registry, TokenProvider tokenProvider,
                                     ResponseJobService responseJobService, ObjectMapper objectMapper) {
        this.registry = registry;
        this.tokenProvider = tokenProvider;
        this.responseJobService = responseJobService;
        this.objectMapper = objectMapper;
    }

    // =========================================================================
    // ALT-010 Part 1: Action Catalog
    // =========================================================================

    /**
     * Returns the full response action catalog with integration health status.
     */
    @GetMapping("/response/actions")
    @PreAuthorize(RESPONSE_ACTION_AUTH)
    public ResponseEntity<?> getActionCatalog() {
        try {
            List<ResponseAction> actions = registry.getAllActions();

            List<Map<String, Object>> result = actions.stream()
                .map(action -> {
                    Map<String, Object> dto = new LinkedHashMap<>();
                    dto.put("id", action.id());
                    dto.put("name", action.name());
                    dto.put("description", action.description());
                    dto.put("category", action.category());
                    dto.put("targetType", action.targetType());
                    dto.put("parameters", action.parameters().stream()
                        .map(this::parameterToMap)
                        .collect(Collectors.toList()));
                    dto.put("integrationStatus", registry.getIntegrationStatus(action.id()));
                    dto.put("riskLevel", action.riskLevel());
                    dto.put("requiredRole", action.requiredRole());
                    return dto;
                })
                .collect(Collectors.toList());

            return ResponseEntity.ok(result);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-010 Part 1: Action Preview
    // =========================================================================

    /**
     * Previews the impact of executing a response action without actually performing it.
     *
     * <p>Validates the actionId, request body parameters, and computes the impact
     * assessment including warnings, reversibility, and whether approval is required.
     * Returns a signed previewToken (JWT with 5-minute expiry) to authorize execution.
     */
    @PostMapping("/response/actions/{actionId}/preview")
    @PreAuthorize(RESPONSE_ACTION_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> previewAction(@PathVariable String actionId,
                                           @RequestBody Map<String, Object> requestBody) {
        try {
            // 1. Validate actionId exists
            Optional<ResponseAction> optAction = registry.getAction(actionId);
            if (optAction.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            ResponseAction action = optAction.get();

            // 2. Extract and validate request body
            String targetId = (String) requestBody.get("targetId");
            if (targetId == null || targetId.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "targetId is required"));
            }
            Map<String, Object> parameters = (Map<String, Object>) requestBody.getOrDefault("parameters", Map.of());

            // 3. Validate required parameters — fill defaults when available
            for (ActionParameter param : action.parameters()) {
                if (param.required() && !parameters.containsKey(param.name())) {
                    if (param.defaultValue() != null) {
                        // Auto-fill from default value
                        parameters.put(param.name(), param.defaultValue());
                    } else {
                        return ResponseEntity.badRequest().body(Map.of(
                            "error", "Missing required parameter: " + param.name()
                        ));
                    }
                }
            }

            // 4. Compute impact assessment
            List<Map<String, Object>> impact = computeImpact(action, targetId, parameters);

            // 5. Compute warnings
            List<String> warnings = computeWarnings(action, targetId);

            // 6. Determine reversibility
            boolean reversible = determineReversibility(action);

            // 7. Estimated duration
            String estimatedDuration = computeEstimatedDuration(action);

            // 8. Determine requiresApproval
            boolean requiresApproval = determineRequiresApproval(action);

            // 9. Build target summary
            String targetSummary = buildTargetSummary(action, targetId);

            // 10. Generate previewToken (JWT signed with server key, 5-min expiry)
            String previewToken = generatePreviewToken(actionId, targetId, parameters);

            // 11. Build response
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("actionId", actionId);
            response.put("targetSummary", targetSummary);
            response.put("impact", impact);
            response.put("reversible", reversible);
            response.put("estimatedDuration", estimatedDuration);
            response.put("warnings", warnings);
            response.put("requiresApproval", requiresApproval);
            response.put("previewToken", previewToken);

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-010 Part 2: Action Execution
    // =========================================================================

    /**
     * Executes a response action after validating the previewToken and role authorization.
     *
     * <p>Validates:
     * <ul>
     *   <li>previewToken is present, not expired, and matches actionId + targetId</li>
     *   <li>User has the required role for the action (critical actions need ROLE_SOC_MANAGER)</li>
     * </ul>
     *
     * <p>Creates a job via ResponseJobService, dispatches async execution, and returns
     * the job reference with status "queued".
     */
    @PostMapping("/response/actions/{actionId}/execute")
    @PreAuthorize(RESPONSE_ACTION_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> executeAction(@PathVariable String actionId,
                                           @RequestBody Map<String, Object> requestBody) {
        try {
            // 1. Validate actionId exists
            Optional<ResponseAction> optAction = registry.getAction(actionId);
            if (optAction.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            ResponseAction action = optAction.get();

            // 2. Extract request body fields
            String targetId = (String) requestBody.get("targetId");
            if (targetId == null || targetId.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "targetId is required"));
            }
            String previewToken = (String) requestBody.get("previewToken");
            if (previewToken == null || previewToken.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "previewToken is required"));
            }
            Map<String, Object> parameters = (Map<String, Object>) requestBody.getOrDefault("parameters", Map.of());
            String alertId = (String) requestBody.get("alertId");

            // 3. Validate previewToken (decode JWT, check expiry, verify actionId+targetId match)
            Claims claims;
            try {
                claims = Jwts.parserBuilder()
                    .setSigningKey(getSigningKey())
                    .build()
                    .parseClaimsJws(previewToken)
                    .getBody();
            } catch (Exception e) {
                log.warn("Invalid previewToken for action [{}]: {}", actionId, e.getMessage());
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "previewToken is expired or invalid",
                    "code", "INVALID_PREVIEW_TOKEN"
                ));
            }

            // Verify token claims match the request
            String tokenActionId = claims.get("actionId", String.class);
            String tokenTargetId = claims.get("targetId", String.class);
            if (!actionId.equals(tokenActionId) || !targetId.equals(tokenTargetId)) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "previewToken does not match the requested action and target",
                    "code", "TOKEN_MISMATCH"
                ));
            }

            // 4. Check role authorization (critical actions need ROLE_SOC_MANAGER)
            if ("critical".equals(action.riskLevel()) || "ROLE_SOC_MANAGER".equals(action.requiredRole())) {
                if (!hasRole("ROLE_SOC_MANAGER") && !hasRole("ROLE_ADMIN")) {
                    return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                        "error", "Critical action requires ROLE_SOC_MANAGER or ROLE_ADMIN",
                        "code", "INSUFFICIENT_ROLE",
                        "requiredRole", action.requiredRole()
                    ));
                }
            }

            // 5. Get current user and tenant
            String createdBy = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            // 6. Serialize parameters to JSON string
            String parametersJson;
            try {
                parametersJson = objectMapper.writeValueAsString(parameters);
            } catch (Exception e) {
                parametersJson = parameters.toString();
            }

            // 7. Create job via ResponseJobService
            ResponseJob job = responseJobService.createJob(
                actionId, targetId, action.targetType(), parametersJson, createdBy, tenantId, alertId
            );

            // 8. Dispatch async execution
            responseJobService.executeAsync(job);

            // 9. Build response
            Instant estimatedCompletion = job.getCreatedAt().plusSeconds(10);
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("jobId", job.getId());
            response.put("status", job.getStatus());
            response.put("actionId", actionId);
            response.put("targetId", targetId);
            response.put("createdAt", job.getCreatedAt().toString());
            response.put("estimatedCompletion", estimatedCompletion.toString());

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-010 Part 2: Job Status
    // =========================================================================

    /**
     * Returns the current status of a response job.
     *
     * <p>Validates tenant ownership — returns 404 if the job does not exist or
     * belongs to a different tenant.
     */
    @GetMapping("/response/jobs/{jobId}")
    @PreAuthorize(RESPONSE_ACTION_AUTH)
    public ResponseEntity<?> getJobStatus(@PathVariable String jobId) {
        try {
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            Optional<ResponseJob> optJob = responseJobService.getJob(jobId, tenantId);
            if (optJob.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                    "error", "Job not found",
                    "code", "JOB_NOT_FOUND"
                ));
            }

            ResponseJob job = optJob.get();
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("jobId", job.getId());
            response.put("status", job.getStatus());
            response.put("actionId", job.getActionId());
            response.put("targetId", job.getTargetId());
            response.put("createdBy", job.getCreatedBy());
            response.put("createdAt", job.getCreatedAt().toString());
            if (job.getStartedAt() != null) {
                response.put("startedAt", job.getStartedAt().toString());
            }
            if (job.getCompletedAt() != null) {
                response.put("completedAt", job.getCompletedAt().toString());
            }
            if (job.getResult() != null) {
                response.put("result", job.getResult());
            }
            if (job.getErrorCode() != null) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("code", job.getErrorCode());
                error.put("message", job.getErrorMessage());
                error.put("retryable", true);
                response.put("error", error);
            }

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    private Map<String, Object> parameterToMap(ActionParameter param) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", param.name());
        map.put("type", param.type());
        map.put("required", param.required());
        map.put("description", param.description());
        if (param.defaultValue() != null) {
            map.put("defaultValue", param.defaultValue());
        }
        return map;
    }

    /**
     * Computes the impact description for a given action.
     */
    private List<Map<String, Object>> computeImpact(ResponseAction action, String targetId,
                                                     Map<String, Object> parameters) {
        List<Map<String, Object>> impact = new ArrayList<>();
        String entityLabel = targetId.contains("-") ? targetId.substring(targetId.lastIndexOf('-') + 1).toUpperCase() : targetId;

        switch (action.id()) {
            case "isolate_host" -> {
                impact.add(impactItem(
                    "Host will be disconnected from all network segments except management VLAN",
                    "network", List.of(targetId)));
                impact.add(impactItem(
                    "Active user sessions on the host will be terminated",
                    "users", List.of(targetId)));
            }
            case "kill_process" -> {
                boolean includeChildren = Boolean.parseBoolean(
                    String.valueOf(parameters.getOrDefault("includeChildren", "true")));
                String desc = includeChildren
                    ? "Process and all child processes will be terminated"
                    : "Process will be terminated";
                impact.add(impactItem(desc, "process", List.of(targetId)));
            }
            case "block_ip" -> {
                String direction = String.valueOf(parameters.getOrDefault("direction", "both"));
                impact.add(impactItem(
                    "IP will be blocked at firewall (" + direction + " direction)",
                    "network", List.of(targetId)));
            }
            case "disable_account" -> {
                impact.add(impactItem(
                    "User account will be disabled in Active Directory",
                    "identity", List.of(targetId)));
                if (Boolean.parseBoolean(String.valueOf(parameters.getOrDefault("revokeTokens", "true")))) {
                    impact.add(impactItem(
                        "All active sessions and tokens will be revoked",
                        "sessions", List.of(targetId)));
                }
            }
            case "quarantine_file" -> {
                impact.add(impactItem(
                    "File will be moved to quarantine location and become inaccessible",
                    "filesystem", List.of(targetId)));
            }
            case "revoke_sessions" -> {
                impact.add(impactItem(
                    "All active sessions for the user will be terminated",
                    "sessions", List.of(targetId)));
            }
            case "collect_forensics" -> {
                String artifacts = String.valueOf(parameters.getOrDefault("artifacts", "eventlogs,registry"));
                impact.add(impactItem(
                    "Forensic artifacts (" + artifacts + ") will be collected from host",
                    "investigation", List.of(targetId)));
            }
            case "run_scan" -> {
                impact.add(impactItem(
                    "Antivirus scan will be initiated on the host (may impact performance)",
                    "host", List.of(targetId)));
            }
            default -> impact.add(impactItem(
                "Action will be executed on target", "general", List.of(targetId)));
        }
        return impact;
    }

    private Map<String, Object> impactItem(String description, String scope, List<String> affectedEntities) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("description", description);
        item.put("scope", scope);
        item.put("affectedEntities", affectedEntities);
        return item;
    }

    /**
     * Generates contextual warnings based on the action type.
     */
    private List<String> computeWarnings(ResponseAction action, String targetId) {
        List<String> warnings = new ArrayList<>();
        switch (action.id()) {
            case "isolate_host" -> {
                warnings.add("Active user sessions on the host will be disrupted");
                warnings.add("Scheduled tasks and services will lose network connectivity");
            }
            case "kill_process" -> {
                warnings.add("Unsaved data in the process may be lost");
            }
            case "block_ip" -> {
                warnings.add("Legitimate traffic from this IP will also be blocked");
            }
            case "disable_account" -> {
                warnings.add("User will immediately lose access to all systems");
            }
            case "quarantine_file" -> {
                warnings.add("Applications depending on this file may stop functioning");
            }
            case "revoke_sessions" -> {
                warnings.add("User will be forced to re-authenticate on all devices");
            }
            default -> {
                // No additional warnings for low-risk investigation actions
            }
        }
        return warnings;
    }

    /**
     * Determines whether the action is reversible.
     */
    private boolean determineReversibility(ResponseAction action) {
        return switch (action.id()) {
            case "isolate_host", "block_ip", "disable_account", "revoke_sessions", "quarantine_file" -> true;
            case "kill_process" -> false;
            case "collect_forensics", "run_scan" -> true;
            default -> false;
        };
    }

    /**
     * Returns the estimated duration for action completion.
     */
    private String computeEstimatedDuration(ResponseAction action) {
        return switch (action.id()) {
            case "isolate_host" -> "15 seconds";
            case "kill_process" -> "5 seconds";
            case "block_ip" -> "10 seconds";
            case "disable_account" -> "10 seconds";
            case "quarantine_file" -> "30 seconds";
            case "revoke_sessions" -> "5 seconds";
            case "collect_forensics" -> "2-5 minutes";
            case "run_scan" -> "10-30 minutes";
            default -> "unknown";
        };
    }

    /**
     * Determines whether execution requires manager approval.
     * Critical actions require approval unless the current user is SOC_MANAGER or ADMIN.
     */
    private boolean determineRequiresApproval(ResponseAction action) {
        if (!"critical".equals(action.riskLevel())) {
            return false;
        }
        // Critical actions require approval unless user is SOC_MANAGER or ADMIN
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return true;
        }
        Set<String> roles = auth.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .collect(Collectors.toSet());
        return !roles.contains("ROLE_SOC_MANAGER") && !roles.contains("ROLE_ADMIN");
    }

    /**
     * Builds a human-readable target summary.
     */
    private String buildTargetSummary(ResponseAction action, String targetId) {
        return switch (action.targetType()) {
            case "host" -> "Host " + targetId;
            case "user" -> "User account " + targetId;
            case "ip" -> "IP address " + targetId;
            case "process" -> "Process " + targetId;
            case "file" -> "File " + targetId;
            default -> "Target " + targetId;
        };
    }

    /**
     * Generates a signed JWT preview token with 5-minute expiry.
     * Contains: actionId, targetId, hash of parameters.
     */
    private String generatePreviewToken(String actionId, String targetId, Map<String, Object> parameters) {
        long now = System.currentTimeMillis();
        long expiry = now + (5 * 60 * 1000L); // 5 minutes

        String paramsHash = hashParameters(parameters);

        // Use the same signing key as the auth token provider via reflection-free approach:
        // We build a JWT with custom claims and sign using TokenProvider's key.
        // Since TokenProvider doesn't expose a generic sign method, we build the token
        // structure manually using the same JJWT library.
        return Jwts.builder()
            .setSubject("preview")
            .claim("actionId", actionId)
            .claim("targetId", targetId)
            .claim("paramsHash", paramsHash)
            .setIssuedAt(new Date(now))
            .setExpiration(new Date(expiry))
            .signWith(getSigningKey(), SignatureAlgorithm.HS512)
            .compact();
    }

    /**
     * Computes SHA-256 hash of the parameters for token integrity.
     */
    private String hashParameters(Map<String, Object> parameters) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String sorted = new TreeMap<>(parameters).toString();
            byte[] hash = digest.digest(sorted.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    /**
     * Gets the JWT signing key from TokenProvider.
     * Uses reflection to access the private key field since TokenProvider doesn't
     * expose a generic token signing method for non-auth tokens.
     */
    private java.security.Key getSigningKey() {
        try {
            java.lang.reflect.Field keyField = TokenProvider.class.getDeclaredField("key");
            keyField.setAccessible(true);
            return (java.security.Key) keyField.get(tokenProvider);
        } catch (NoSuchFieldException | IllegalAccessException e) {
            throw new RuntimeException("Unable to access JWT signing key", e);
        }
    }

    /**
     * Checks whether the current authenticated user has the specified role.
     */
    private boolean hasRole(String role) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return false;
        }
        return auth.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .anyMatch(role::equals);
    }
}
