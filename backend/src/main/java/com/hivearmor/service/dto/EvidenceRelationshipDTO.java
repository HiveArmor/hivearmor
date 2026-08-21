package com.hivearmor.service.dto;

import java.time.Instant;

/**
 * DTO for a directed relationship (edge) between two evidence items.
 * relationshipType: RELATED | CAUSED_BY | LEADS_TO | CONTRADICTS
 * S-4A
 */
public record EvidenceRelationshipDTO(
        Long id,
        Long incidentId,
        Long sourceItemId,
        Long targetItemId,
        String relationshipType,
        String label,
        String createdBy,
        Instant createdAt
) {}
