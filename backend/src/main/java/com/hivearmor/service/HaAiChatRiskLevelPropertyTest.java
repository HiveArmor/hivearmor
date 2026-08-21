package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.repository.HaAiChatHistoryRepository;
import com.hivearmor.web.rest.dto.AiIncidentSummaryDTO;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Property 6: {@code riskLevel} is always a member of {@code RiskLevelEnumeration}.
 *
 * <p><strong>Property 6: riskLevel is always a member of RiskLevelEnumeration</strong><br>
 * For any LLM output string (non-JSON, malformed JSON, or JSON with {@code riskLevel}
 * outside the allowed set), the returned {@link AiIncidentSummaryDTO#riskLevel()} is
 * a member of {@code {low, medium, high, critical}}.
 *
 * <p>Three scenarios are exercised:
 * <ol>
 *   <li>Valid JSON with a valid {@code riskLevel} → value is preserved.</li>
 *   <li>Valid JSON with an invalid {@code riskLevel} (including {@code null},
 *       empty string, "EXTREME", etc.) → normalised to {@code "medium"}.</li>
 *   <li>Completely non-JSON string → fallback DTO with {@code riskLevel = "medium"}.</li>
 *   <li>Explicit {@code null} riskLevel field in JSON → normalised to {@code "medium"}.</li>
 * </ol>
 *
 * <p><strong>Validates: Requirements 17.7, 17.8, 18.5</strong>
 */
@Label("Feature: sprint-25-ai-chat, Property 6: riskLevel always in RiskLevelEnumeration")
class HaAiChatRiskLevelPropertyTest {

    private static final Set<String> VALID_RISK_LEVELS = Set.of("low", "medium", "high", "critical");

    private HaAiChatService service;
    private ObjectMapper objectMapper;

    /**
     * Re-initialises service and ObjectMapper before every jqwik trial.
     * Uses {@link BeforeTry} (jqwik lifecycle) — NOT JUnit's {@code @BeforeEach} —
     * so that the fields are populated when each property method executes.
     */
    @BeforeTry
    void setUp() {
        HaLlmService llmService = mock(HaLlmService.class);
        HaAiChatHistoryRepository repo = mock(HaAiChatHistoryRepository.class);
        HaAlertContextService alertCtx = mock(HaAlertContextService.class);
        HaIncidentContextService incidentCtx = mock(HaIncidentContextService.class);
        objectMapper = new ObjectMapper().findAndRegisterModules();
        service = new HaAiChatService(llmService, repo, alertCtx, incidentCtx, objectMapper);
    }

    // =========================================================================
    // Property 6-A: valid JSON with valid riskLevel → preserved
    // =========================================================================

    /**
     * <strong>Property 6-A: valid riskLevel is preserved end-to-end</strong>
     *
     * <p>When the LLM returns valid JSON with a {@code riskLevel} inside the allowed set,
     * {@code parseSummaryOrFallback} + {@code normalizeRiskLevel} must preserve that
     * exact value. The output must still be a member of the valid set.
     *
     * <p><strong>Validates: Requirements 17.7, 17.8</strong>
     */
    @Property(tries = 100)
    @Label("Property 6-A: valid riskLevel is preserved")
    void property6a_validRiskLevel_preserved(
            @ForAll("validRiskLevels") String riskLevel) throws Exception {

        String llmOutput = objectMapper.writeValueAsString(new AiIncidentSummaryDTO(
            "A narrative.", "APT28", List.of("Step 1"), riskLevel));

        AiIncidentSummaryDTO result = service.parseSummaryOrFallback(llmOutput);
        AiIncidentSummaryDTO normalized = service.normalizeRiskLevel(result);

        assertThat(VALID_RISK_LEVELS)
            .as("riskLevel '%s' must remain in the valid set after round-trip", normalized.riskLevel())
            .contains(normalized.riskLevel());
        assertThat(normalized.riskLevel())
            .as("Valid riskLevel '%s' must be preserved unchanged", riskLevel)
            .isEqualTo(riskLevel);
    }

    // =========================================================================
    // Property 6-B: invalid riskLevel in otherwise valid JSON → "medium"
    // =========================================================================

    /**
     * <strong>Property 6-B: invalid riskLevel in valid JSON normalised to "medium"</strong>
     *
     * <p>When the LLM returns valid JSON but with a {@code riskLevel} outside the allowed
     * set (e.g. "EXTREME", "HIGH", "3", empty string), the normalizer must rewrite
     * it to {@code "medium"}.
     *
     * <p><strong>Validates: Requirements 17.7, 17.8, 18.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 6-B: invalid riskLevel in valid JSON normalized to 'medium'")
    void property6b_invalidRiskLevelInValidJson_normalizedToMedium(
            @ForAll("invalidRiskLevels") String badRiskLevel) throws Exception {

        String llmOutput = objectMapper.writeValueAsString(new AiIncidentSummaryDTO(
            "A narrative.", "Unknown", List.of("Check logs"), badRiskLevel));

        AiIncidentSummaryDTO parsed = service.parseSummaryOrFallback(llmOutput);
        AiIncidentSummaryDTO normalized = service.normalizeRiskLevel(parsed);

        assertThat(VALID_RISK_LEVELS)
            .as("riskLevel='%s' must be in the valid set after normalisation", normalized.riskLevel())
            .contains(normalized.riskLevel());
        assertThat(normalized.riskLevel())
            .as("Invalid riskLevel '%s' must be rewritten to 'medium'", badRiskLevel)
            .isEqualTo("medium");
    }

    // =========================================================================
    // Property 6-C: completely non-JSON string → fallback DTO with "medium"
    // =========================================================================

    /**
     * <strong>Property 6-C: non-JSON LLM output triggers fallback with riskLevel "medium"</strong>
     *
     * <p>When the LLM returns a completely non-JSON string (prose, partial JSON,
     * random bytes), {@code parseSummaryOrFallback} must return the medium-severity
     * fallback DTO. After normalisation the riskLevel must be {@code "medium"}.
     *
     * <p><strong>Validates: Requirements 17.7, 17.8</strong>
     */
    @Property(tries = 100)
    @Label("Property 6-C: non-JSON LLM output returns fallback with riskLevel='medium'")
    void property6c_nonJsonOutput_fallbackMedium(
            @ForAll("nonJsonStrings") String nonJson) {

        AiIncidentSummaryDTO result = service.parseSummaryOrFallback(nonJson);
        AiIncidentSummaryDTO normalized = service.normalizeRiskLevel(result);

        assertThat(VALID_RISK_LEVELS)
            .as("riskLevel from fallback must be in the valid set; got: '%s'", normalized.riskLevel())
            .contains(normalized.riskLevel());
        assertThat(normalized.riskLevel())
            .as("Fallback DTO for non-JSON input must have riskLevel='medium'")
            .isEqualTo("medium");
    }

    // =========================================================================
    // Property 6-D: null riskLevel field in JSON → "medium"
    // =========================================================================

    /**
     * <strong>Property 6-D: null riskLevel field in JSON normalised to "medium"</strong>
     *
     * <p>When the LLM returns valid JSON with an explicit {@code "riskLevel": null},
     * the normalizer must rewrite it to {@code "medium"}.
     *
     * <p><strong>Validates: Requirements 17.7, 17.8, 18.5</strong>
     */
    @Property(tries = 20)
    @Label("Property 6-D: null riskLevel normalized to 'medium'")
    void property6d_nullRiskLevel_normalizedToMedium() {

        String llmOutput = "{\"narrative\":\"test\",\"threatActorType\":\"APT\","
            + "\"recommendedSteps\":[\"step\"],\"riskLevel\":null}";

        AiIncidentSummaryDTO parsed = service.parseSummaryOrFallback(llmOutput);
        AiIncidentSummaryDTO normalized = service.normalizeRiskLevel(parsed);

        assertThat(VALID_RISK_LEVELS)
            .as("null riskLevel must be normalised to a valid value; got: '%s'", normalized.riskLevel())
            .contains(normalized.riskLevel());
        assertThat(normalized.riskLevel())
            .as("null riskLevel must be rewritten to 'medium'")
            .isEqualTo("medium");
    }

    // =========================================================================
    // Property 6-E: direct normalizeRiskLevel with arbitrary strings
    // =========================================================================

    /**
     * <strong>Property 6-E: normalizeRiskLevel with arbitrary riskLevel strings</strong>
     *
     * <p>For any arbitrary string passed as {@code riskLevel} in a DTO,
     * {@code normalizeRiskLevel} must always return a DTO whose {@code riskLevel}
     * is a member of {@code {low, medium, high, critical}}.
     *
     * <p><strong>Validates: Requirements 17.7, 17.8, 18.5</strong>
     */
    @Property(tries = 200)
    @Label("Property 6-E: normalizeRiskLevel always produces a valid riskLevel for any arbitrary string")
    void property6e_normalizeRiskLevel_arbitraryString_alwaysValid(
            @ForAll("arbitraryNullableRiskLevels") String arbitraryRiskLevel) {

        AiIncidentSummaryDTO dto = new AiIncidentSummaryDTO(
            "narrative", "actor", List.of("step"), arbitraryRiskLevel);

        AiIncidentSummaryDTO normalized = service.normalizeRiskLevel(dto);

        assertThat(VALID_RISK_LEVELS)
            .as("normalizeRiskLevel('%s') must produce a valid riskLevel", arbitraryRiskLevel)
            .contains(normalized.riskLevel());
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /** Generates the four allowed risk level strings. */
    @Provide
    Arbitrary<String> validRiskLevels() {
        return Arbitraries.of("low", "medium", "high", "critical");
    }

    /**
     * Generates arbitrary strings that are NOT in the allowed set.
     * Includes edge cases like empty string, whitespace, uppercase variants, and
     * random ASCII.
     */
    @Provide
    Arbitrary<String> invalidRiskLevels() {
        return Arbitraries.strings()
            .ofMinLength(0)
            .ofMaxLength(40)
            .filter(s -> !VALID_RISK_LEVELS.contains(s));
    }

    /**
     * Generates arbitrary strings (including {@code null}) for the direct
     * {@code normalizeRiskLevel} property. Uses {@link Arbitrary#injectNull(double)}
     * to include {@code null} at approximately 10 % rate.
     */
    @Provide
    Arbitrary<String> arbitraryNullableRiskLevels() {
        return Arbitraries.strings()
            .ofMinLength(0)
            .ofMaxLength(40)
            .injectNull(0.1);
    }

    /**
     * Generates strings that are not valid JSON objects.
     * Uses ObjectMapper to filter out strings that can be parsed without error.
     */
    @Provide
    Arbitrary<String> nonJsonStrings() {
        return Arbitraries.strings()
            .ofMinLength(0)
            .ofMaxLength(200)
            .filter(s -> {
                try {
                    new ObjectMapper().readTree(s);
                    return false;
                } catch (Exception e) {
                    return true;
                }
            });
    }
}
