package com.hivearmor.compliance.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * CMP-013 — request body for POST /api/ha-compliance/poam.
 */
public record CreatePoamItemRequest(
    @NotBlank @Size(max = 100) String frameworkId,
    @NotNull Long controlId,
    @NotBlank @Size(max = 500) String title,
    @Size(max = 4000) String description,
    LocalDate dueDate,
    @Size(max = 200) String assignee,
    @Size(max = 30) String status
) {}
