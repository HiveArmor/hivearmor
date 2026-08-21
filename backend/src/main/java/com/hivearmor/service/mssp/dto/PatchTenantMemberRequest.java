package com.hivearmor.service.mssp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Request body for {@code PATCH /api/ha-mssp/tenants/{id}/users/{userId}}.
 *
 * <p>Only {@code tenantRole} is updatable; the regex enforces the three
 * recognised MSSP tenant roles before the service layer is invoked.
 *
 * <p>Sprint 23 — tenant user management (S23-T05).
 */
public record PatchTenantMemberRequest(
    @NotBlank @Pattern(regexp = "^(TENANT_ADMIN|TENANT_ANALYST|TENANT_VIEWER)$") String tenantRole
) {}
