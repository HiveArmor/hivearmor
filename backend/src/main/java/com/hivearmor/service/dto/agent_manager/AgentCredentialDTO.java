package com.hivearmor.service.dto.agent_manager;

import java.time.Instant;

public record AgentCredentialDTO(
    long agentId,
    String agentUuid,
    int credentialVersion,
    String key,
    Instant revokedAt
) {
    /** Prevent rotated credentials from being emitted by development AOP logs. */
    @Override
    public String toString() {
        return "AgentCredentialDTO[agentId=" + agentId + ", agentUuid=" + agentUuid
            + ", credentialVersion=" + credentialVersion + ", key=[REDACTED], revokedAt=" + revokedAt + "]";
    }
}
