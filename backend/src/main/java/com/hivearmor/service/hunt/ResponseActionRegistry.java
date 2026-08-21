package com.hivearmor.service.hunt;

import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Static registry of available response actions with their schemas and integration health.
 *
 * <p>Actions are defined in-code — no database dependency. Integration health is simulated
 * (no real EDR/firewall connectivity check) for this sprint.
 *
 * <p><strong>ALT-010:</strong> Response action catalog.
 */
@Component
public class ResponseActionRegistry {

    /**
     * Represents a single parameter in an action's schema.
     */
    public record ActionParameter(String name, String type, boolean required, String description, String defaultValue) {}

    /**
     * Represents a response action definition.
     */
    public record ResponseAction(
        String id,
        String name,
        String description,
        String category,
        String targetType,
        List<ActionParameter> parameters,
        String riskLevel,
        String requiredRole
    ) {}

    private static final Map<String, ResponseAction> ACTIONS = new LinkedHashMap<>();

    static {
        ACTIONS.put("isolate_host", new ResponseAction(
            "isolate_host",
            "Isolate Host",
            "Isolate a host from the network while maintaining management channel",
            "containment",
            "host",
            List.of(
                new ActionParameter("duration", "duration", true, "Isolation duration (e.g., 4h, 24h)", "4h"),
                new ActionParameter("allowDns", "boolean", false, "Allow DNS resolution during isolation", "false")
            ),
            "critical",
            "ROLE_SOC_MANAGER"
        ));

        ACTIONS.put("kill_process", new ResponseAction(
            "kill_process",
            "Kill Process",
            "Terminate a running process on the target host",
            "containment",
            "process",
            List.of(
                new ActionParameter("pid", "integer", true, "Process ID to terminate", null),
                new ActionParameter("includeChildren", "boolean", false, "Also terminate child processes", "true")
            ),
            "high",
            "ROLE_SOC_ANALYST"
        ));

        ACTIONS.put("block_ip", new ResponseAction(
            "block_ip",
            "Block IP Address",
            "Add IP to network firewall block list",
            "containment",
            "ip",
            List.of(
                new ActionParameter("direction", "enum", true, "Block direction: inbound, outbound, both", "both"),
                new ActionParameter("duration", "duration", false, "Block duration (permanent if omitted)", null)
            ),
            "medium",
            "ROLE_SOC_ANALYST"
        ));

        ACTIONS.put("disable_account", new ResponseAction(
            "disable_account",
            "Disable User Account",
            "Disable a user account in Active Directory",
            "eradication",
            "user",
            List.of(
                new ActionParameter("revokeTokens", "boolean", false, "Also revoke all active sessions", "true")
            ),
            "high",
            "ROLE_SOC_MANAGER"
        ));

        ACTIONS.put("quarantine_file", new ResponseAction(
            "quarantine_file",
            "Quarantine File",
            "Move file to quarantine location on the host",
            "eradication",
            "file",
            List.of(
                new ActionParameter("path", "string", true, "Full file path to quarantine", null),
                new ActionParameter("collectSample", "boolean", false, "Upload sample for analysis", "true")
            ),
            "medium",
            "ROLE_SOC_ANALYST"
        ));

        ACTIONS.put("revoke_sessions", new ResponseAction(
            "revoke_sessions",
            "Revoke All Sessions",
            "Terminate all active sessions for a user",
            "eradication",
            "user",
            List.of(),
            "medium",
            "ROLE_SOC_ANALYST"
        ));

        ACTIONS.put("collect_forensics", new ResponseAction(
            "collect_forensics",
            "Collect Forensic Artifacts",
            "Collect memory dump, event logs, and registry hives from host",
            "investigation",
            "host",
            List.of(
                new ActionParameter("artifacts", "multi_enum", true, "Artifacts to collect: memory, eventlogs, registry, prefetch", "eventlogs,registry")
            ),
            "low",
            "ROLE_SOC_ANALYST"
        ));

        ACTIONS.put("run_scan", new ResponseAction(
            "run_scan",
            "Run Antivirus Scan",
            "Trigger a full antivirus scan on the target host",
            "investigation",
            "host",
            List.of(
                new ActionParameter("scanType", "enum", false, "Scan type: quick, full", "quick")
            ),
            "low",
            "ROLE_SOC_ANALYST"
        ));
    }

    /**
     * Simulated integration health status per action.
     * 6 healthy, 1 degraded (quarantine_file), 1 unavailable (run_scan).
     */
    private static final Map<String, String> INTEGRATION_STATUS = Map.of(
        "isolate_host", "healthy",
        "kill_process", "healthy",
        "block_ip", "healthy",
        "disable_account", "healthy",
        "quarantine_file", "degraded",
        "revoke_sessions", "healthy",
        "collect_forensics", "healthy",
        "run_scan", "unavailable"
    );

    /**
     * Returns all registered response actions.
     */
    public List<ResponseAction> getAllActions() {
        return new ArrayList<>(ACTIONS.values());
    }

    /**
     * Returns the action definition for the given actionId, or empty if not found.
     */
    public Optional<ResponseAction> getAction(String actionId) {
        return Optional.ofNullable(ACTIONS.get(actionId));
    }

    /**
     * Returns the simulated integration status for the given action.
     * Returns "unavailable" if the actionId is not recognized.
     */
    public String getIntegrationStatus(String actionId) {
        return INTEGRATION_STATUS.getOrDefault(actionId, "unavailable");
    }
}
