package com.hivearmor.service.dto;

import java.time.Instant;
import java.util.List;

/**
 * DTO for a single composite queue item (alert, incident, offense, or task).
 * The id is a string of format "itemType::sourceRef" to avoid collisions across types.
 * S-3B-QUEUE
 */
public record QueueItemDTO(
        Long id,
        String itemType,
        String title,
        String severity,
        Double priorityScore,
        String status,
        String assignedTo,
        String sourceRef,
        String dataSource,
        Instant createdAt,
        Instant slaDeadline,
        Boolean slaBreached,
        List<String> tags,
        Long incidentId
) {}
