package com.hivearmor.service.hunt.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;

/**
 * Compact alert preview shown within a severity lane.
 *
 * <p>Contains the essential fields needed to render a single alert card
 * on the severity board without loading the full alert document.
 *
 * <p>Sprint 37 — ALT-023 (Requirement 1.4).
 */
@Schema(description = "Compact alert preview for rendering within a severity lane card")
public record AlertPreview(
    @Schema(description = "Unique alert identifier", example = "alert-2026-08-20-abc123", requiredMode = Schema.RequiredMode.REQUIRED)
    String id,

    @Schema(description = "Alert title from the detection rule", example = "Brute Force Login Attempt Detected")
    String title,

    @Schema(description = "Short summary of the alert context", example = "Multiple failed logins from 10.0.1.45 targeting admin account")
    String summary,

    @Schema(description = "Numeric severity level (1=info, 2=low, 3=medium, 4=high, 5=critical)", example = "4")
    int severity,

    @Schema(description = "Computed risk score (0.0–100.0) combining severity, confidence, and context", example = "78.5")
    double riskScore,

    @Schema(description = "Detection confidence percentage (0–100)", example = "85")
    int confidence,

    @Schema(description = "Timestamp when the alert was first detected", example = "2026-08-20T13:45:22Z")
    Instant detectedAt,

    @Schema(description = "Alert status code (2=new, 3=in-progress, 6=auto-resolved, 10=closed)", example = "2")
    int status,

    @Schema(description = "Human-readable status label", example = "New")
    String statusLabel,

    @Schema(description = "Alert category from MITRE ATT&CK or custom taxonomy", example = "Credential Access")
    String category,

    @Schema(description = "The primary entity associated with this alert")
    PrimaryEntity primaryEntity,

    @Schema(description = "Display name of the analyst assigned to this alert", example = "jsmith")
    String assigneeName,

    @Schema(description = "SLA compliance status: 'ok', 'warning', or 'breached'", example = "warning")
    String slaStatus,

    @Schema(description = "Whether this alert has matching threat intelligence indicators", example = "true")
    boolean threatIntelMatched,

    @Schema(description = "Number of related alerts sharing entities or patterns", example = "3")
    int relatedAlertCount,

    @Schema(description = "MITRE ATT&CK technique ID if mapped", example = "T1110.003")
    String mitreTechniqueId,

    @Schema(description = "Tenant display name for MSSP deployments", example = "Acme Corp")
    String tenantName,

    @Schema(description = "Tags applied to this alert", example = "[\"investigated\", \"ioc-match\"]")
    List<String> tags
) {

    /**
     * The primary entity associated with an alert (host, user, IP, etc.).
     */
    @Schema(description = "Primary entity associated with an alert")
    public record PrimaryEntity(
        @Schema(description = "Entity identifier", example = "ip:10.0.1.45")
        String id,

        @Schema(description = "Entity type: user, host, ip, process, file, domain", example = "ip")
        String type,

        @Schema(description = "Human-readable entity label", example = "10.0.1.45")
        String label
    ) {}
}
