package com.hivearmor.service.dto;

import java.util.List;

/**
 * DTO for an investigation evidence board, including all its current placements.
 * S-4A
 */
public record EvidenceBoardDTO(
        Long id,
        Long incidentId,
        String name,
        List<EvidencePlacementDTO> placements
) {}
