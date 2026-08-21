package com.hivearmor.service.llm;

/**
 * Options controlling the LLM generation behaviour for a single chat request.
 *
 * <p>All fields are nullable — providers fall back to their own defaults when a
 * field is {@code null}.
 *
 * <ul>
 *   <li>{@code model} — the model identifier to use (e.g. {@code "llama3.2:3b"},
 *       {@code "gpt-4o"}). When {@code null} the provider uses its configured
 *       default model.</li>
 *   <li>{@code temperature} — sampling temperature in the range {@code [0.0, 2.0]}.
 *       Lower values produce more deterministic output.</li>
 *   <li>{@code maxTokens} — the maximum number of tokens to generate in the
 *       response. Must be a positive integer when set.</li>
 * </ul>
 *
 * <p>Requirements: 1.2
 */
public record ChatOptions(String model, Double temperature, Integer maxTokens) {}
