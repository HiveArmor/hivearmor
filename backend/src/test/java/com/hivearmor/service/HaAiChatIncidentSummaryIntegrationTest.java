package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.repository.HaAiChatHistoryRepository;
import com.hivearmor.web.rest.dto.AiIncidentSummaryDTO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Check 5: Incident-summary shape integration test.
 *
 * <p>Calls {@code generateIncidentSummary} with a fixture incident and asserts:
 * <ul>
 *   <li>{@code narrative} is non-blank</li>
 *   <li>{@code recommendedSteps.size() >= 1}</li>
 *   <li>{@code riskLevel ∈ {low, medium, high, critical}}</li>
 * </ul>
 *
 * <p>Requirements: 17.6, 17.7, 17.8, 18.5
 */
class HaAiChatIncidentSummaryIntegrationTest {

    private static final Set<String> VALID_RISK_LEVELS = Set.of("low", "medium", "high", "critical");

    @Test
    void generateIncidentSummary_returnsDtoWithValidShape() throws Exception {
        // Arrange
        HaLlmService llmService = mock(HaLlmService.class);
        HaAiChatHistoryRepository repo = mock(HaAiChatHistoryRepository.class);
        HaAlertContextService alertCtx = mock(HaAlertContextService.class);
        HaIncidentContextService incidentCtx = mock(HaIncidentContextService.class);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

        HaAiChatService service = new HaAiChatService(
            llmService, repo, alertCtx, incidentCtx, objectMapper);

        String incidentId = "incident-shape-check-1";
        String userLogin = "analyst";

        // No cached row
        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            userLogin, "incident_summary", incidentId))
            .thenReturn(List.of());

        when(incidentCtx.loadIncidentAsJson(incidentId))
            .thenReturn("{\"id\":\"" + incidentId + "\",\"incidentName\":\"Ransomware Attack\"}");

        // LLM returns a valid JSON summary
        AiIncidentSummaryDTO mockDto = new AiIncidentSummaryDTO(
            "Ransomware was deployed via phishing email attachment.",
            "Financially-motivated criminal group",
            List.of("Isolate affected hosts", "Reset all credentials", "Restore from backup"),
            "critical"
        );
        when(llmService.chat(any(), anyString()))
            .thenReturn(objectMapper.writeValueAsString(mockDto));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Act
        AiIncidentSummaryDTO result = service.generateIncidentSummary(incidentId, userLogin);

        // Assert: narrative is non-blank
        assertThat(result.narrative())
            .as("narrative must be non-blank")
            .isNotBlank();

        // Assert: recommendedSteps has at least one item
        assertThat(result.recommendedSteps())
            .as("recommendedSteps must have at least one item")
            .isNotEmpty();

        // Assert: riskLevel is within the allowed enumeration
        assertThat(VALID_RISK_LEVELS)
            .as("riskLevel must be one of {low, medium, high, critical}, got '%s'",
                result.riskLevel())
            .contains(result.riskLevel());
    }

    @Test
    void generateIncidentSummary_invalidLlmJson_returnsFallbackWithMediumRisk() throws Exception {
        HaLlmService llmService = mock(HaLlmService.class);
        HaAiChatHistoryRepository repo = mock(HaAiChatHistoryRepository.class);
        HaAlertContextService alertCtx = mock(HaAlertContextService.class);
        HaIncidentContextService incidentCtx = mock(HaIncidentContextService.class);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        HaAiChatService service = new HaAiChatService(
            llmService, repo, alertCtx, incidentCtx, objectMapper);

        String incidentId = "incident-fallback-1";
        String userLogin = "analyst";

        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            userLogin, "incident_summary", incidentId)).thenReturn(List.of());
        when(incidentCtx.loadIncidentAsJson(incidentId)).thenReturn("{\"id\":\"" + incidentId + "\"}");
        // LLM returns invalid JSON
        when(llmService.chat(any(), anyString())).thenReturn("Not valid JSON at all");
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AiIncidentSummaryDTO result = service.generateIncidentSummary(incidentId, userLogin);

        assertThat(result.narrative()).isNotBlank();
        assertThat(result.riskLevel()).isEqualTo("medium"); // fallback default
        assertThat(VALID_RISK_LEVELS).contains(result.riskLevel());
    }
}
