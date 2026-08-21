package com.hivearmor.service.dto.agent_manager;

public record EnrollmentTokenCreatedDTO(EnrollmentTokenDTO enrollment, String token) {
    /** Prevent the one-time secret from being emitted by development AOP logs. */
    @Override
    public String toString() {
        return "EnrollmentTokenCreatedDTO[enrollment=" + enrollment + ", token=[REDACTED]]";
    }
}
