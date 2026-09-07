package com.hivearmor.service.detection.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * DET-FP-001 — request/response DTOs for persisted detection exceptions.
 */
public final class DetectionExceptionDtos {

    private DetectionExceptionDtos() {}

    public record ExceptionCondition(String field, String operator, String value) {}

    public record CreateExceptionRequest(
        String title,
        String reason,
        List<ExceptionCondition> conditions
    ) {}

    public record DetectionExceptionDTO(
        Long id,
        String ruleId,
        String title,
        String reason,
        List<Map<String, String>> conditions,
        boolean active,
        String status,
        String createdBy,
        String activatedBy,
        Instant activatedAt,
        Instant createdAt,
        Instant updatedAt,
        String honesty
    ) {}
}
