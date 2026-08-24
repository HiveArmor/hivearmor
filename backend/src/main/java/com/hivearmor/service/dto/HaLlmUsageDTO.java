package com.hivearmor.service.dto;

import java.time.Instant;

/**
 * Safe read projection for {@code ha_llm_usage} ledger rows.
 *
 * <p>Never includes prompt bodies, chat content, API keys, or other secrets —
 * only prompt identity hashes, token counts, cascade metadata, and actor login.
 *
 * <p>P1 LLMOps read API — STAGING CANDIDATE.
 */
public record HaLlmUsageDTO(
    Long id,
    String promptId,
    String promptHash,
    Long promptTokens,
    Long completionTokens,
    Long totalTokens,
    String cascadeDecision,
    String cascadeReason,
    String userLogin,
    Instant createdAt
) {}
