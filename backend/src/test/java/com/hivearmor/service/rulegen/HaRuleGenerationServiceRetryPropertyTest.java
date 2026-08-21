package com.hivearmor.service.rulegen;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.rulegen.HaRuleGenSession;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.repository.rulegen.HaRuleGenSessionRepository;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.service.rulegen.dto.GenerateRequest;
import com.hivearmor.service.rulegen.dto.SignalGroup;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;

import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * Property-based test for retry-once semantics in rule generation.
 *
 * <p><strong>Property 4: Exactly one retry on invalid YAML</strong><br>
 * For any sequence of {@code HaLlmService.chat} responses, {@code generateRuleSuggestion}
 * calls {@code chat} at most twice; if the second response is also invalid, it fails;
 * if either response is valid, it succeeds without a third call.
 *
 * <p><strong>Validates: Requirements 3.3</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 4: Exactly one retry on invalid YAML")
class HaRuleGenerationServiceRetryPropertyTest {

    /** A valid YAML response containing all four required top-level keys. */
    private static final String VALID_YAML_TEMPLATE =
        "name: %s\nseverity: high\ndataTypes:\n  - firewall\ndefinition: rule body";

    // =========================================================================
    // Property assertions
    // =========================================================================

    /**
     * Property 4.1: chat() is called at most 2 times.
     *
     * <p>Regardless of what the LLM returns (valid or invalid), the method never
     * calls chat more than twice for a single invocation of generateRuleSuggestion.
     *
     * <p><strong>Validates: Requirement 3.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 4.1: chat() is called at most 2 times")
    void chatCalledAtMostTwice(
            @ForAll("yamlResponseSequences") List<String> responses) throws Exception {

        AtomicInteger callCount = new AtomicInteger(0);
        HaLlmService llmService = mock(HaLlmService.class);
        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenAnswer(invocation -> {
                int idx = callCount.getAndIncrement();
                return idx < responses.size() ? responses.get(idx) : "";
            });

        HaRuleGenerationService service = buildService(llmService);

        try {
            service.generateRuleSuggestion(new GenerateRequest("test-signal", 1L));
        } catch (RuleGenerationException ignored) {
            // Expected when all responses are invalid
        }

        assertThat(callCount.get())
            .as("chat() must be called at most 2 times")
            .isLessThanOrEqualTo(2);
    }

    /**
     * Property 4.2: If the first response is valid YAML with all required keys,
     * chat() is called exactly once.
     *
     * <p><strong>Validates: Requirement 3.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 4.2: Valid first response => chat() called exactly once")
    void validFirstResponseMeansOneCall(
            @ForAll("ruleNames") String ruleName) throws Exception {

        String validYaml = String.format(VALID_YAML_TEMPLATE, ruleName);

        AtomicInteger callCount = new AtomicInteger(0);
        HaLlmService llmService = mock(HaLlmService.class);
        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenAnswer(invocation -> {
                callCount.incrementAndGet();
                return validYaml;
            });

        HaRuleGenerationService service = buildService(llmService);
        service.generateRuleSuggestion(new GenerateRequest("test-signal", 1L));

        assertThat(callCount.get())
            .as("When first response is valid, chat() must be called exactly once")
            .isEqualTo(1);
    }

    /**
     * Property 4.3: If first is invalid but second is valid, chat() is called exactly
     * twice and the method succeeds.
     *
     * <p><strong>Validates: Requirement 3.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 4.3: Invalid first + valid second => chat() called exactly twice, method succeeds")
    void invalidFirstValidSecondMeansTwoCallsAndSuccess(
            @ForAll("invalidYamlResponses") String invalidFirst,
            @ForAll("ruleNames") String ruleName) throws Exception {

        String validYaml = String.format(VALID_YAML_TEMPLATE, ruleName);

        AtomicInteger callCount = new AtomicInteger(0);
        HaLlmService llmService = mock(HaLlmService.class);
        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenAnswer(invocation -> {
                int idx = callCount.getAndIncrement();
                return idx == 0 ? invalidFirst : validYaml;
            });

        HaRuleGenerationService service = buildService(llmService);
        var result = service.generateRuleSuggestion(new GenerateRequest("test-signal", 1L));

        assertThat(callCount.get())
            .as("When first is invalid and second is valid, chat() must be called exactly twice")
            .isEqualTo(2);

        assertThat(result).isNotNull();
        assertThat(result.status()).isEqualTo("pending_review");
    }

    /**
     * Property 4.4: If both responses are invalid, chat() is called exactly twice
     * and the method throws RuleGenerationException.
     *
     * <p><strong>Validates: Requirement 3.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 4.4: Both invalid => chat() called exactly twice, method throws RuleGenerationException")
    void bothInvalidMeansTwoCallsAndFailure(
            @ForAll("invalidYamlResponses") String invalidFirst,
            @ForAll("invalidYamlResponses") String invalidSecond) throws Exception {

        AtomicInteger callCount = new AtomicInteger(0);
        HaLlmService llmService = mock(HaLlmService.class);
        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenAnswer(invocation -> {
                int idx = callCount.getAndIncrement();
                return idx == 0 ? invalidFirst : invalidSecond;
            });

        HaRuleGenerationService service = buildService(llmService);

        assertThatThrownBy(() ->
            service.generateRuleSuggestion(new GenerateRequest("test-signal", 1L))
        ).isInstanceOf(RuleGenerationException.class);

        assertThat(callCount.get())
            .as("When both responses are invalid, chat() must be called exactly twice")
            .isEqualTo(2);
    }

    // =========================================================================
    // Helper — builds a service with mocked dependencies
    // =========================================================================

    private HaRuleGenerationService buildService(HaLlmService llmService) throws Exception {
        HaAlertSignalRepository signalRepo = mock(HaAlertSignalRepository.class);
        HaRuleGenSessionRepository sessionRepo = mock(HaRuleGenSessionRepository.class);
        Clock clock = Clock.fixed(Instant.parse("2026-07-25T12:00:00Z"), ZoneOffset.UTC);

        // Return an empty signal group list so prompt building doesn't fail
        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(
                new SignalGroup("firewall", com.hivearmor.domain.rulegen.HaAlertSignal.SignalType.TRUE_POSITIVE,
                    5, Instant.now(), Instant.now())
            ));

        // Mock sessionRepo.save to return the entity with a generated ID
        when(sessionRepo.save(any(HaRuleGenSession.class))).thenAnswer(invocation -> {
            HaRuleGenSession session = invocation.getArgument(0);
            session.setId(1L);
            return session;
        });

        HaRuleGenerationService service = new HaRuleGenerationService(
            signalRepo, sessionRepo, llmService, clock);

        // Inject outputDir via reflection (not needed for generateRuleSuggestion but
        // avoids NPE if the field is dereferenced during initialization)
        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, "/tmp/test-rules");

        return service;
    }

    // =========================================================================
    // Generators
    // =========================================================================

    /**
     * Generates a sequence of 1-3 YAML response strings (mix of valid and invalid).
     * The service will only ever use at most 2, but we provide up to 3 to prove the
     * third is never consumed.
     */
    @Provide
    Arbitrary<List<String>> yamlResponseSequences() {
        Arbitrary<String> responses = Arbitraries.oneOf(validYamlArbitrary(), invalidYamlArbitrary());
        return responses.list().ofMinSize(1).ofMaxSize(3);
    }

