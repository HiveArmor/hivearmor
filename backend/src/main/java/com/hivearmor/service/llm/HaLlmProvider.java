package com.hivearmor.service.llm;

import java.util.List;
import reactor.core.publisher.Flux;

/**
 * Pluggable LLM provider abstraction for the HiveArmor platform.
 *
 * <p>All LLM backends ({@code disabled}, {@code openai}, {@code azure}, {@code ollama})
 * implement this interface. {@code HaLlmService} holds an
 * {@code AtomicReference<HaLlmProvider>} and delegates every call to the currently
 * active implementation, enabling hot-reload on configuration change without a JVM
 * restart.
 *
 * <p>Implementations are Spring {@code @Component}s and are resolved at runtime by
 * {@code ProviderRegistry} using the string returned from {@link #providerName()}.
 *
 * <h3>Security invariant</h3>
 * All implementations MUST live under the {@code com.hivearmor} package root. No
 * implementation may contain hardcoded API keys, credentials, or secrets — these
 * MUST be read from the {@code hive_configuration_parameter} table or environment
 * variables. No implementation may configure TLS with
 * {@code InsecureSkipVerify} or an equivalent trust-all mechanism.
 *
 * <p>Requirements: 1.1, 1.2, 9.1
 */
public interface HaLlmProvider {

    /**
     * Performs a synchronous, blocking chat completion and returns the full response.
     *
     * @param messages the conversation history; must not be {@code null} or empty
     * @param options  generation options; fields may be {@code null} to use provider defaults
     * @return the LLM's text response; never {@code null}
     * @throws com.hivearmor.service.llm.LlmNotConfiguredException if the provider is
     *         not configured or is the disabled stub
     */
    String chat(List<ChatMessage> messages, ChatOptions options);

    /**
     * Returns a backpressure-friendly reactive stream of token deltas.
     *
     * <p>Each emission is a partial text token. The {@link Flux} completes normally
     * when the provider signals the end of the response, and completes with an error
     * on any transport or parse failure.
     *
     * @param messages the conversation history; must not be {@code null} or empty
     * @param options  generation options; fields may be {@code null} to use provider defaults
     * @return a non-null {@link Flux} of text deltas; the Flux itself is never null,
     *         but it may immediately terminate with
     *         {@link com.hivearmor.service.llm.LlmNotConfiguredException} when the
     *         provider is the disabled stub
     */
    Flux<String> streamChat(List<ChatMessage> messages, ChatOptions options);

    /**
     * Returns {@code true} when this provider has a valid configuration and is ready
     * to accept calls.
     *
     * <p>Implementations are permitted to probe the upstream endpoint to determine
     * health; they SHOULD cache the result for a short duration to avoid hammering the
     * upstream on every check.
     *
     * @return {@code true} if configured and healthy; {@code false} otherwise
     */
    boolean isConfigured();

    /**
     * Returns the stable, lowercase identifier for this provider.
     *
     * <p>The return value MUST be one of {@code "disabled"}, {@code "openai"},
     * {@code "azure"}, or {@code "ollama"} — this string is used as the key in
     * {@code ProviderRegistry} and is stored in the {@code hive_configuration_parameter}
     * table under {@code LLM_PROVIDER}.
     *
     * @return the provider identifier; never {@code null} or blank
     */
    String providerName();
}
