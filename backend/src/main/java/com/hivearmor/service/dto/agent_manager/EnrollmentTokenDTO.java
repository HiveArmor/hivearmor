package com.hivearmor.service.dto.agent_manager;

import java.time.Instant;

public record EnrollmentTokenDTO(
    String id,
    long tenantId,
    String policyId,
    String platform,
    Instant expiresAt,
    int maxUses,
    int useCount,
    Instant createdAt,
    String createdBy,
    Instant lastUsedAt,
    Instant revokedAt,
    String revokedBy,
    String revocationReason,
    long version,
    String status
) { }
