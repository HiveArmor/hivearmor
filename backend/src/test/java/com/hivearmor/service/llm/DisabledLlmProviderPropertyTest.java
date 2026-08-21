package com.hivearmor.service.llm;

import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Property-based test for {@link DisabledLlmProvider}.
 *
 * <p><strong>Property 2: Disabled provider rejects every chat call</strong><br>
 * <strong>Validates: Requirements 1.4, 8.1</strong>
 *
 * <p>For any list of {@link ChatMessage} values and any {@link ChatOptions},
 * {@link DisabledLlmProvider#chat(List, ChatOptions)} SHALL throw
 * {@link LlmNotConfiguredException}, and
 * {@link DisabledLlmProvider#streamChat(List, ChatOptions)} SHALL return a
 * {@link Flux} that terminates with {@link LlmNotConfiguredException}.
 * {@link DisabledLlmProvider#isConfigured()} SHALL return {@code false} for
 * every invocation.
 *
 * <h2>Test strategy</h2>
 * <p>Three sub-properties are verified across arbitrary generated inputs:
 * <ol>
 *   <li><strong>2-A</strong> — {@code chat(...)} throws {@link LlmNotConfiguredException}
 *       for any non-empty {@link ChatMessage} list and any {@link ChatOptions}.</li>
 *   <li><strong>2-B</strong> — {@code streamChat(...)} returns a non-null {@link Flux}
 *       whose terminal signal is an error of type {@link LlmNotConfiguredException}.
 *       Verified by subscribing and capturing the {@code onError} signal via
 *       {@link Flux#blockFirst()} with error handling, avoiding any dependency on
 *       {@code reactor-test}.</li>
 *   <li><strong>2-C</strong> — {@code isConfigured()} always returns {@code false},
 *       regardless of how many times it is called.</li>
 * </ol>
 *
 * <p>The provider under test has no external dependencies and is instantiated
 * directly — no Spring context is needed.
 */
@Label("Feature: sprint-27-ollama, Property 2: Disabled provider rejects every chat call")
class DisabledLlmProviderPropertyTest {

    private DisabledLlmProvider provider;

    /**
     * Re-creates the provider before every jqwik trial so each property method
     * starts from a clean, isolated instance.
     */
    @BeforeTry
    void setUp() {
        provider = new DisabledLlmProvider();
    }

    // =========================================================================
    // Property 2-A: chat(...) always throws LlmNotConfiguredException
    // =========================================================================

    /**
     * <strong>Property 2-A: {@code chat} throws {@link LlmNotConfiguredException}
     * for every input combination</strong>
     *
     * <p>For any list of {@link ChatMessage} values and any {@link ChatOptions},
     * {@link DisabledLlmProvider#chat(List, ChatOptions)} must throw
     * {@link LlmNotConfiguredException}. The exception message must contain
     * the provider name {@code "disabled"}.
     *
     * <p><strong>Validates: Requirements 1.4, 8.1</strong>
     */
    @Property(tries = 100)
    @Label("Property 2-A: chat always throws LlmNotConfiguredException")
    void property2a_chat_alwaysThrowsLlmNotConfiguredException(
            @ForAll("chatMessages") List<ChatMessage> messages,
            @ForAll("chatOptions") ChatOptions options) {

        assertThatThrownBy(() -> provider.chat(messages, options))
            .as("DisabledLlmProvider.chat must always throw LlmNotConfiguredException "
                + "for messages=%s, options=%s", messages, options)
            .isInstanceOf(LlmNotConfiguredException.class)
            .hasMessageContaining("disabled");
    }

    // =========================================================================
    // Property 2-B: streamChat(...) returns a Flux that terminates with error
    // =========================================================================

    /**
     * <strong>Property 2-B: {@code streamChat} returns a {@link Flux} that
     * terminates with {@link LlmNotConfiguredException}</strong>
     *
     * <p>For any list of {@link ChatMessage} values and any {@link ChatOptions},
     * {@link DisabledLlmProvider#streamChat(List, ChatOptions)} must return a
     * non-null {@link Flux} whose terminal signal is an error of type
     * {@link LlmNotConfiguredException}. The error is carried as a reactive
     * terminal signal (not thrown eagerly), so subscription is required to observe it.
     *
     * <p>The terminal error is captured by subscribing with an {@code onError}
     * handler and blocking until completion. No {@code reactor-test} dependency is
     * required — {@link Flux#onErrorResume(java.util.function.Function)} re-emits the
     * error into a captured {@link AtomicReference} before completing normally.
     *
     * <p><strong>Validates: Requirements 1.4, 8.1</strong>
     */
    @Property(tries = 100)
    @Label("Property 2-B: streamChat returns Flux terminating with LlmNotConfiguredException")
    void property2b_streamChat_fluxTerminatesWithLlmNotConfiguredException(
            @ForAll("chatMessages") List<ChatMessage> messages,
            @ForAll("chatOptions") ChatOptions options) {

        Flux<String> flux = provider.streamChat(messages, options);

        assertThat(flux)
            .as("DisabledLlmProvider.streamChat must return a non-null Flux")
            .isNotNull();

        // Capture the terminal error by subscribing. Flux.error(...) emits no items
        // and signals onError immediately, so onErrorResume captures it and completes
        // the stream normally, allowing .blockLast() to return without throwing.
        AtomicReference<Throwable> capturedError = new AtomicReference<>();
        flux.onErrorResume(ex -> {
            capturedError.set(ex);
            return Flux.empty();
        }).blockLast();

        Throwable error = capturedError.get();
        assertThat(error)
            .as("streamChat Flux must terminate with a non-null error signal for "
                + "messages=%s, options=%s", messages, options)
            .isNotNull();
        assertThat(error)
            .as("streamChat Flux terminal error must be LlmNotConfiguredException")
            .isInstanceOf(LlmNotConfiguredException.class);
        assertThat(error.getMessage())
            .as("LlmNotConfiguredException message must contain provider name 'disabled'")
            .contains("disabled");
    }

    // =========================================================================
    // Property 2-C: isConfigured() always returns false
    // =========================================================================

    /**
     * <strong>Property 2-C: {@code isConfigured} always returns {@code false}</strong>
     *
     * <p>For any number of consecutive calls to {@link DisabledLlmProvider#isConfigured()},
     * the result must always be {@code false}. This property verifies the invariant
     * holds across repeated invocations (1 to 10 calls per trial).
     *
     * <p><strong>Validates: Requirements 1.4, 8.1</strong>
     */
    @Property(tries = 100)
    @Label("Property 2-C: isConfigured always returns false")
    void property2c_isConfigured_alwaysReturnsFalse(
            @ForAll("invocationCounts") int invocations) {

        for (int i = 0; i < invocations; i++) {
            assertThat(provider.isConfigured())
                .as("DisabledLlmProvider.isConfigured() must return false on invocation %d of %d",
                    i + 1, invocations)
                .isFalse();
        }
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates lists of {@link ChatMessage} values with arbitrary roles and content.
     * Lists have between 1 and 10 elements. Roles are drawn from the OpenAI convention
     * ({@code system}, {@code user}, {@code assistant}) to match valid real-world inputs.
     */
    @Provide
    Arbitrary<List<ChatMessage>> chatMessages() {
        Arbitrary<String> roles = Arbitraries.of("system", "user", "assistant");
        Arbitrary<String> contents = Arbitraries.strings().ofMinLength(0).ofMaxLength(200);
        Arbitrary<ChatMessage> message = Combinators.combine(roles, contents)
            .as(ChatMessage::new);
        return message.list().ofMinSize(1).ofMaxSize(10);
    }

    /**
     * Generates {@link ChatOptions} with nullable model, temperature, and maxTokens.
     * Covers the full range of valid and null values since {@code DisabledLlmProvider}
     * must reject all inputs unconditionally.
     */
    @Provide
    Arbitrary<ChatOptions> chatOptions() {
        Arbitrary<String> model = Arbitraries.strings()
            .ofMinLength(1).ofMaxLength(64)
            .injectNull(0.2);
        Arbitrary<Double> temperature = Arbitraries.doubles()
            .between(0.0, 2.0)
            .injectNull(0.2);
        Arbitrary<Integer> maxTokens = Arbitraries.integers()
            .between(1, 32768)
            .injectNull(0.2);
        return Combinators.combine(model, temperature, maxTokens)
            .as(ChatOptions::new);
    }

    /**
     * Generates invocation counts between 1 and 10 (inclusive) for repeated
     * {@code isConfigured()} calls.
     */
    @Provide
    Arbitrary<Integer> invocationCounts() {
        return Arbitraries.integers().between(1, 10);
    }
}
