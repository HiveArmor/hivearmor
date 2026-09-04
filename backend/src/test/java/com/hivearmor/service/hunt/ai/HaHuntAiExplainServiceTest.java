package com.hivearmor.service.hunt.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.web.rest.hunt.ai.dto.ExplainClauseResponseDTO;

/**
 * Unit tests for {@link HaHuntAiExplainService} — the first Hunt AI backend increment.
 *
 * <p>Validates the frozen contract's graceful-degradation rule: the service NEVER throws for
 * provider state; an unconfigured or failing LLM yields {@code state = "unavailable"} (which the
 * controller returns as HTTP 200), and a successful call yields {@code state = "ready"} with
 * AI provenance attached.
 */
@DisplayName("HaHuntAiExplainService — clause explanation with graceful degradation")
class HaHuntAiExplainServiceTest {

    private HaLlmService llm;
    private HaHuntAiExplainService service;

    @BeforeEach
    void setUp() {
        llm = mock(HaLlmService.class);
        service = new HaHuntAiExplainService(llm);
    }

    @Test
    @DisplayName("ready: returns the LLM gloss with AI provenance + verify caveat")
    void readyPath() {
        when(llm.activeProviderName()).thenReturn("ollama:foundation-sec-8b");
        when(llm.chat(anyList(), any(ChatOptions.class))).thenReturn("  Matches failed authentication events.  ");

        ExplainClauseResponseDTO r = service.explain("event.outcome: \"failure\"", "kql");

        assertThat(r.schemaVersion()).isEqualTo("1");
        assertThat(r.state()).isEqualTo("ready");
        assertThat(r.explanation()).isEqualTo("Matches failed authentication events."); // trimmed
        assertThat(r.provenance()).isNotNull();
        assertThat(r.provenance().model()).isEqualTo("ollama:foundation-sec-8b");
        assertThat(r.provenance().caveat()).contains("verify before acting");
        assertThat(r.provenance().generatedAt()).isNotBlank();
    }

    @Test
    @DisplayName("unavailable: LLM not configured → state=unavailable, no explanation, no throw")
    void llmNotConfigured() {
        when(llm.chat(anyList(), any(ChatOptions.class))).thenThrow(new LlmNotConfiguredException("no provider"));

        ExplainClauseResponseDTO r = service.explain("user: admin", "kql");

        assertThat(r.state()).isEqualTo("unavailable");
        assertThat(r.explanation()).isNull();
        assertThat(r.provenance()).isNull();
        assertThat(r.clause()).isEqualTo("user: admin");
    }

    @Test
    @DisplayName("unavailable: provider runtime failure degrades honestly (never 5xx)")
    void providerFailure() {
        when(llm.chat(anyList(), any(ChatOptions.class))).thenThrow(new RuntimeException("timeout"));

        ExplainClauseResponseDTO r = service.explain("source.ip: 10.0.0.1", "kql");

        assertThat(r.state()).isEqualTo("unavailable");
        assertThat(r.explanation()).isNull();
    }

    @Test
    @DisplayName("unavailable: blank LLM response is treated as unavailable, not a fake gloss")
    void blankResponse() {
        when(llm.chat(anyList(), any(ChatOptions.class))).thenReturn("   ");

        ExplainClauseResponseDTO r = service.explain("severity: critical", "kql");

        assertThat(r.state()).isEqualTo("unavailable");
        assertThat(r.explanation()).isNull();
    }
}
