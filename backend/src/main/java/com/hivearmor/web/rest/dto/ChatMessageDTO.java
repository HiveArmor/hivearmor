package com.hivearmor.web.rest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * DTO representing a single message in an AI chat conversation.
 *
 * @param role    The speaker role — must be one of: user, assistant, system.
 * @param content The message text — must not be blank.
 */
public record ChatMessageDTO(
    @NotBlank
    @Pattern(regexp = "user|assistant|system")
    String role,

    @NotBlank
    String content
) {}
