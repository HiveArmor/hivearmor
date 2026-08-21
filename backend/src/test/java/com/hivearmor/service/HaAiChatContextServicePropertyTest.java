package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.repository.HaAiChatHistoryRepository;
import com.hivearmor.web.rest.dto.AiChatRequestDTO;
import com.hivearmor.web.rest.dto.ChatMessageDTO;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.junit.jupiter.api.BeforeEach;
import reactor.core.publisher.Flux;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Property 10: Context service invoked exactly once with error containment.
 *
 * <p><strong>Property 10: Context service invoked exactly once with error containment</strong><br>
 * For any {@link AiChatRequestDTO} with {@code contextType == "alert"} (or {@code "incident"})
 * and non-blank {@code contextId}, {@code streamChat} invokes {@code loadAlertAsJson}
 * (or {@code loadIncidentAsJson}) exactly once and appends the non-null result to the system
 * prompt; for any exception thrown by the context service, {@code streamChat} still returns
 * a non-empty {@code Flux<String>} produced by {@code HaLlmService.streamChat} invoked with
 * the base system prompt.
 *
 * <p><strong>Validates: Requirements 3.4, 3.5, 3.6</strong>
 */
@Label("Feature: sprint-25-ai-chat, Property 10: Context service invocation and error containment")
class HaAiChatContextServicePropertyTest {

    private HaLlmService llmService;
    private HaAiChatHistoryRepository repo;
    private HaAlertContextService alertCtx;
    private HaIncidentContextService incidentCtx;
    private ObjectMapper objectMapper;
    private HaAiChatService service;

    @BeforeEach
    @BeforeTry
    void setUp() {
        llmService = mock(HaLlmService.class);
        repo = mock(HaAiChatHistoryRepository.class);
        alertCtx = mock(HaAlertContextService.class);
        incidentCtx = mock(HaIncidentContextService.class);
        objectMapper = new ObjectMapper().findAndRegisterModules();
        service = new HaAiChatService(llmService, repo, alertCtx, incidentCtx, objectMapper);
    }

    // =========================================================================
    // Property 10-A: alert context service invoked exactly once
    // =========================================================================

