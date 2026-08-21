package com.hivearmor.service.rulegen;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.domain.rulegen.HaRuleGenSession;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.repository.rulegen.HaRuleGenSessionRepository;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.service.rulegen.dto.GenerateRequest;
import com.hivearmor.service.rulegen.dto.SignalGroup;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * Property-based test for YAML required-key gating.
 *
 * <p><strong>Property 3: YAML validation is total on required keys</strong><br>
 * Every persisted {@code HaRuleGenSession} with status {@code pending_review} has YAML
 * that parses and contains all of {@code name}, {@code severity}, {@code dataTypes},
 * {@code definition}.
 *
 * <p><strong>Validates: Requirements 3.2, 3.4</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 3: YAML validation is total on required keys")
class YamlRequiredKeyPropertyTest {

    private static final Set<String> REQUIRED_KEYS = Set.of("name", "severity", "dataTypes", "definition");
    private static final Clock FIXED_CLOCK = Clock.fixed(Instant.parse("2026-07-25T10:00:00Z"), ZoneOffset.UTC);

    // =========================================================================
    // Property 3a: YamlValidator.parseAndValidate succeeds iff all 4 keys present
    // =========================================================================

    /**
     * For any YAML string that contains all four required keys with non-null values,
     * {@code YamlValidator.parseAndValidate} must succeed and return a map containing
     * those keys.
     *
     * <p><strong>Validates: Requirements 3.2, 3.4</strong>
     */
    @Property(tries = 200)
    @Label("parseAndValidate succeeds when all 4 required keys are present and non-null")
    void validYamlWithAllKeysSucceeds(
            @ForAll("validYamlStrings") String yaml) {

        Map<String, Object> result = YamlValidator.parseAndValidate(yaml);

        assertThat(result).isNotNull();
        for (String key : REQUIRED_KEYS) {
            assertThat(result).containsKey(key);
            assertThat(result.get(key)).isNotNull();
        }
    }

    /**
     * For any YAML string that is missing at least one required key (or has it set
     * to null), {@code YamlValidator.parseAndValidate} must throw
     * {@code YamlValidationException}.
     *
     * <p><strong>Validates: Requirements 3.2, 3.4</strong>
     */
    @Property(tries = 200)
    @Label("parseAndValidate throws YamlValidationException when a required key is missing")
    void yamlMissingRequiredKeyThrows(
            @ForAll("yamlMissingAtLeastOneKey") String yaml) {

        assertThatThrownBy(() -> YamlValidator.parseAndValidate(yaml))
            .isInstanceOf(YamlValidationException.class);
    }

    /**
     * For any syntactically invalid YAML (unparseable), {@code YamlValidator.parseAndValidate}
     * must throw {@code YamlValidationException}.
     *
     * <p><strong>Validates: Requirements 3.2</strong>
     */
    @Property(tries = 100)
    @Label("parseAndValidate throws YamlValidationException on unparseable YAML")
    void unparseableYamlThrows(
            @ForAll("unparseableYaml") String yaml) {

        assertThatThrownBy(() -> YamlValidator.parseAndValidate(yaml))
            .isInstanceOf(YamlValidationException.class);
    }

    // =========================================================================
    // Property 3b: generateRuleSuggestion flow — valid YAML → pending_review
    // =========================================================================

    /**
     * When {@code HaLlmService.chat} returns YAML containing all required keys,
     * {@code generateRuleSuggestion} persists a session with status
     * {@code pending_review} and the stored YAML passes validation.
     *
     * <p><strong>Validates: Requirements 3.2, 3.4</strong>
     */
    @Property(tries = 100)
    @Label("generateRuleSuggestion with valid LLM response => session persisted as pending_review")
    void validLlmResponseProducesPendingReviewSession(
            @ForAll("validYamlStrings") String validYaml) {

        // -- Arrange: mock collaborators --
        HaAlertSignalRepository signalRepo = mock(HaAlertSignalRepository.class);
        HaRuleGenSessionRepository sessionRepo = mock(HaRuleGenSessionRepository.class);
        HaLlmService llmService = mock(HaLlmService.class);

        // Return a signal group so the service doesn't short-circuit
        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(new SignalGroup("firewall", HaAlertSignal.SignalType.TRUE_POSITIVE,
                5, Instant.now(), Instant.now())));

        // LLM returns valid YAML on first call
        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenReturn(validYaml);

        // Capture the session that gets saved
        AtomicReference<HaRuleGenSession> captured = new AtomicReference<>();
        when(sessionRepo.save(any(HaRuleGenSession.class))).thenAnswer(inv -> {
            HaRuleGenSession session = inv.getArgument(0);
            session.setId(1L);
            captured.set(session);
            return session;
        });

        HaRuleGenerationService service = new HaRuleGenerationService(
            signalRepo, sessionRepo, llmService, FIXED_CLOCK);

        // -- Act --
        var result = service.generateRuleSuggestion(new GenerateRequest("test-key", 3L));

        // -- Assert: session was persisted with pending_review status --
        assertThat(captured.get()).isNotNull();
        assertThat(captured.get().getStatus()).isEqualTo(HaRuleGenSession.SessionStatus.pending_review);

