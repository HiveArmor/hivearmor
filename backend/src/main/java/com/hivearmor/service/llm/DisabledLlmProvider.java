package com.hivearmor.service.llm;

import java.util.List;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

/**
 * Stub {@link HaLlmProvider} that is active when no LLM backend has been configured.
 *
 * <p>Every chat call immediately fails with {@link LlmNotConfiguredException} so that
 * callers receive a deterministic HTTP 503 rather than a silent no-op. The provider
 * never reports itself as configured ({@link #isConfigured()} always returns
 * {@code false}), which lets the admin surface and health checks signal the degraded
 * state accurately.
 *
 * <p>This bean is always registered in the Spring context. {@code ProviderRegistry}
 * uses it as the terminal fallback when the configured provider name is absent,
 * empty, or unknown.
 *
 * <p>Requirements: 1.4, 1.5, 8.1
 */
@Component
public class DisabledLlmProvider implements HaLlmProvider {

    /**
     * Always throws {@link LlmNotConfiguredException} — no LLM is configured.
     *
     * @throws LlmNotConfiguredException unconditionally
     */
    @Override
    public String chat(List<ChatMessage> messages, ChatOptions options) {
        throw new LlmNotConfiguredException("disabled");
    }

    /**
     * Returns a {@link Flux} that immediately terminates with
     * {@link LlmNotConfiguredException} — no LLM is configured.
     *
     * @return a non-null {@link Flux} that carries the exception as a terminal signal
     */
    @Override
    public Flux<String> streamChat(List<ChatMessage> messages, ChatOptions options) {
        return Flux.error(new LlmNotConfiguredException("disabled"));
    }

    /**
     * Returns {@code false} unconditionally — the disabled stub is never configured.
     */
    @Override
    public boolean isConfigured() {
        return false;
    }

    /**
     * Returns the stable provider identifier {@code "disabled"}.
     */
    @Override
    public String providerName() {
        return "disabled";
    }
}
