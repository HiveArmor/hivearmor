package com.hivearmor.service.llm;

import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Cheap deterministic heuristics that may short-circuit an LLM call (P1 LLMOps — STAGING CANDIDATE).
 *
 * <p>Does not change PII whitelisting. Only skips when context is clearly insufficient
 * (empty message, missing/blank alert JSON, empty NL query).
 */
@Component
public class LlmCascadeGate {

    private static final String REPLY_EMPTY_MESSAGE =
        "Please provide a question or select an alert/incident for context before asking the AI assistant.";

    private static final String REPLY_MISSING_ALERT =
        "Insufficient alert context to triage. The alert payload is empty or missing — "
            + "reload the alert and try again, or investigate manually.";

    /**
     * Chat stream: skip when there is no usable user content.
     *
     * @param userContents ordered user-message contents (may be null/empty)
     */
    public LlmCascadeDecision evaluateChat(List<String> userContents) {
        if (userContents == null || userContents.isEmpty()) {
            return LlmCascadeDecision.skip(
                LlmCascadeDecision.REASON_EMPTY_USER_MESSAGE, REPLY_EMPTY_MESSAGE);
        }
        boolean anyNonBlank = false;
        for (String c : userContents) {
            if (c != null && !c.isBlank()) {
                anyNonBlank = true;
                break;
            }
        }
        if (!anyNonBlank) {
            return LlmCascadeDecision.skip(
                LlmCascadeDecision.REASON_EMPTY_USER_MESSAGE, REPLY_EMPTY_MESSAGE);
        }
        return LlmCascadeDecision.callLlm();
    }

    /**
     * Alert triage: skip when alert JSON is null, blank, or a trivial empty object.
     */
    public LlmCascadeDecision evaluateAlertContext(String alertJson) {
        if (alertJson == null || alertJson.isBlank()) {
            return LlmCascadeDecision.skip(
                LlmCascadeDecision.REASON_MISSING_ALERT_CONTEXT, REPLY_MISSING_ALERT);
        }
        String trimmed = alertJson.trim();
        if ("{}".equals(trimmed) || "[]".equals(trimmed) || "null".equalsIgnoreCase(trimmed)) {
            return LlmCascadeDecision.skip(
                LlmCascadeDecision.REASON_MISSING_ALERT_CONTEXT, REPLY_MISSING_ALERT);
        }
        return LlmCascadeDecision.callLlm();
    }

    /**
     * NL→DSL search: skip when sanitized query is empty (already a safe fallback path).
     */
    public LlmCascadeDecision evaluateNlQuery(String sanitizedQuery) {
        if (sanitizedQuery == null || sanitizedQuery.isBlank()) {
            return LlmCascadeDecision.skip(LlmCascadeDecision.REASON_EMPTY_NL_QUERY, "");
        }
        return LlmCascadeDecision.callLlm();
    }
}
