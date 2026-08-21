package com.hivearmor.service.llm;

/**
 * An immutable message in a chat conversation passed to a {@link HaLlmProvider}.
 *
 * <p>Roles follow the OpenAI convention:
 * <ul>
 *   <li>{@code system} — developer-injected system prompt</li>
 *   <li>{@code user} — analyst-authored message</li>
 *   <li>{@code assistant} — LLM response</li>
 * </ul>
 *
 * <p>Requirements: 1.2
 */
public record ChatMessage(String role, String content) {}
