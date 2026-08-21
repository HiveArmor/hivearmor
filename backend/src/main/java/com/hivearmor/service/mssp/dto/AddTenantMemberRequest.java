package com.hivearmor.service.mssp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * Request body for {@code POST /api/ha-mssp/tenants/{id}/users}.
 *
 * <p>{@code tenantRole} must be one of the three recognised MSSP tenant roles;
 * the regex is validated by Bean Validation before the service layer is invoked.
 *
 * <p>Sprint 23 — tenant user management (S23-T05).
 */
public record AddTenantMemberRequest(
    @NotNull Long userId,
    @NotBlank @Pattern(regexp = "^(TENANT_ADMIN|TENANT_ANALYST|TENANT_VIEWER)$") String tenantRole
) {}