        // The persisted YAML must pass validation (all required keys present)
        Map<String, Object> tree = YamlValidator.parseAndValidate(captured.get().getRuleYaml());
        for (String key : REQUIRED_KEYS) {
            assertThat(tree).containsKey(key);
            assertThat(tree.get(key)).isNotNull();
        }
    }

    // =========================================================================
    // Property 3c: generateRuleSuggestion flow — missing key → exception after retry
    // =========================================================================

    /**
     * When {@code HaLlmService.chat} always returns YAML missing at least one
     * required key, {@code generateRuleSuggestion} throws
     * {@code RuleGenerationException} after retry (both attempts fail).
     *
     * <p><strong>Validates: Requirements 3.2, 3.4</strong>
     */
    @Property(tries = 100)
    @Label("generateRuleSuggestion with invalid LLM response (missing key) => RuleGenerationException after retry")
    void invalidLlmResponseThrowsAfterRetry(
            @ForAll("yamlMissingAtLeastOneKey") String invalidYaml) {

        // -- Arrange: mock collaborators --
        HaAlertSignalRepository signalRepo = mock(HaAlertSignalRepository.class);
        HaRuleGenSessionRepository sessionRepo = mock(HaRuleGenSessionRepository.class);
        HaLlmService llmService = mock(HaLlmService.class);

        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(new SignalGroup("firewall", HaAlertSignal.SignalType.TRUE_POSITIVE,
                5, Instant.now(), Instant.now())));

        // LLM returns invalid YAML on every call
        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenReturn(invalidYaml);

        HaRuleGenerationService service = new HaRuleGenerationService(
            signalRepo, sessionRepo, llmService, FIXED_CLOCK);

        // -- Act & Assert: should throw RuleGenerationException --
        assertThatThrownBy(() -> service.generateRuleSuggestion(new GenerateRequest("test-key", 3L)))
            .isInstanceOf(RuleGenerationException.class);

        // No session should be persisted
        verify(sessionRepo, never()).save(any());
    }

    // =========================================================================
    // Generators
    // =========================================================================

    /**
     * Generates valid YAML strings containing all four required keys with non-null values.
     * Additional arbitrary keys may be included.
     */
    @Provide
    Arbitrary<String> validYamlStrings() {
        Arbitrary<String> names = Arbitraries.strings()
            .alpha().ofMinLength(1).ofMaxLength(30);
        Arbitrary<String> severities = Arbitraries.of("low", "medium", "high", "critical");
        Arbitrary<String> dataTypes = Arbitraries.of("firewall", "ids", "endpoint", "cloud", "auth");
        Arbitrary<String> definitions = Arbitraries.strings()
            .alpha().numeric().withChars(' ', '_', '-')
            .ofMinLength(5).ofMaxLength(100);
        Arbitrary<Integer> extraKeyCount = Arbitraries.integers().between(0, 3);

        return Combinators.combine(names, severities, dataTypes, definitions, extraKeyCount)
            .as((name, severity, dataType, definition, extras) -> {
                StringBuilder sb = new StringBuilder();
                sb.append("name: ").append(name).append('\n');
                sb.append("severity: ").append(severity).append('\n');
                sb.append("dataTypes: ").append(dataType).append('\n');
                sb.append("definition: ").append(definition).append('\n');
                for (int i = 0; i < extras; i++) {
                    sb.append("extra_key_").append(i).append(": value_").append(i).append('\n');
                }
                return sb.toString();
            });
    }

    /**
     * Generates YAML strings that are valid mappings but are missing at least one
     * of the four required keys. We randomly drop 1–4 keys from a complete set.
     */
    @Provide
    Arbitrary<String> yamlMissingAtLeastOneKey() {
        Arbitrary<String> names = Arbitraries.strings()
            .alpha().ofMinLength(1).ofMaxLength(20);
        Arbitrary<String> severities = Arbitraries.of("low", "medium", "high", "critical");
        Arbitrary<String> dataTypes = Arbitraries.of("firewall", "ids", "endpoint");
        Arbitrary<String> definitions = Arbitraries.strings()
            .alpha().numeric().withChars(' ', '_')
            .ofMinLength(5).ofMaxLength(50);
        // Which keys to include (must exclude at least one)
        Arbitrary<Set<String>> includedKeys = Arbitraries.subsetOf(REQUIRED_KEYS)
            .filter(subset -> subset.size() < REQUIRED_KEYS.size());

        return Combinators.combine(names, severities, dataTypes, definitions, includedKeys)
            .as((name, severity, dataType, definition, included) -> {
                StringBuilder sb = new StringBuilder();
                if (included.contains("name")) {
                    sb.append("name: ").append(name).append('\n');
                }
                if (included.contains("severity")) {
                    sb.append("severity: ").append(severity).append('\n');
                }
                if (included.contains("dataTypes")) {
                    sb.append("dataTypes: ").append(dataType).append('\n');
                }
                if (included.contains("definition")) {
                    sb.append("definition: ").append(definition).append('\n');
                }
                // Ensure we always emit at least one key so it's a valid YAML mapping
                // (not empty, which would trigger a different error path)
                if (sb.isEmpty()) {
                    sb.append("irrelevant_key: some_value\n");
                }
                return sb.toString();
            });
    }

    /**
     * Generates syntactically invalid YAML that will fail parsing by SnakeYAML.
     * Uses unbalanced braces, tabs in wrong places, invalid indentation, etc.
     */
    @Provide
    Arbitrary<String> unparseableYaml() {
        return Arbitraries.of(
            "name: [unclosed bracket",
            ":\n  :\n    :\n      - {broken",
            "key: value\n  bad indent: {\n}",
            "---\n- item\nkey: value\n  nested: {incomplete",
            "name: \"unterminated string\n  severity: high",
            "{{{{",
            "key: *undefined_anchor",
            "a:\n\tb: c\n d: e"  // mixed tabs and spaces
        );
    }
}
