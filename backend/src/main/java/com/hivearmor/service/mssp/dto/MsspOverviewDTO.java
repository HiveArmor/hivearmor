package com.hivearmor.service.mssp.dto;

import java.util.List;

public record MsspOverviewDTO(
    int tenantCount,
    long activeUserCount,
    long totalEps,
    int alertsToday,
    List<TenantHealthDTO> tenants
) {}
