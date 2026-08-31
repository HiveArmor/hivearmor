package com.hivearmor.compliance.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * CMP-013 — request body for POST /api/ha-compliance/exceptions.
 */
public record CreateComplianceExceptionRequest(
    @NotNull Long controlId,
    @NotBlank @Size(max = 500) String title,
    @Size(max = 4000) String reason,
    LocalDate effectiveFrom,
    LocalDate effectiveUntil
) {}
