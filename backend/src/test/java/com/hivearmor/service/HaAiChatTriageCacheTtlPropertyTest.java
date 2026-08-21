package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.HaAiChatHistory;
import com.hivearmor.repository.HaAiChatHistoryRepository;
import com.hivearmor.web.rest.dto.AiIncidentSummaryDTO;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.junit.jupiter.api.BeforeEach;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Property 2: Triage and incident-summary cache TTL invariant.
 *
 * <p><strong>Property 2: Triage and incident-summary cache TTL invariant</strong><br>
 * For any {@code (userLogin, contextId)} and {@code contextType ∈ {triage, incident_summary}},
 * if a matching history row has {@code createdAt ≥ now − 3600s} then the service returns
 * the deserialized cached content with zero {@code HaLlmService.chat} calls and zero
 * {@code save} calls; otherwise exactly one of each occurs.
 *
 * <p><strong>Validates: Requirements 13.4, 13.5, 17.4, 17.5</strong>
 */
@Label("Feature: sprint-25-ai-chat, Property 2: Triage and incident-summary cache TTL invariant")
class HaAiChatTriageCacheTtlPropertyTest {

    private HaLlmService llmService;
    private HaAiChatHistoryRepository historyRepository;
    private HaAlertContextService alertContextService;
    private HaIncidentContextService incidentContextService;
    private ObjectMapper objectMapper;
    private HaAiChatService service;

    @BeforeEach
    @BeforeTry
    void setUp() {
        llmService = mock(HaLlmService.class);
        historyRepository = mock(HaAiChatHistoryRepository.class);
        alertContextService = mock(HaAlertContextService.class);
        incidentContextService = mock(HaIncidentContextService.class);
        objectMapper = new ObjectMapper().findAndRegisterModules();
        service = new HaAiChatService(
            llmService, historyRepository,
            alertContextService, incidentContextService,
            objectMapper);
    }

    // =========================================================================
    // Property 2-A: cache hit — zero LLM calls when row is within TTL
    // =========================================================================

