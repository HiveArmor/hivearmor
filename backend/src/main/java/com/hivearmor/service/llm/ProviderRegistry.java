package com.hivearmor.service.llm;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Spring helper that resolves an {@link HaLlmProvider} by its stable string name.
 *
 * <p>Spring injects every {@code @Component} that implements {@link HaLlmProvider}
 * as a {@code List<HaLlmProvider>}. The registry indexes them by
 * {@link HaLlmProvider#providerName()} at construction time so lookups are O(1).
 *
 * <p>The four known provider names are:
 * <ul>
 *   <li>{@code "disabled"} — {@link DisabledLlmProvider}</li>
 *   <li>{@code "openai"} — {@link OpenAiLlmProvider}</li>
 *   <li>{@code "azure"} — {@link AzureOpenAiLlmProvider}</li>
 *   <li>{@code "ollama"} — {@link OllamaLlmProvider}</li>
 * </ul>
 *
 * <p>Usage inside {@code HaLlmService.reload()}:
 * <pre>{@code
 * HaLlmProvider next = registry.forName(configuredName)
 *                               .orElseGet(registry::disabled);
 * }</pre>
 *
 * <p>Requirements: 2.1, 2.2
 */
@Slf4j
@Component
public class ProviderRegistry {

    private final Map<String, HaLlmProvider> byName;
    private final DisabledLlmProvider disabledProvider;

    /**
     * Builds the name-to-provider index from all {@link HaLlmProvider} beans registered
     * in the Spring application context.
     *
     * @param providers all {@link HaLlmProvider} implementations discovered by Spring;
     *                  must include at least one {@link DisabledLlmProvider}
     * @throws IllegalStateException if no {@link DisabledLlmProvider} bean is present
     */
    public ProviderRegistry(List<HaLlmProvider> providers) {
        this.byName = providers.stream()
            .collect(Collectors.toMap(
                HaLlmProvider::providerName,
                Function.identity(),
                (a, b) -> {
                    log.warn("ProviderRegistry: duplicate provider name '{}' — keeping {}",
                        a.providerName(), a.getClass().getSimpleName());
                    return a;
                }
            ));

        log.info("ProviderRegistry: registered providers — {}", byName.keySet());

        this.disabledProvider = providers.stream()
            .filter(DisabledLlmProvider.class::isInstance)
            .map(DisabledLlmProvider.class::cast)
            .findFirst()
            .orElseThrow(() -> new IllegalStateException(
                "ProviderRegistry: no DisabledLlmProvider bean found in application context"));
    }

    /**
     * Resolves a provider by its stable {@link HaLlmProvider#providerName() name}.
     *
     * <p>Returns {@link Optional#empty()} for any name that is {@code null}, blank,
     * or not registered — callers should fall back to {@link #disabled()} in that case.
     *
     * @param name provider name to look up (e.g. {@code "ollama"})
     * @return an {@link Optional} containing the matching provider, or empty if not found
     */
    public Optional<HaLlmProvider> forName(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        HaLlmProvider provider = byName.get(name.trim());
        if (provider == null) {
            log.warn("ProviderRegistry: unknown provider name '{}' — will fall back to disabled", name);
        }
        return Optional.ofNullable(provider);
    }

    /**
     * Returns the {@link DisabledLlmProvider} bean — the terminal fallback used
     * when the configured provider name is absent, blank, or unknown.
     *
     * @return the {@link DisabledLlmProvider}; never {@code null}
     */
    public HaLlmProvider disabled() {
        return disabledProvider;
    }
}
