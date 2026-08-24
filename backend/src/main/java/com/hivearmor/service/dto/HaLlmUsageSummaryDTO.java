package com.hivearmor.service.dto;

/**
 * Aggregate count of durable LLM usage rows for one cascade decision.
 *
 * <p>Counts only — no token totals or prompt identity (STAGING CANDIDATE).
 */
public record HaLlmUsageSummaryDTO(
    String cascadeDecision,
    long count
) {}
