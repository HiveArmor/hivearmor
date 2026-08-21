package com.hivearmor.service.dto.agent_manager;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AgentCredentialChangeDTO(
    @NotBlank @Size(max = 512) String reason
) { }
