package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.repository.HaAiChatHistoryRepository;
import com.hivearmor.service.llm.LlmCascadeDecision;
import com.hivearmor.service.llm.LlmCascadeGate;
import com.hivearmor.service.llm.PromptRegistry;
import com.hivearmor.web.rest.dto.AiChatRequestDTO;
import com.hivearmor.web.rest.dto.ChatMessageDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Cascade wiring for HaAiChatService (P1 LLMOps — STAGING CANDIDATE).
 */
class HaAiChatCascadeTest {

    private HaLlmService llmService;
    private HaAiChatHistoryRepository historyRepository;
    private HaAlertContextService alertContextService;
    private HaIncidentContextService incidentContextService;
    private HaAiChatService service;

    @BeforeEach
    void setUp() {
        llmService = mock(HaLlmService.class);
        historyRepository = mock(HaAiChatHistoryRepository.class);
        alertContextService = mock(HaAlertContextService.class);
        incidentContextService = mock(HaIncidentContextService.class);
        service = new HaAiChatService(
            llmService,
            historyRepository,
            alertContextService,
            incidentContextService,
            new ObjectMapper().findAndRegisterModules(),
            new PromptRegistry(),
            new LlmCascadeGate());
    }

    @Test
    void streamChatSkipsLlmOnEmptyUserMessage() {
        AiChatRequestDTO request = new AiChatRequestDTO(
            List.of(new ChatMessageDTO("user", "   ")), "general", null);

        List<String> deltas = service.streamChat(request, "analyst").collectList().block();

        assertThat(deltas).isNotEmpty();
        assertThat(deltas.get(0)).contains("Please provide a question");
        verify(llmService).recordCascadeSkip(
            eq(LlmCascadeDecision.REASON_EMPTY_USER_MESSAGE),
            eq(PromptRegistry.ID_CHAT_BASE),
            anyString(),
            eq("analyst"));
        verify(llmService, never()).streamChat(org.mockito.ArgumentMatchers.anyList(), anyString());
    }

    @Test
    void generateTriageSkipsLlmOnEmptyAlertJson() {
        when(historyRepository.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            anyString(), anyString(), anyString())).thenReturn(List.of());
        when(alertContextService.loadAlertAsJson("a1")).thenReturn("{}");
        when(historyRepository.save(org.mockito.ArgumentMatchers.any()))
            .thenAnswer(inv -> inv.getArgument(0));

        String summary = service.generateTriage("a1", "analyst");

        assertThat(summary).contains("Insufficient alert context");
        verify(llmService).recordCascadeSkip(
            eq(LlmCascadeDecision.REASON_MISSING_ALERT_CONTEXT),
            eq(PromptRegistry.ID_CHAT_TRIAGE),
            anyString(),
            eq("analyst"));
        verify(llmService, never()).chat(org.mockito.ArgumentMatchers.anyList(), anyString());
    }

    @Test
    void generateTriageCallsLlmWhenAlertPresent() {
        when(historyRepository.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            anyString(), anyString(), anyString())).thenReturn(List.of());
        when(alertContextService.loadAlertAsJson("a1"))
            .thenReturn("{\"id\":\"a1\",\"name\":\"brute force\"}");
        when(llmService.chat(org.mockito.ArgumentMatchers.anyList(), anyString()))
            .thenReturn("triage summary");
        when(historyRepository.save(org.mockito.ArgumentMatchers.any()))
            .thenAnswer(inv -> inv.getArgument(0));

        String summary = service.generateTriage("a1", "analyst");

        assertThat(summary).isEqualTo("triage summary");
        verify(llmService).chat(org.mockito.ArgumentMatchers.anyList(), anyString());
        verify(llmService, never()).recordCascadeSkip(
            anyString(), anyString(), anyString(), anyString());
    }
}
