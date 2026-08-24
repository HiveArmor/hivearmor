package com.hivearmor.service.llm;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for deterministic→LLM cascade heuristics (P1 LLMOps).
 */
class LlmCascadeGateTest {

    private final LlmCascadeGate gate = new LlmCascadeGate();

    @Test
    void emptyUserMessagesSkipLlm() {
        LlmCascadeDecision d = gate.evaluateChat(List.of());
        assertThat(d.skipLlm()).isTrue();
        assertThat(d.reason()).isEqualTo(LlmCascadeDecision.REASON_EMPTY_USER_MESSAGE);
        assertThat(d.deterministicReply()).isNotBlank();
    }

    @Test
    void blankUserMessagesSkipLlm() {
        LlmCascadeDecision d = gate.evaluateChat(List.of("  ", ""));
        assertThat(d.skipLlm()).isTrue();
        assertThat(d.reason()).isEqualTo(LlmCascadeDecision.REASON_EMPTY_USER_MESSAGE);
    }

    @Test
    void nonBlankUserMessageCallsLlm() {
        LlmCascadeDecision d = gate.evaluateChat(List.of("What is this alert?"));
        assertThat(d.skipLlm()).isFalse();
        assertThat(d.reason()).isEqualTo(LlmCascadeDecision.REASON_CALL_LLM);
    }

    @Test
    void missingAlertContextSkipsLlm() {
        assertThat(gate.evaluateAlertContext(null).skipLlm()).isTrue();
        assertThat(gate.evaluateAlertContext("").skipLlm()).isTrue();
        assertThat(gate.evaluateAlertContext("{}").skipLlm()).isTrue();
        assertThat(gate.evaluateAlertContext("null").reason())
            .isEqualTo(LlmCascadeDecision.REASON_MISSING_ALERT_CONTEXT);
    }

    @Test
    void presentAlertContextCallsLlm() {
        LlmCascadeDecision d = gate.evaluateAlertContext("{\"id\":\"a1\",\"name\":\"Suspicious login\"}");
        assertThat(d.skipLlm()).isFalse();
    }

    @Test
    void emptyNlQuerySkipsLlm() {
        LlmCascadeDecision d = gate.evaluateNlQuery("  ");
        assertThat(d.skipLlm()).isTrue();
        assertThat(d.reason()).isEqualTo(LlmCascadeDecision.REASON_EMPTY_NL_QUERY);
    }

    @Test
    void nonEmptyNlQueryCallsLlm() {
        assertThat(gate.evaluateNlQuery("failed logins last hour").skipLlm()).isFalse();
    }
}
