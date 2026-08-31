package com.hivearmor.compliance.dto;

import com.hivearmor.compliance.entity.HaComplianceException;

import java.time.Instant;
import java.time.LocalDate;

/**
 * DTO returned by GET /api/ha-compliance/exceptions — mirrors frontend
 * {@code ComplianceControlExceptionDTO}.
 */
public record ComplianceControlExceptionDTO(
        Long id,
        Long controlId,
        String title,
        String reason,
        String status,
        LocalDate effectiveFrom,
        LocalDate effectiveUntil,
        String approver,
        Instant createdAt,
        Instant updatedAt
) {

    public static ComplianceControlExceptionDTO from(HaComplianceException entity) {
        return new ComplianceControlExceptionDTO(
                entity.getId(),
                entity.getControlId(),
                entity.getTitle(),
                entity.getReason(),
                entity.getStatus(),
                entity.getEffectiveFrom(),
                entity.getEffectiveUntil(),
                entity.getApprover(),
                entity.getCreatedAt(),
                entity.getUpdatedAt()
        );
    }
}
