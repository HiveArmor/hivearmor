package com.hivearmor.service.dto.agent_manager;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record EnrollmentTokenCreateDTO(
    @NotBlank @Size(max = 128) String policyId,
    @NotBlank @Pattern(regexp = "(?i)any|windows|linux|darwin|macos") String platform,
    @NotNull @Future Instant expiresAt,
    @Min(1) @Max(1000) int maxUses
) { }
