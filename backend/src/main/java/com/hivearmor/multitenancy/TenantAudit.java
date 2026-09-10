package com.hivearmor.multitenancy;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.application_events.ApplicationEventService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * P0A1-T17 — one place that records tenant-boundary security events (a cross-tenant
 * access denial, or a required tenant scope that could not be established) as
 * structured, secret-free audit entries via {@link ApplicationEventService}.
 *
 * <p>Events carry actor / tenant / target / operation / decision. They NEVER carry a
 * token, password, another tenant's data, or the target's contents — only identifiers
 * and the decision, so the audit trail cannot itself leak across tenants.
 *
 * <p>Static bridge: the deny points that need to audit ({@link TenantScope}, the gRPC
 * target guards) are static/utility code, so this component publishes itself into a
 * static holder on construction. Calls made before Spring wires the bean (isolated unit
 * tests) no-op safely rather than throwing.
 */
@Component
public class TenantAudit {

    private static final Logger log = LoggerFactory.getLogger(TenantAudit.class);

    private static volatile ApplicationEventService eventService;

    public TenantAudit(ApplicationEventService eventService) {
        TenantAudit.eventService = eventService;
    }

    /** Test/shutdown hook — reset the static bridge. */
    static void resetForTests() {
        eventService = null;
    }

    /**
     * Record a denied cross-tenant access. Use at the point the boundary is enforced
     * (an object resolved outside the caller's tenant, or MSSP mode with no resolvable
     * tenant). No secrets — {@code targetType}/{@code targetId} are identifiers only.
     *
     * @param operation   the attempted operation, e.g. "quarantineFile", "listAgents"
     * @param targetType  the resource kind, e.g. "agent", "quarantine", "edrEvent"
     * @param targetId    the target identifier (an id/hostname), never its contents
     * @param reason      short machine-readable reason, e.g. "no-tenant-scope",
     *                    "target-outside-tenant"
     */
    public static void crossTenantDenied(String operation, String targetType, Object targetId, String reason) {
        ApplicationEventService svc = eventService;
        if (svc == null) {
            return;
        }
        try {
            String actor = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            Long tenant = TenantScope.currentTenantOrNull();
            Map<String, Object> details = new HashMap<>();
            details.put("actor", actor);
            details.put("tenant", tenant);
            details.put("operation", operation);
            details.put("targetType", targetType);
            details.put("targetId", targetId == null ? null : String.valueOf(targetId));
            details.put("decision", "DENY");
            details.put("reason", reason);
            svc.createEvent(
                "Cross-tenant access denied: actor=" + actor + " op=" + operation
                    + " target=" + targetType + ":" + targetId + " reason=" + reason,
                ApplicationEventType.CROSS_TENANT_DENIED,
                details);
        } catch (Exception e) {
            // Auditing must never break the enforcement path.
            log.debug("cross-tenant audit write failed: {}", e.getMessage());
        }
    }
}
