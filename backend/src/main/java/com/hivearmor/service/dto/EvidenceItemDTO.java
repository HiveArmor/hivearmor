package com.hivearmor.service.dto;

import java.time.Instant;

/**
 * DTO for an evidence item (card) on an investigation board.
 * item_type: ALERT | NOTE | EXTERNAL_URL | ARTIFACT
 * S-4A
 */
public record EvidenceItemDTO(
        Long id,
        Long incidentId,
        String itemType,
        String title,
        String content,
        String sourceRef,
        Integer severityHint,
        String createdBy,
        Instant createdAt,
        Instant updatedAt
) {}
