package com.hivearmor.service.mssp.dto;

import java.time.Instant;

public record TenantHealthDTO(
    Long id,
    String name,
    String clientPrefix,
    int userCount,
    long eps,
    String healthStatus,
    Instant lastEventAt
) {}
