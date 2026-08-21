package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.repository.HaAiChatHistoryRepository;
import com.hivearmor.web.rest.dto.AiChatHistoryDTO;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Check 4: Triage cache TTL integration test.
 *
 * <p>Issues two sequential calls to {@code generateTriage} for the same
 * {@code alertId} within TTL. Asserts:
 * <ul>
 *   <li>Both calls return equal response bodies</li>
 *   <li>{@code HaLlmService.chat} is invoked exactly once (cache hit on second call)</li>
 * </ul>
 *
 * <p>Requirements: 13.4, 13.5
 */
class HaAiChatTriageCacheIntegrationTest {

    @Test
    void twoTriageCallsForSameAlertWithinTtl_llmCalledOnce_responsesEqual() throws Exception {
        // Arrange
        HaLlmService llmService = mock(HaLlmService.class);
        HaAiChatHistoryRepository repo = mock(HaAiChatHistoryRepository.class);
        HaAlertContextService alertCtx = mock(HaAlertContextService.class);
        HaIncidentContextService incidentCtx = mock(HaIncidentContextService.class);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

        HaAiChatService service = new HaAiChatService(
            llmService, repo, alertCtx, incidentCtx, objectMapper);

        String alertId = "integration-alert-1";
        String userLogin = "analyst-user";
        String triageResult = "This alert indicates lateral movement via PsExec.";

        // First call: cache miss
        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            userLogin, "triage", alertId))
            .thenReturn(List.of()) // first call — empty cache
            .thenAnswer(inv -> { // second call — return persisted row
                com.hivearmor.domain.HaAiChatHistory row = new com.hivearmor.domain.HaAiChatHistory();
                row.setUserLogin(userLogin);
                row.setContextType("triage");
                row.setContextId(alertId);
                row.setMessagesJson("[{\"role\":\"assistant\",\"content\":\"" + triageResult + "\"}]");
                row.setCreatedAt(java.time.Instant.now());
                row.setUpdatedAt(java.time.Instant.now());
                return List.of(row);
            });

        when(alertCtx.loadAlertAsJson(alertId)).thenReturn("{\"id\":\"" + alertId + "\"}");
        when(llmService.chat(any(), anyString())).thenReturn(triageResult);
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Act: first call (cache miss)
        long t1Start = System.currentTimeMillis();
        String result1 = service.generateTriage(alertId, userLogin);
        long t1Duration = System.currentTimeMillis() - t1Start;

        // Act: second call (cache hit — mock returns the persisted row)
        long t2Start = System.currentTimeMillis();
        String result2 = service.generateTriage(alertId, userLogin);
        long t2Duration = System.currentTimeMillis() - t2Start;

        // Assert: response bodies are equal
        assertThat(result1).isEqualTo(triageResult);
        assertThat(result2).isEqualTo(result1);

        // Assert: LLM called exactly once
        verify(llmService, times(1)).chat(any(), anyString());

        // Assert: second call is at least as fast as first (cache hit)
        // Lenient timing check — just assert second call is reasonable
        assertThat(t2Duration).isLessThanOrEqualTo(t1Duration + 100L);
    }
}
