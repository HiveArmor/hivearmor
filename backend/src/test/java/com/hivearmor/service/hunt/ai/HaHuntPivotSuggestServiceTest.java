package com.hivearmor.service.hunt.ai;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.hunt.HuntFieldRegistry;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.web.rest.hunt.ai.dto.PivotSuggestResponseDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link HaHuntPivotSuggestService} — the Ask Hive validation backstop (P3 PR 3).
 * The LLM is mocked; the point is that whatever the model returns, only schema-eligible fields survive.
 */
class HaHuntPivotSuggestServiceTest {

    private final HuntFieldRegistry registry = new HuntFieldRegistry();

    private HaHuntPivotSuggestService withModel(String reply) {
        HaLlmService llm = mock(HaLlmService.class);
        when(llm.activeProviderName()).thenReturn("ollama");
        when(llm.chat(any(List.class), any(ChatOptions.class))).thenReturn(reply);
        return new HaHuntPivotSuggestService(llm, registry);
    }

    @Test
    @DisplayName("a valid model suggestion is returned ready with both axes")
    void validSuggestion() {
        var svc = withModel("{\"rowField\":\"user.name\",\"colField\":\"host.name\",\"valueFn\":\"count\",\"explanation\":\"users by host\"}");
        PivotSuggestResponseDTO r = svc.suggest("which users touched which hosts?");
        assertThat(r.state()).isEqualTo("ready");
        assertThat(r.rowField()).isEqualTo("user.name");
        assertThat(r.colField()).isEqualTo("host.name");
        assertThat(r.valueFn()).isEqualTo("count");
        assertThat(r.warnings()).isEmpty();
    }

    @Test
    @DisplayName("a hallucinated field is DROPPED (not applied broken) with a warning")
    void hallucinatedFieldDropped() {
        var svc = withModel("{\"rowField\":\"made.up.field\",\"colField\":\"host.name\",\"valueFn\":\"count\"}");
        PivotSuggestResponseDTO r = svc.suggest("x");
        assertThat(r.state()).isEqualTo("ready");
        assertThat(r.rowField()).isNull();            // dropped
        assertThat(r.colField()).isEqualTo("host.name");
        assertThat(String.join(" ", r.warnings())).contains("made.up.field");
    }

    @Test
    @DisplayName("a distinct measure with an invalid distinct field falls back to count")
    void distinctFallback() {
        var svc = withModel("{\"rowField\":\"host.name\",\"colField\":\"event.action\",\"valueFn\":\"distinct\",\"distinctField\":\"nope\"}");
        PivotSuggestResponseDTO r = svc.suggest("x");
        assertThat(r.valueFn()).isEqualTo("count");
        assertThat(r.distinctField()).isNull();
        assertThat(String.join(" ", r.warnings())).containsIgnoringCase("count");
    }

    @Test
    @DisplayName("non-JSON model output degrades to unavailable, not a crash")
    void nonJsonUnavailable() {
        var svc = withModel("Sure! Here is a great pivot for you but not JSON at all.");
        assertThat(svc.suggest("x").state()).isEqualTo("unavailable");
    }

    @Test
    @DisplayName("an unconfigured LLM yields unavailable (never a 5xx, never a fabricated pivot)")
    void notConfiguredUnavailable() {
        HaLlmService llm = mock(HaLlmService.class);
        when(llm.chat(any(List.class), any(ChatOptions.class))).thenThrow(new LlmNotConfiguredException("no provider"));
        var svc = new HaHuntPivotSuggestService(llm, registry);
        PivotSuggestResponseDTO r = svc.suggest("x");
        assertThat(r.state()).isEqualTo("unavailable");
        assertThat(r.rowField()).isNull();
    }
}