    /**
     * For any request with {@code contextType="alert"} and a non-blank {@code contextId},
     * {@code loadAlertAsJson} is called exactly once.
     *
     * <p><strong>Validates: Requirements 3.4, 3.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 10-A: loadAlertAsJson invoked exactly once per streamChat call")
    void property10a_alertContextInvokedExactlyOnce(
            @ForAll("nonBlankIds") String contextId,
            @ForAll("nonBlankContents") String messageContent) {

        AiChatRequestDTO request = new AiChatRequestDTO(
            List.of(new ChatMessageDTO("user", messageContent)),
            "alert",
            contextId
        );

        when(alertCtx.loadAlertAsJson(contextId))
            .thenReturn("{\"id\":\"" + contextId + "\",\"name\":\"Alert\"}");
        when(llmService.streamChat(any(), anyString()))
            .thenReturn(Flux.just("token1", "token2"));

        List<String> tokens = service.streamChat(request, "analyst").collectList().block();

        assertThat(tokens).isNotEmpty();
        verify(alertCtx, times(1)).loadAlertAsJson(contextId);
        verify(incidentCtx, never()).loadIncidentAsJson(anyString());
    }

    // =========================================================================
    // Property 10-B: incident context service invoked exactly once
    // =========================================================================

    @Property(tries = 100)
    @Label("Property 10-B: loadIncidentAsJson invoked exactly once per streamChat call")
    void property10b_incidentContextInvokedExactlyOnce(
            @ForAll("nonBlankIds") String contextId,
            @ForAll("nonBlankContents") String messageContent) {

        AiChatRequestDTO request = new AiChatRequestDTO(
            List.of(new ChatMessageDTO("user", messageContent)),
            "incident",
            contextId
        );

        when(incidentCtx.loadIncidentAsJson(contextId))
            .thenReturn("{\"id\":\"" + contextId + "\",\"incidentName\":\"Inc\"}");
        when(llmService.streamChat(any(), anyString()))
            .thenReturn(Flux.just("token"));

        List<String> tokens = service.streamChat(request, "analyst").collectList().block();

        assertThat(tokens).isNotEmpty();
        verify(incidentCtx, times(1)).loadIncidentAsJson(contextId);
        verify(alertCtx, never()).loadAlertAsJson(anyString());
    }

    // =========================================================================
    // Property 10-C: throwing context service → Flux still non-empty (error containment)
    // =========================================================================

    /**
     * When the alert context service throws any exception, {@code streamChat} MUST
     * NOT propagate the exception — it must still return a non-empty {@code Flux<String>}
     * from {@code HaLlmService.streamChat} with the base system prompt.
     *
     * <p><strong>Validates: Requirement 3.6</strong>
     */
    @Property(tries = 50)
    @Label("Property 10-C: exception in alert context service does not propagate — Flux still non-empty")
    void property10c_throwingAlertContext_stillProducesFlux(
            @ForAll("nonBlankIds") String contextId) {

        AiChatRequestDTO request = new AiChatRequestDTO(
            List.of(new ChatMessageDTO("user", "What happened?")),
            "alert",
            contextId
        );

        // Alert context service throws a runtime exception
        when(alertCtx.loadAlertAsJson(contextId))
            .thenThrow(new RuntimeException("Simulated OpenSearch failure"));
        when(llmService.streamChat(any(), anyString()))
            .thenReturn(Flux.just("fallback-token"));

        // Must not throw — the exception is swallowed inside composeSystemPrompt
        List<String> tokens = service.streamChat(request, "analyst").collectList().block();

        assertThat(tokens)
            .as("Flux must be non-empty even when context service throws")
            .isNotEmpty();
        verify(llmService, times(1)).streamChat(any(), anyString());
    }

    /**
     * Same test for incident context service.
     */
    @Property(tries = 50)
    @Label("Property 10-D: exception in incident context service does not propagate — Flux still non-empty")
    void property10d_throwingIncidentContext_stillProducesFlux(
            @ForAll("nonBlankIds") String contextId) {

        AiChatRequestDTO request = new AiChatRequestDTO(
            List.of(new ChatMessageDTO("user", "Summarize.")),
            "incident",
            contextId
        );

        when(incidentCtx.loadIncidentAsJson(contextId))
            .thenThrow(new RuntimeException("DB connection lost"));
        when(llmService.streamChat(any(), anyString()))
            .thenReturn(Flux.just("fallback"));

        List<String> tokens = service.streamChat(request, "analyst").collectList().block();

        assertThat(tokens).isNotEmpty();
        verify(llmService, times(1)).streamChat(any(), anyString());
    }

    // =========================================================================
    // Property 10-E: general context → neither context service is called
    // =========================================================================

    @Property(tries = 50)
    @Label("Property 10-E: contextType=general → no context service invoked")
    void property10e_generalContext_noContextServiceCalled(
            @ForAll("nonBlankContents") String messageContent) {

        AiChatRequestDTO request = new AiChatRequestDTO(
            List.of(new ChatMessageDTO("user", messageContent)),
            "general",
            null
        );

        when(llmService.streamChat(any(), anyString())).thenReturn(Flux.just("token"));

        service.streamChat(request, "analyst").collectList().block();

        verify(alertCtx, never()).loadAlertAsJson(anyString());
        verify(incidentCtx, never()).loadIncidentAsJson(anyString());
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    @Provide
    Arbitrary<String> nonBlankIds() {
        return Arbitraries.strings().alpha().ofMinLength(1).ofMaxLength(40);
    }

    @Provide
    Arbitrary<String> nonBlankContents() {
        return Arbitraries.strings().ofMinLength(1).ofMaxLength(200)
            .filter(s -> !s.isBlank());
    }
}
