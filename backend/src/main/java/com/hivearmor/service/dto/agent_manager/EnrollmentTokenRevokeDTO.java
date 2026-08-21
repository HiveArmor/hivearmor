package com.hivearmor.service.dto.agent_manager;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

public record EnrollmentTokenRevokeDTO(@NotBlank String reason, @PositiveOrZero long expectedVersion) { }
