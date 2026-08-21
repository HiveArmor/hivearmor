package com.hivearmor.web.rest;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.domain.rulegen.HaRuleGenSession;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.repository.rulegen.HaRuleGenSessionRepository;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.service.rulegen.HaRuleGenerationService;
import com.hivearmor.service.rulegen.dto.GenerateRequest;
import com.hivearmor.service.rulegen.dto.RuleGenSessionDTO;
import com.hivearmor.service.rulegen.dto.SignalGroup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import java.lang.reflect.Field;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * Verification Check 2: POST generate returns a pending_review DTO.
 *
 * <p>This unit-style test authenticates as ADMIN (conceptually) and invokes
 * {@link HaRuleGenerationService#generateRuleSuggestion} against a stubbed
 * {@link HaLlmService}. It asserts the response body is a {@link RuleGenSessionDTO}
 * with {@code status = pending_review}.
 *
 * <p>The test mocks:
 * <ul>
 *   <li>{@code HaLlmService.chat} — returns valid YAML containing all required keys</li>
 *   <li>{@code HaAlertSignalRepository.findSignalGroupsWithMinCount} — returns signal groups</li>
 *   <li>{@code HaRuleGenSessionRepository.save} — returns the entity with an assigned ID</li>
 * </ul>
 *
 * <p><strong>Validates: Requirement 7.2</strong>
 */
@DisplayName("Verification Check 2: POST generate returns pending_review DTO")
class VerificationCheck2Test {

    private static final Instant FIXED_NOW = Instant.parse("2026-07-25T14:00:00Z");

    private static final String VALID_YAML = """
        name: brute_force_login_rule
        severity: high
        dataTypes:
          - linux
          - windows
        definition: cel_expression_here
        """;

    @TempDir
    Path tempDir;

    private HaAlertSignalRepository signalRepo;
    private HaRuleGenSessionRepository sessionRepo;
    private HaLlmService llmService;
    private HaRuleGenerationService service;

    @BeforeEach
    void setUp() throws Exception {
        signalRepo = mock(HaAlertSignalRepository.class);
        sessionRepo = mock(HaRuleGenSessionRepository.class);
        llmService = mock(HaLlmService.class);

        Clock clock = Clock.fixed(FIXED_NOW, ZoneId.of("UTC"));
        service = new HaRuleGenerationService(signalRepo, sessionRepo, llmService, clock);

        // Inject the outputDir via reflection since @Value won't fire in a unit test
        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, tempDir.toString());
    }

    /**
     * Invokes {@code generateRuleSuggestion} with a stubbed LLM that returns valid
     * YAML on the first call. Asserts the returned DTO has status {@code pending_review}
     * and contains the expected rule metadata.
     *
     * <p>Validates: Requirement 7.2
     */
    @Test
    @DisplayName("generateRuleSuggestion returns RuleGenSessionDTO with status = pending_review")
    void generateRuleSuggestion_withValidLlmResponse_returnsPendingReviewDto() {
        // Given: signal groups exist above the minimum threshold
        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(
                new SignalGroup("linux", HaAlertSignal.SignalType.TRUE_POSITIVE, 5, FIXED_NOW, FIXED_NOW),
                new SignalGroup("windows", HaAlertSignal.SignalType.FALSE_POSITIVE, 3, FIXED_NOW, FIXED_NOW)
            ));

        // Given: LLM returns valid YAML containing all required keys
        when(llmService.chat(anyList(), any(ChatOptions.class)))
            .thenReturn(VALID_YAML);

        // Given: repository save assigns an ID and returns the entity
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> {
                HaRuleGenSession s = invocation.getArgument(0);
                s.setId(42L);
                return s;
            });

        // When: ADMIN issues POST /api/ha-rules/sessions/generate (service-level equivalent)
        GenerateRequest request = new GenerateRequest("linux", 3L);
        RuleGenSessionDTO result = service.generateRuleSuggestion(request);

        // Then: response body is a RuleGenSessionDTO with status = pending_review
        assertThat(result).isNotNull();
        assertThat(result.status())
            .as("Session status must be 'pending_review'")
            .isEqualTo("pending_review");

        // And: the DTO contains expected metadata
        assertThat(result.id()).isEqualTo(42L);
        assertThat(result.ruleName()).isEqualTo("brute_force_login_rule");
        assertThat(result.ruleYaml()).isEqualTo(VALID_YAML);
        assertThat(result.signalKey()).isEqualTo("linux");
        assertThat(result.createdAt()).isEqualTo(FIXED_NOW);
        assertThat(result.updatedAt()).isEqualTo(FIXED_NOW);

        // And: the persisted session entity also has pending_review status
        ArgumentCaptor<HaRuleGenSession> captor = ArgumentCaptor.forClass(HaRuleGenSession.class);
        verify(sessionRepo).save(captor.capture());
        HaRuleGenSession savedSession = captor.getValue();
        assertThat(savedSession.getStatus())
            .isEqualTo(HaRuleGenSession.SessionStatus.pending_review);
    }

    /**
     * Verifies that even when the LLM fails on the first attempt but succeeds on
     * retry, the returned DTO still has status {@code pending_review}.
     *
     * <p>Validates: Requirement 7.2 (covers the retry-then-success path)
     */
    @Test
    @DisplayName("generateRuleSuggestion after retry still returns pending_review status")
    void generateRuleSuggestion_retryThenSuccess_returnsPendingReviewDto() {
        // Given: signal groups exist
        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(
                new SignalGroup("linux", HaAlertSignal.SignalType.TRUE_POSITIVE, 4, FIXED_NOW, FIXED_NOW)
            ));

        // Given: first LLM response is missing required keys, second is valid
        String invalidYaml = "name: incomplete\nseverity: low\n";
        when(llmService.chat(anyList(), any(ChatOptions.class)))
            .thenReturn(invalidYaml)   // attempt 1: fails validation (missing dataTypes, definition)
            .thenReturn(VALID_YAML);   // attempt 2: passes validation

        // Given: repository save assigns an ID
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> {
                HaRuleGenSession s = invocation.getArgument(0);
                s.setId(99L);
                return s;
            });

        // When
        GenerateRequest request = new GenerateRequest("linux", 3L);
        RuleGenSessionDTO result = service.generateRuleSuggestion(request);

        // Then: status is still pending_review regardless of the retry
        assertThat(result).isNotNull();
        assertThat(result.status())
            .as("Session status must be 'pending_review' even after retry")
            .isEqualTo("pending_review");

        // And: LLM was called exactly twice (initial + retry)
        verify(llmService, times(2)).chat(anyList(), any(ChatOptions.class));

        // And: a session was persisted with pending_review
        ArgumentCaptor<HaRuleGenSession> captor = ArgumentCaptor.forClass(HaRuleGenSession.class);
        verify(sessionRepo).save(captor.capture());
        assertThat(captor.getValue().getStatus())
            .isEqualTo(HaRuleGenSession.SessionStatus.pending_review);
    }
}
