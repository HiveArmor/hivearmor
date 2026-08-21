package com.hivearmor.service.mssp.dto;

import java.time.Instant;

public record NewTenantResponse(
    Long id,
    String name,
    String clientPrefix,
    String adminLogin,
    Instant createdAt
) {}
