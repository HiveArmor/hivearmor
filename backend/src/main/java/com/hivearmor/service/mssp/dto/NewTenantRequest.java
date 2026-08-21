package com.hivearmor.service.mssp.dto;

import jakarta.validation.constraints.*;

public record NewTenantRequest(
    @NotBlank @Size(max = 100) String name,
    @NotBlank @Pattern(regexp = "^[a-z0-9-]{2,20}$") String clientPrefix,
    @NotBlank @Email String adminEmail,
    @NotBlank @Size(min = 1, max = 50) String adminLogin,
    @Positive int maxUsers,
    @NotBlank String licenceType
) {}
