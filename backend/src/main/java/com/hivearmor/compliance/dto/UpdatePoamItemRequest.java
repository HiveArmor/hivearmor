package com.hivearmor.compliance.dto;

import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * CMP-013 — request body for PUT /api/ha-compliance/poam/{id}.
 */
public record UpdatePoamItemRequest(
    @Size(max = 500) String title,
    @Size(max = 30) String status,
    @Size(max = 200) String assignee,
    LocalDate dueDate
) {}