    /**
     * When a triage row exists with {@code createdAt ≥ now − 3600s},
     * {@code generateTriage} MUST return the cached summary without calling the LLM.
     *
     * <p><strong>Validates: Requirements 13.4, 13.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 2-A: cache hit for triage — zero LLM calls")
    void property2a_triageCacheHit_noLlmCall(
            @ForAll("validLogins") String userLogin,
            @ForAll("validIds") String alertId,
            @ForAll("summaryTexts") String cachedSummary) throws Exception {

        // Arrange: a history row created 60 seconds ago (well within the 3600s TTL)
        HaAiChatHistory cachedRow = buildTriageRow(userLogin, alertId,
            cachedSummary, Instant.now().minusSeconds(60));
        when(historyRepository
            .findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                userLogin, "triage", alertId))
            .thenReturn(List.of(cachedRow));

        // Act
        String result = service.generateTriage(alertId, userLogin);

        // Assert: the returned text comes from the cache
        assertThat(result).isNotNull();
        // LLM and save must not be called
        verify(llmService, never()).chat(any(), anyString());
        verify(historyRepository, never()).save(any());
    }

    /**
     * When an incident-summary row exists within TTL,
     * {@code generateIncidentSummary} MUST return the cached DTO without calling the LLM.
     *
     * <p><strong>Validates: Requirements 17.4, 17.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 2-B: cache hit for incident-summary — zero LLM calls")
    void property2b_incidentSummaryCacheHit_noLlmCall(
            @ForAll("validLogins") String userLogin,
            @ForAll("validIds") String incidentId) throws Exception {

        // Build a valid AiIncidentSummaryDTO and serialize it as the cached messages_json
        AiIncidentSummaryDTO cachedDto = new AiIncidentSummaryDTO(
            "Cached narrative", "APT", List.of("Step 1"), "high");
        String cachedJson = objectMapper.writeValueAsString(cachedDto);

        HaAiChatHistory cachedRow = buildSummaryRow(userLogin, incidentId,
            cachedJson, Instant.now().minusSeconds(120));
        when(historyRepository
            .findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                userLogin, "incident_summary", incidentId))
            .thenReturn(List.of(cachedRow));

        // Act
        AiIncidentSummaryDTO result = service.generateIncidentSummary(incidentId, userLogin);

        // Assert
        assertThat(result).isNotNull();
        verify(llmService, never()).chat(any(), anyString());
        verify(historyRepository, never()).save(any());
    }

    // =========================================================================
    // Property 2-C: cache miss — exactly one LLM call and one save
    // =========================================================================

    /**
     * When no triage row exists (empty list), {@code generateTriage} MUST
     * call {@code HaLlmService.chat} exactly once and save exactly once.
     *
     * <p><strong>Validates: Requirements 13.4, 13.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 2-C: cache miss for triage — exactly one LLM call + one save")
    void property2c_triageCacheMiss_exactlyOneLlmCallAndOneSave(
            @ForAll("validLogins") String userLogin,
            @ForAll("validIds") String alertId,
            @ForAll("summaryTexts") String llmResponse) throws Exception {

        // Arrange: no cached row
        when(historyRepository
            .findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                userLogin, "triage", alertId))
            .thenReturn(List.of());
        when(alertContextService.loadAlertAsJson(alertId))
            .thenReturn("{\"id\":\"" + alertId + "\"}");
        when(llmService.chat(any(), anyString())).thenReturn(llmResponse);
        when(historyRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Act
        String result = service.generateTriage(alertId, userLogin);

        // Assert
        assertThat(result).isEqualTo(llmResponse);
        verify(llmService, times(1)).chat(any(), anyString());
        verify(historyRepository, times(1)).save(any());
    }

    // =========================================================================
    // Property 2-D: stale row — exactly one LLM call and one save
    // =========================================================================

    /**
     * When the most-recent triage row is older than 3600s (stale), the service
     * MUST treat it as a cache miss — call the LLM once and save once.
     *
     * <p><strong>Validates: Requirements 13.4, 13.5</strong>
     */
    @Property(tries = 50)
    @Label("Property 2-D: stale triage row (> TTL) — treated as cache miss")
    void property2d_staleTriage_treatedAsCacheMiss(
            @ForAll("validLogins") String userLogin,
            @ForAll("validIds") String alertId,
            @ForAll("summaryTexts") String llmResponse) throws Exception {

        // Arrange: row created 4000 seconds ago (past the 3600s TTL)
        HaAiChatHistory staleRow = buildTriageRow(userLogin, alertId,
            "old cached summary", Instant.now().minusSeconds(4000));
        when(historyRepository
            .findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                userLogin, "triage", alertId))
            .thenReturn(List.of(staleRow));
        when(alertContextService.loadAlertAsJson(alertId))
            .thenReturn("{\"id\":\"" + alertId + "\"}");
        when(llmService.chat(any(), anyString())).thenReturn(llmResponse);
        when(historyRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Act
        service.generateTriage(alertId, userLogin);

        // Assert: stale → must call LLM
        verify(llmService, times(1)).chat(any(), anyString());
        verify(historyRepository, times(1)).save(any());
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    @Provide
    Arbitrary<String> validLogins() {
        return Arbitraries.strings().alpha().ofMinLength(3).ofMaxLength(30);
    }

    @Provide
    Arbitrary<String> validIds() {
        return Arbitraries.strings().alpha().ofMinLength(1).ofMaxLength(50);
    }

    @Provide
    Arbitrary<String> summaryTexts() {
        return Arbitraries.strings().ofMinLength(5).ofMaxLength(200)
            .filter(s -> !s.isBlank());
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private HaAiChatHistory buildTriageRow(String userLogin, String ctxId,
                                            String summary, Instant createdAt) {
        HaAiChatHistory row = new HaAiChatHistory();
        row.setUserLogin(userLogin);
        row.setContextType("triage");
        row.setContextId(ctxId);
        // Wrap the summary text as a single assistant message in JSON array form
        String messagesJson = "[{\"role\":\"assistant\",\"content\":"
            + "\"" + summary.replace("\"", "\\\"") + "\"}]";
        row.setMessagesJson(messagesJson);
        row.setCreatedAt(createdAt);
        row.setUpdatedAt(createdAt);
        return row;
    }

    private HaAiChatHistory buildSummaryRow(String userLogin, String ctxId,
                                             String dtoJson, Instant createdAt) {
        HaAiChatHistory row = new HaAiChatHistory();
        row.setUserLogin(userLogin);
        row.setContextType("incident_summary");
        row.setContextId(ctxId);
        // Store the DTO JSON as the content of a single assistant message
        String escaped = dtoJson.replace("\\", "\\\\").replace("\"", "\\\"");
        row.setMessagesJson("[{\"role\":\"assistant\",\"content\":\"" + escaped + "\"}]");
        row.setCreatedAt(createdAt);
        row.setUpdatedAt(createdAt);
        return row;
    }
}
