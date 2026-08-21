package com.hivearmor.service.dto.agent_manager;

import java.time.Instant;

public record EnrollmentAuditEventDTO(
    String id,
    long tenantId,
    String eventType,
    String actor,
    String reason,
    String tokenId,
    long agentId,
    String agentUuid,
    String policyId,
    String platform,
    long credentialVersion,
    long enrollmentVersion,
    Instant occurredAt
) { }
