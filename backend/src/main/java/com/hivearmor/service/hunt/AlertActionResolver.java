package com.hivearmor.service.hunt;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * Computes the {@code availableActions} array for a given alert based on the current
 * user's roles, tenant context, alert state (locked, retention, status).
 *
 * <p>Each action result contains:
 * <ul>
 *   <li>{@code id} — action identifier (change_status, add_note, apply_tags, link_incident)</li>
 *   <li>{@code allowed} — whether the user can perform this action now</li>
 *   <li>{@code reason} — human-readable explanation when not allowed (null otherwise)</li>
 *   <li>{@code reasonCode} — machine-readable code (ROLE_REQUIRED, ALERT_LOCKED, TENANT_MISMATCH, RETENTION_EXPIRED)</li>
 *   <li>{@code requiresReason} — whether a reason/note is mandatory for this action</li>
 *   <li>{@code requiresPreview} — whether the preview step is required before execution</li>
 * </ul>
 *
 * <p><strong>ALT-022:</strong> Permission-aware quick actions.
 */
@Service
public class AlertActionResolver {

    /** Action identifiers. */
    public static final String ACTION_CHANGE_STATUS = "change_status";
    public static final String ACTION_ADD_NOTE = "add_note";
    public static final String ACTION_APPLY_TAGS = "apply_tags";
    public static final String ACTION_LINK_INCIDENT = "link_incident";

    /** Reason codes. */
    public static final String REASON_ROLE_REQUIRED = "ROLE_REQUIRED";
    public static final String REASON_ALERT_LOCKED = "ALERT_LOCKED";
    public static final String REASON_TENANT_MISMATCH = "TENANT_MISMATCH";
    public static final String REASON_RETENTION_EXPIRED = "RETENTION_EXPIRED";

    /** Roles that grant access to alert actions. */
    private static final Set<String> ALLOWED_ROLES = Set.of(
        "ROLE_SOC_ANALYST", "ROLE_SOC_MANAGER", "ROLE_ANALYST", "ROLE_ADMIN"
    );

    /** Numeric status code for 'closed' alerts. */
    private static final int STATUS_CLOSED = 5;

    /**
     * Resolves available actions for a given alert document.
     *
     * @param alertSource   the raw OpenSearch alert document fields
     * @param userLogin     the authenticated user's login
     * @param userRoles     the authenticated user's granted roles
     * @param tenantPrefix  the current request's tenant prefix (from TenantContext)
     * @return list of action maps, one per action type
     */
    public List<Map<String, Object>> resolveAvailableActions(
            Map<String, Object> alertSource,
            String userLogin,
            Collection<String> userRoles,
            String tenantPrefix) {

        List<Map<String, Object>> actions = new ArrayList<>(4);
        actions.add(resolveAction(ACTION_CHANGE_STATUS, alertSource, userRoles, tenantPrefix));
        actions.add(resolveAction(ACTION_ADD_NOTE, alertSource, userRoles, tenantPrefix));
        actions.add(resolveAction(ACTION_APPLY_TAGS, alertSource, userRoles, tenantPrefix));
        actions.add(resolveAction(ACTION_LINK_INCIDENT, alertSource, userRoles, tenantPrefix));
        return actions;
    }

    /**
     * Resolves a single action's availability.
     */
    private Map<String, Object> resolveAction(
            String actionId,
            Map<String, Object> alertSource,
            Collection<String> userRoles,
            String tenantPrefix) {

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("id", actionId);

        // 1. Check role
        if (!hasRequiredRole(userRoles)) {
            return denied(action, "User does not have the required role to perform this action", REASON_ROLE_REQUIRED, actionId);
        }

        // 2. Check tenant match
        if (!isTenantMatch(alertSource, tenantPrefix)) {
            return denied(action, "Alert belongs to a different tenant", REASON_TENANT_MISMATCH, actionId);
        }

        // 3. Check locked state
        if (isAlertLocked(alertSource)) {
            return denied(action, "Alert is locked and cannot be modified", REASON_ALERT_LOCKED, actionId);
        }

        // 4. Check retention expiry
        if (isRetentionExpired(alertSource)) {
            return denied(action, "Alert retention period has expired", REASON_RETENTION_EXPIRED, actionId);
        }

        // All checks passed — action is allowed
        action.put("allowed", true);
        action.put("reason", null);
        action.put("reasonCode", null);
        action.put("requiresReason", ACTION_CHANGE_STATUS.equals(actionId));
        action.put("requiresPreview", ACTION_LINK_INCIDENT.equals(actionId));
        return action;
    }

    /**
     * Builds a denied action map.
     */
    private Map<String, Object> denied(Map<String, Object> action, String reason, String reasonCode, String actionId) {
        action.put("allowed", false);
        action.put("reason", reason);
        action.put("reasonCode", reasonCode);
        action.put("requiresReason", ACTION_CHANGE_STATUS.equals(actionId));
        action.put("requiresPreview", ACTION_LINK_INCIDENT.equals(actionId));
        return action;
    }

    /**
     * Checks if the user has at least one of the required roles.
     */
    private boolean hasRequiredRole(Collection<String> userRoles) {
        if (userRoles == null || userRoles.isEmpty()) {
            return false;
        }
        for (String role : userRoles) {
            if (ALLOWED_ROLES.contains(role)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if the alert's tenant matches the request tenant prefix.
     * If the alert has no tenant field, it's considered a match (single-tenant mode).
     */
    private boolean isTenantMatch(Map<String, Object> alertSource, String tenantPrefix) {
        Object alertTenant = alertSource.get("tenantId");
        if (alertTenant == null) {
            // No tenant scoping on the alert — allow in single-tenant deployments
            return true;
        }
        if (tenantPrefix == null || tenantPrefix.isBlank()) {
            // No tenant context on the request — global mode, allow
            return true;
        }
        return tenantPrefix.equals(alertTenant.toString());
    }

    /**
     * Checks if the alert is locked. An alert is locked if:
     * - The {@code locked} field is true, OR
     * - The {@code status} field equals the closed numeric code (5)
     */
    private boolean isAlertLocked(Map<String, Object> alertSource) {
        // Check explicit lock field
        Object locked = alertSource.get("locked");
        if (locked instanceof Boolean && (Boolean) locked) {
            return true;
        }
        if (locked instanceof String && "true".equalsIgnoreCase((String) locked)) {
            return true;
        }

        // Check closed status
        Object status = alertSource.get("status");
        if (status instanceof Number && ((Number) status).intValue() == STATUS_CLOSED) {
            return true;
        }

        return false;
    }

    /**
     * Checks if the alert's retention has expired.
     * The alert document may contain a {@code retentionExpiresAt} ISO timestamp field.
     */
    private boolean isRetentionExpired(Map<String, Object> alertSource) {
        Object retention = alertSource.get("retentionExpiresAt");
        if (retention == null) {
            return false;
        }
        try {
            Instant expiresAt = Instant.parse(retention.toString());
            return expiresAt.isBefore(Instant.now());
        } catch (Exception e) {
            // Malformed date — don't block the action
            return false;
        }
    }
}
