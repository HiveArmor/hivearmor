package com.hivearmor.web.rest.dto;

import java.time.Instant;
import java.util.List;

/**
 * DTO representing a persisted AI chat history entry retrieved from the database.
 *
 * @param id          Unique row identifier.
 * @param userLogin   Login of the user who owns this history row.
 * @param contextType The context surface (alert, incident, general, triage, etc.).
 * @param contextId   Optional identifier of the specific record the conversation is about.
 * @param messages    The full ordered list of messages in this conversation.
 * @param createdAt   Timestamp when the history row was first persisted.
 * @param updatedAt   Timestamp when the history row was last modified.
 */
public record AiChatHistoryDTO(
    Long id,
    String userLogin,
    String contextType,
    String contextId,
    List<ChatMessageDTO> messages,
    Instant createdAt,
    Instant updatedAt
) {}
