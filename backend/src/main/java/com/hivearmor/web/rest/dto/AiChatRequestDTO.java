package com.hivearmor.web.rest.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.util.List;

/**
 * DTO for an AI chat request carrying a conversation history and context metadata.
 *
 * @param messages    The conversation messages — must not be empty; each entry is validated.
 * @param contextType The context surface — must be one of: alert, incident, general.
 * @param contextId   Optional identifier for the specific alert or incident being discussed.
 */
public record AiChatRequestDTO(
    @NotEmpty
    @Valid
    List<ChatMessageDTO> messages,

    @NotNull
    @Pattern(regexp = "alert|incident|general")
    String contextType,

    String contextId
) {}
