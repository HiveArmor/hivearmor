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

import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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
 * <p><strong>Validates: Requirement 3.3</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 4: Exactly one retry on invalid YAML")
class RuleGenRetryPropertyTest {

    /** A valid YAML template containing all four required top-level keys. */
    private static final String VALID_YAML_TEMPLATE =
        "name: %s\nseverity: high\ndataTypes:\n  - linux\ndefinition: rule_def";

    private HaAlertSignalRepository signalRepo;
    private HaRuleGenSessionRepository sessionRepo;
    private HaLlmService llmService;
    private Clock fixedClock;
    private HaRuleGenerationService service;

    @BeforeTry
    void setUp() throws Exception {
        signalRepo = mock(HaAlertSignalRepository.class);
        sessionRepo = mock(HaRuleGenSessionRepository.class);
        llmService = mock(HaLlmService.class);
        fixedClock = Clock.fixed(Instant.parse("2026-07-25T10:00:00Z"), ZoneOffset.UTC);

        service = new HaRuleGenerationService(signalRepo, sessionRepo, llmService, fixedClock);

        // Set the outputDir field via reflection (it's @Value injected)
        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, "/tmp/test-rules");

        // Mock signalRepo.findSignalGroupsWithMinCount to return a non-empty list
        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(
                new SignalGroup("linux", HaAlertSignal.SignalType.TRUE_POSITIVE,
                    5, Instant.now(), Instant.now())
            ));

        // Mock sessionRepo.save to return the argument with an ID set
        when(sessionRepo.save(any(HaRuleGenSession.class))).thenAnswer(invocation -> {
            HaRuleGenSession session = invocation.getArgument(0);
            session.setId(1L);
            return session;
        });
    }

    // =========================================================================
    // Property 4.1: chat() is called at most 2 times
    // =========================================================================

    /**
     * For any sequence of LLM responses (valid or invalid), {@code chat()} is never
     * called more than twice per invocation of {@code generateRuleSuggestion}.
     *
     * <p><strong>Validates: Requirement 3.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 4.1: chat() is called at most 2 times regardless of response content")
    void chatCalledAtMostTwice(
            @ForAll("anyYamlResponseSequence") List<String> responses) {

        AtomicInteger callCount = new AtomicInteger(0);
        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenAnswer(invocation -> {
                int idx = callCount.getAndIncrement();
                return idx < responses.size() ? responses.get(idx) : "";
            });

        try {
            service.generateRuleSuggestion(new GenerateRequest("test-signal", 1L));
        } catch (RuleGenerationException ignored) {
            // Expected when all responses are invalid
        }

        assertThat(callCount.get())
            .as("chat() must be called at most 2 times")
            .isLessThanOrEqualTo(2);
    }

    // =========================================================================
    // Property 4.2: Valid first response => exactly 1 call, success
    // =========================================================================

    /**
     * If the first {@code chat()} response is valid YAML with all required keys,
     * only one call is made and the method succeeds with a pending_review session.
     *
     * <p><strong>Validates: Requirement 3.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 4.2: Valid first response => exactly 1 chat call, success")
    void validFirstResponseOnlyOneCall(@ForAll("ruleNames") String ruleName) {
        String validYaml = String.format(VALID_YAML_TEMPLATE, ruleName);

        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenReturn(validYaml);

        var result = service.generateRuleSuggestion(new GenerateRequest("test-signal", 1L));

        assertThat(result).isNotNull();
        assertThat(result.status()).isEqualTo("pending_review");
        verify(llmService, times(1)).chat(any(List.class), any(ChatOptions.class));
    }

    // =========================================================================
    // Property 4.3: Invalid first + valid second => exactly 2 calls, success
    // =========================================================================

    /**
     * If the first response is invalid but the second is valid, {@code chat()} is
     * called exactly twice and the method succeeds.
     *
     * <p><strong>Validates: Requirement 3.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 4.3: Invalid first + valid second => exactly 2 calls, success")
    void invalidFirstValidSecondTwoCallsSuccess(
            @ForAll("invalidYamlResponses") String invalidFirst,
            @ForAll("ruleNames") String ruleName) {

        String validYaml = String.format(VALID_YAML_TEMPLATE, ruleName);

        AtomicInteger callCount = new AtomicInteger(0);
        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenAnswer(invocation -> {
                int idx = callCount.getAndIncrement();
                return idx == 0 ? invalidFirst : validYaml;
            });

        var result = service.generateRuleSuggestion(new GenerateRequest("test-signal", 1L));

        assertThat(callCount.get())
            .as("When first is invalid and second is valid, chat() must be called exactly twice")
            .isEqualTo(2);
        assertThat(result).isNotNull();
        assertThat(result.status()).isEqualTo("pending_review");
    }

    // =========================================================================
    // Property 4.4: Both invalid => exactly 2 calls, throws RuleGenerationException
    // =========================================================================

    /**
     * If both responses are invalid, {@code chat()} is called exactly twice and the
     * method throws {@link RuleGenerationException}.
     *
     * <p><strong>Validates: Requirement 3.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 4.4: Both invalid => exactly 2 calls, throws RuleGenerationException")
    void bothInvalidTwoCallsThenFail(
            @ForAll("invalidYamlResponses") String invalidFirst,
            @ForAll("invalidYamlResponses") String invalidSecond) {

        AtomicInteger callCount = new AtomicInteger(0);
        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenAnswer(invocation -> {
                int idx = callCount.getAndIncrement();
                return idx == 0 ? invalidFirst : invalidSecond;
            });

        assertThatThrownBy(() ->
            service.generateRuleSuggestion(new GenerateRequest("test-signal", 1L))
        ).isInstanceOf(RuleGenerationException.class);

        assertThat(callCount.get())
            .as("When both responses are invalid, chat() must be called exactly twice")
            .isEqualTo(2);
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates rule names: alphanumeric + underscores, 1-30 chars.
     * Used to construct valid YAML documents.
     */
    @Provide
    Arbitrary<String> ruleNames() {
        return Arbitraries.strings()
            .withCharRange('a', 'z')
            .withCharRange('0', '9')
            .withChars('_')
            .ofMinLength(1)
            .ofMaxLength(30)
            .filter(s -> !s.isBlank());
    }

    /**
     * Generates invalid YAML responses: missing keys, parse errors, empty strings.
     */
    @Provide
    Arbitrary<String> invalidYamlResponses() {
        return Arbitraries.oneOf(
            // Empty / blank strings
            Arbitraries.of("", "   ", "---\n"),
            // Valid YAML but missing required keys (only has 'name')
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .ofMinLength(1)
                .ofMaxLength(20)
                .map(n -> "name: " + n + "\nother_key: value"),
            // Missing 'definition'
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .ofMinLength(1)
                .ofMaxLength(20)
                .map(n -> "name: " + n + "\nseverity: high\ndataTypes:\n  - linux"),
            // Missing 'name'
            Arbitraries.just("severity: high\ndataTypes:\n  - linux\ndefinition: body"),
            // Missing 'severity'
            Arbitraries.strings()
                .withCharRange('a', 'z')
                .ofMinLength(1)
                .ofMaxLength(20)
                .map(n -> "name: " + n + "\ndataTypes:\n  - linux\ndefinition: body"),
            // Unparseable YAML
            Arbitraries.of(
                "{{not: valid: yaml",
                ":\n  - [[[broken",
                "\t\t:::",
                "key: [unclosed",
                "- - - :\n::"
            )
        );
    }

    /**
     * Generates sequences of 2-4 YAML responses (mix of valid and invalid) to verify
     * the at-most-two-calls invariant holds regardless of what responses are available.
     */
    @Provide
    Arbitrary<List<String>> anyYamlResponseSequence() {
        Arbitrary<String> validYaml = ruleNames()
            .map(n -> String.format(VALID_YAML_TEMPLATE, n));
        Arbitrary<String> anyResponse = Arbitraries.oneOf(validYaml, invalidYamlResponses());
        return anyResponse.list().ofMinSize(2).ofMaxSize(4);
    }
}
