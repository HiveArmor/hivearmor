package com.hivearmor.service.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * DTO for a case task on an investigation session.
 * STAGING CANDIDATE — P1 session case tasks.
 */
@Schema(description = "A lightweight case task attached to an investigation session")
public record SessionTaskDTO(
        @Schema(description = "Unique task identifier", example = "7")
        Long id,

        @Schema(description = "Parent investigation session ID", example = "42", requiredMode = Schema.RequiredMode.REQUIRED)
        Long sessionId,

        @Schema(description = "Short task title", example = "Collect process tree from endpoint", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank @Size(max = 500)
        String title,

        @Schema(description = "Task status: OPEN, DONE, or CANCELLED", example = "OPEN", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank @Pattern(regexp = "OPEN|DONE|CANCELLED")
        String status,

        @Schema(description = "Optional assignee login", example = "analyst1")
        @Size(max = 255)
        String assignee,

        @Schema(description = "Optional external ticket URL (https preferred)", example = "https://jira.example.com/browse/SEC-123")
        @Size(max = 2048)
        @Pattern(regexp = "^$|^https?://.+", message = "externalTicketUrl must be an http(s) URL when provided")
        String externalTicketUrl,

        @Schema(description = "Username who created the task", example = "analyst1")
        String createdBy,

        @Schema(description = "Creation timestamp", example = "2026-08-24T10:00:00Z")
        Instant createdAt,

        @Schema(description = "Last update timestamp", example = "2026-08-24T11:00:00Z")
        Instant updatedAt
) {}
