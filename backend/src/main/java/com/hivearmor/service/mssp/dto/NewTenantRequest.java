package com.hivearmor.service.mssp.dto;

import jakarta.validation.constraints.*;

public record NewTenantRequest(
    @NotBlank @Size(max = 100) String name,
    // clientPrefix must be hyphen-FREE: the ES tenant-scope guard
    // (TenantScopeGuard#isPatternInScope) matches indexes by startsWith on
    // "v3-hive-<type>-<prefix>-", so a hyphen inside the prefix makes tenant
    // "cwm" collide with "cwm-x" (v3-hive-alert-cwm-x-* starts with the cwm
    // prefix). Restrict to [a-z0-9] so the trailing '-' is an unambiguous
    // tenant boundary.
    @NotBlank @Pattern(regexp = "^[a-z0-9]{2,20}$",
        message = "must be 2-20 lowercase letters or digits, no hyphens") String clientPrefix,
    @NotBlank @Email String adminEmail,
    @NotBlank @Size(min = 1, max = 50) String adminLogin,
    @Positive int maxUsers,
    @NotBlank String licenceType
) {}
