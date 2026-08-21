package com.hivearmor.service.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * DTO for an item pinned to an investigation session.
 * S-5C
 */
@Schema(description = "An evidence item pinned to an investigation session")
public record SessionItemDTO(
        @Schema(description = "Unique item identifier", example = "15")
        Long id,

        @Schema(description = "ID of the parent investigation session", example = "42", requiredMode = Schema.RequiredMode.REQUIRED)
        Long sessionId,

        @Schema(description = "Type of pinned item: LOG_EVENT, ALERT, ENTITY, FINDING, NOTE", example = "LOG_EVENT", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank @Pattern(regexp = "LOG_EVENT|ALERT|ENTITY|FINDING|NOTE")
        String itemType,

        @Schema(description = "Reference identifier for the pinned item (alert ID, entity ID, etc.)", example = "doc-abc123", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank @Size(max = 500)
        String itemRef,

        @Schema(description = "JSON snapshot of the item at time of pinning for offline reference")
        @Size(max = 65536)
        String itemSnapshot,

        @Schema(description = "Analyst note or annotation attached to this pinned item", example = "Suspicious outbound connection to known C2 domain")
        @Size(max = 2000)
        String note,

        @Schema(description = "Username of the analyst who pinned this item", example = "analyst1")
        String addedBy,

        @Schema(description = "Timestamp when this item was pinned to the session", example = "2026-08-20T10:22:00Z")
        Instant addedAt
) {}
