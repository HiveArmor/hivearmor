package com.hivearmor.service.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * DTO for an investigation session.
 * itemCount is populated by the service (count of pinned items).
 * S-5C
 */
@Schema(description = "Investigation session representing an analyst's organized investigation workspace")
public record InvestigationSessionDTO(
        @Schema(description = "Unique session identifier", example = "42")
        Long id,

        @Schema(description = "Optimistic record version used to prevent lost updates", example = "3")
        Long version,

        @Schema(description = "Authorized tenant identifier. Null only for legacy global sessions", example = "18")
        Long tenantId,

        @Schema(description = "Human-readable session name", example = "APT-29 Investigation", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank @Size(max = 200)
        String sessionName,

        @Schema(description = "Free-text description of the investigation scope and context", example = "Investigating suspected APT-29 lateral movement in finance subnet")
        @Size(max = 2000)
        String description,

        @Schema(description = "Session lifecycle status: ACTIVE, CLOSED, or ARCHIVED", example = "ACTIVE", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank @Pattern(regexp = "ACTIVE|CLOSED|ARCHIVED|CONVERTED")
        String status,

        @Schema(description = "Username of the analyst who created this session", example = "analyst1")
        String createdBy,

        @Schema(description = "Username of the analyst currently assigned to this session", example = "senior-analyst")
        String assignedTo,

        @Schema(description = "Linked incident ID if this session is tied to an incident", example = "101")
        Long incidentId,

        @Schema(description = "Timestamp when the session was created", example = "2026-08-20T09:15:00Z")
        Instant createdAt,

        @Schema(description = "Timestamp of the last update to this session", example = "2026-08-20T14:30:00Z")
        Instant updatedAt,

        @Schema(description = "Total count of evidence items pinned to this session", example = "7")
        Integer itemCount
) {
    /** Backward-compatible constructor for internal callers during contract migration. */
    public InvestigationSessionDTO(Long id, String sessionName, String description, String status,
                                   String createdBy, String assignedTo, Long incidentId,
                                   Instant createdAt, Instant updatedAt, Integer itemCount) {
        this(id, null, null, sessionName, description, status, createdBy, assignedTo,
            incidentId, createdAt, updatedAt, itemCount);
    }
}
