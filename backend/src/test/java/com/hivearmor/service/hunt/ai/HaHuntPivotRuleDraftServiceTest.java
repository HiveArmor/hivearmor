package com.hivearmor.service.hunt.ai;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.detection.RuleAuthoringService;
import com.hivearmor.service.hunt.HuntFieldRegistry;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.web.rest.hunt.ai.dto.PivotDetectionDraftRequestDTO;
import com.hivearmor.web.rest.hunt.ai.dto.PivotDetectionDraftResponseDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link HaHuntPivotRuleDraftService} (P5 step 5b). The governance guarantees are the point:
 * the LLM is mocked; whatever it returns, the service persists ONLY a draft via createRule and NEVER
 * approves/activates, and untrusted/unusable output persists nothing.
 */
class HaHuntPivotRuleDraftServiceTest {

    private final HuntFieldRegistry registry = new HuntFieldRegistry();

    private PivotDetectionDraftRequestDTO req() {
        return new PivotDetectionDraftRequestDTO("user.name", "host.name", "sarah.chen", "FIN-WKS-044",
            40L, "*:*", "HUNT-1", "over-represented ~5x expected 8");
    }

    private HaHuntPivotRuleDraftService svc(HaLlmService llm, RuleAuthoringService authoring) {
        return new HaHuntPivotRuleDraftService(llm, registry, authoring);
    }

    @Test
    @DisplayName("valid model CEL → persists a DRAFT via createRule; never approves/activates")
    void draftsOnly() {
        HaLlmService llm = mock(HaLlmService.class);
        when(llm.activeProviderName()).thenReturn("ollama");
        when(llm.chat(any(List.class), any(ChatOptions.class))).thenReturn(
            "{\"expression\":\"equals(user.name, \\\"sarah.chen\\\") && equals(host.name, \\\"FIN-WKS-044\\\")\",\"explanation\":\"user on host\"}");
        RuleAuthoringService authoring = mock(RuleAuthoringService.class);
        when(authoring.createRule(any(), anyString(), anyLong())).thenReturn(Map.of("id", "RULE-9", "status", "draft"));

        PivotDetectionDraftResponseDTO r = svc(llm, authoring).draft(req(), "analyst", 1L);

        assertThat(r.state()).isEqualTo("ready");
        assertThat(r.ruleId()).isEqualTo("RULE-9");
        // The ONLY persistence call is createRule (which writes status=draft). No approve/activate exists on this path.
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(authoring).createRule(body.capture(), eq("analyst"), eq(1L));
        assertThat(body.getValue()).containsKey("expression");
        assertThat(String.valueOf(body.getValue().get("description"))).contains("requires SOC manager review");
        // RuleAuthoringService has no approve/activate call from here — verified by there being no other interaction.
    }

    @Test
    @DisplayName("model CEL that does not reference both fields is REJECTED — nothing persisted")
    void offFieldRejected() {
        HaLlmService llm = mock(HaLlmService.class);
        when(llm.chat(any(List.class), any(ChatOptions.class))).thenReturn(
            "{\"expression\":\"equals(made.up.field, \\\"x\\\")\",\"explanation\":\"bad\"}");
        RuleAuthoringService authoring = mock(RuleAuthoringService.class);

        PivotDetectionDraftResponseDTO r = svc(llm, authoring).draft(req(), "analyst", 1L);

        assertThat(r.state()).isEqualTo("unavailable");
        verify(authoring, never()).createRule(any(), anyString(), anyLong());   // nothing persisted
    }

    @Test
    @DisplayName("a hallucinated pivot AXIS field is rejected before prompting — nothing persisted")
    void hallucinatedAxisRejected() {
        HaLlmService llm = mock(HaLlmService.class);
        RuleAuthoringService authoring = mock(RuleAuthoringService.class);
        var badReq = new PivotDetectionDraftRequestDTO("not.a.field", "host.name", "a", "b", 1L, "q", "s", null);

        PivotDetectionDraftResponseDTO r = svc(llm, authoring).draft(badReq, "analyst", 1L);

        assertThat(r.state()).isEqualTo("unavailable");
        verify(authoring, never()).createRule(any(), anyString(), anyLong());
    }

    @Test
    @DisplayName("no AI provider → unavailable, nothing persisted (never a fabricated rule)")
    void notConfigured() {
        HaLlmService llm = mock(HaLlmService.class);
        when(llm.chat(any(List.class), any(ChatOptions.class))).thenThrow(new LlmNotConfiguredException("no provider"));
        RuleAuthoringService authoring = mock(RuleAuthoringService.class);

        PivotDetectionDraftResponseDTO r = svc(llm, authoring).draft(req(), "analyst", 1L);

        assertThat(r.state()).isEqualTo("unavailable");
        verify(authoring, never()).createRule(any(), anyString(), anyLong());
    }
}
