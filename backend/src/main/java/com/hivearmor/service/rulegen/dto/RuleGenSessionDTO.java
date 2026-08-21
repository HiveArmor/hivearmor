package com.hivearmor.service.rulegen.dto;

import com.hivearmor.domain.rulegen.HaRuleGenSession;

import java.time.Instant;

/**
 * Immutable DTO for {@link HaRuleGenSession} used as the REST response payload
 * for rule generation session endpoints.
 *
 * <p>The {@code status} field is serialized as the enum name string
 * ({@code "pending_review"}, {@code "approved"}, {@code "rejected"}) so the
 * frontend can compare on equality without translation.
 */
public record RuleGenSessionDTO(
    Long id,
    String status,
    String ruleName,
    String ruleYaml,
    String signalKey,
    String requestedBy,
    String approvedPath,
    Instant createdAt,
    Instant updatedAt
) {

    /**
     * Factory method that maps a {@link HaRuleGenSession} entity to this DTO.
     *
     * @param s the persisted session entity
     * @return a new DTO with all fields copied from the entity
     */
    public static RuleGenSessionDTO from(HaRuleGenSession s) {
        return new RuleGenSessionDTO(
            s.getId(),
            s.getStatus().name(),
            s.getRuleName(),
            s.getRuleYaml(),
            s.getSignalKey(),
            s.getRequestedBy(),
            s.getApprovedPath(),
            s.getCreatedAt(),
            s.getUpdatedAt()
        );
    }
}
