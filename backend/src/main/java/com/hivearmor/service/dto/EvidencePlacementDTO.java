package com.hivearmor.service.dto;

/**
 * DTO for the position and size of a single evidence item on a board.
 * schemaVersion is used for optimistic conflict detection:
 * if the version stored in the DB is greater than the submitted version,
 * EvidenceService throws a 409 CONFLICT response.
 * S-4A
 */
public record EvidencePlacementDTO(
        Long id,
        Long boardId,
        Long evidenceItemId,
        Integer posX,
        Integer posY,
        Integer width,
        Integer height,
        Integer schemaVersion
) {}