    /**
     * Generates rule names: alphanumeric + spaces/underscores, 1-50 chars.
     * Used to construct valid YAML documents.
     */
    @Provide
    Arbitrary<String> ruleNames() {
        return Arbitraries.strings()
            .withCharRange('a', 'z')
            .withCharRange('A', 'Z')
            .withCharRange('0', '9')
            .withChars('_', ' ')
            .ofMinLength(1)
            .ofMaxLength(50)
            .filter(s -> !s.isBlank());
    }

    /**
     * Generates invalid YAML responses: missing keys, parse errors, empty strings.
     */
    @Provide
    Arbitrary<String> invalidYamlResponses() {
        return Arbitraries.oneOf(
            // Empty string
            Arbitraries.just(""),
            // Not YAML at all — random gibberish
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .withChars('{', '}', '[', ']', ':', '!', '@', '#')
                .ofMinLength(5)
                .ofMaxLength(100),
            // Valid YAML but missing required keys (only has 'name')
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .ofMinLength(1)
                .ofMaxLength(30)
                .map(name -> "name: " + name + "\nother_key: value"),
            // Valid YAML but missing 'definition' key
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .ofMinLength(1)
                .ofMaxLength(30)
                .map(name -> "name: " + name + "\nseverity: high\ndataTypes:\n  - firewall"),
            // Valid YAML but missing 'name' key
            Arbitraries.just("severity: high\ndataTypes:\n  - firewall\ndefinition: body"),
            // Valid YAML but missing 'severity' key
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .ofMinLength(1)
                .ofMaxLength(30)
                .map(name -> "name: " + name + "\ndataTypes:\n  - firewall\ndefinition: body"),
            // Unparseable YAML (invalid indentation / structure)
            Arbitraries.just(":\n  - [invalid:\n    broken: {")
        );
    }

    /**
     * Generates valid YAML strings containing all four required keys.
     */
    private Arbitrary<String> validYamlArbitrary() {
        return ruleNames().map(name -> String.format(VALID_YAML_TEMPLATE, name));
    }

    /**
     * Generates invalid YAML strings.
     */
    private Arbitrary<String> invalidYamlArbitrary() {
        return invalidYamlResponses();
    }
}
