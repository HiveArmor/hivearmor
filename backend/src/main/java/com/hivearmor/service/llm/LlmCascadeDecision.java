package com.hivearmor.service.llm;

/**
 * Result of a cheap deterministic→LLM cascade check (P1 LLMOps — STAGING CANDIDATE).
 *
 * <p>When {@link #skipLlm()} is {@code true}, callers MUST NOT invoke the LLM and SHOULD
 * return {@link #deterministicReply()} (or an equivalent fallback). The decision reason is
 * safe for logs/metrics — it must not contain PII or prompt bodies.
 *
 * @param skipLlm             {@code true} when a heuristic answered without an LLM call
 * @param reason              stable machine reason (e.g. {@code empty_user_message})
 * @param deterministicReply  human-readable reply when skipping; may be blank when not needed
 */
public record LlmCascadeDecision(boolean skipLlm, String reason, String deterministicReply) {

    public static final String REASON_EMPTY_USER_MESSAGE = "empty_user_message";
    public static final String REASON_MISSING_ALERT_CONTEXT = "missing_alert_context";
    public static final String REASON_EMPTY_NL_QUERY = "empty_nl_query";
    public static final String REASON_CALL_LLM = "call_llm";

    public static LlmCascadeDecision callLlm() {
        return new LlmCascadeDecision(false, REASON_CALL_LLM, "");
    }

    public static LlmCascadeDecision skip(String reason, String reply) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("cascade reason must be non-blank");
        }
        return new LlmCascadeDecision(true, reason, reply != null ? reply : "");
    }
}
