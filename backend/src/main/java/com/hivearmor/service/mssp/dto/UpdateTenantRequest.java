package com.hivearmor.service.mssp.dto;

import jakarta.validation.constraints.*;

/**
 * Request body for {@code PUT /api/ha-mssp/tenants/{id}}.
 *
 * <p>Declares only the four mutable fields for a tenant. There is intentionally
 * <strong>no {@code clientPrefix} field</strong> — the prefix is immutable once
 * provisioned. Jackson's {@code FAIL_ON_UNKNOWN_PROPERTIES = false} (JHipster default)
 * silently drops any {@code clientPrefix} key present in the request body, so the
 * underlying {@code ha_client.client_prefix} column is never mutated by a PUT.
 *
 * <p>Sprint 23 — S23-T04.
 */
public record UpdateTenantRequest(
    @NotBlank @Size(max = 100) String name,
    @Positive int maxUsers,
    @NotBlank String licenceType,
    @Email String contactEmail
) {}
