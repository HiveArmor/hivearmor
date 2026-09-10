package com.hivearmor.service.llm;

import net.jqwik.api.Example;
import net.jqwik.api.Label;
import net.jqwik.api.lifecycle.BeforeTry;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ProviderRegistry}.
 *
 * <p>Covers {@link ProviderRegistry#forName(String)} for all four known provider
 * names, the null / blank / unknown fallback path, and {@link ProviderRegistry#disabled()}.
 *
 * <p>Tests live in {@code src/main/java/} per the project convention (no
 * {@code src/test/} directory).
 *
 * <p>Requirements: 2.1, 2.2
 */
@Label("Feature: sprint-27-ollama, Task 1.14 — ProviderRegistry unit tests")
class ProviderRegistryTest {

    // -------------------------------------------------------------------------
    // Test fixtures — re-created before every jqwik trial
    // -------------------------------------------------------------------------

    private DisabledLlmProvider    disabledProvider;
    private OpenAiLlmProvider      openAiProvider;
    private AzureOpenAiLlmProvider azureProvider;
    private OllamaLlmProvider      ollamaProvider;
    private ProviderRegistry       registry;

    /**
     * Constructs a fresh set of mocked providers and a real {@link ProviderRegistry}
     * before every test so no state leaks between examples.
     */
    @BeforeTry
    void setUp() {
        disabledProvider = mock(DisabledLlmProvider.class);
        when(disabledProvider.providerName()).thenReturn("disabled");

        openAiProvider = mock(OpenAiLlmProvider.class);
        when(openAiProvider.providerName()).thenReturn("openai");

        azureProvider = mock(AzureOpenAiLlmProvider.class);
        when(azureProvider.providerName()).thenReturn("azure");

        ollamaProvider = mock(OllamaLlmProvider.class);
        when(ollamaProvider.providerName()).thenReturn("ollama");

        registry = new ProviderRegistry(
            List.of(disabledProvider, openAiProvider, azureProvider, ollamaProvider)
        );
    }

    // =========================================================================
    // forName — known provider names
    // =========================================================================

    /**
     * {@code forName("disabled")} must resolve to the {@link DisabledLlmProvider} bean.
     */
    @Example
    @Label("forName('disabled') resolves to DisabledLlmProvider")
    void forName_disabled_returnsDisabledProvider() {
        Optional<HaLlmProvider> result = registry.forName("disabled");

        assertThat(result)
            .as("forName('disabled') must return a non-empty Optional")
            .isPresent();
        assertThat(result.get())
            .as("forName('disabled') must return the DisabledLlmProvider instance")
            .isSameAs(disabledProvider);
    }

    /**
     * {@code forName("openai")} must resolve to the {@link OpenAiLlmProvider} bean.
     */
    @Example
    @Label("forName('openai') resolves to OpenAiLlmProvider")
    void forName_openai_returnsOpenAiProvider() {
        Optional<HaLlmProvider> result = registry.forName("openai");

        assertThat(result)
            .as("forName('openai') must return a non-empty Optional")
            .isPresent();
        assertThat(result.get())
            .as("forName('openai') must return the OpenAiLlmProvider instance")
            .isSameAs(openAiProvider);
    }

    /**
     * {@code forName("azure")} must resolve to the {@link AzureOpenAiLlmProvider} bean.
     */
    @Example
    @Label("forName('azure') resolves to AzureOpenAiLlmProvider")
    void forName_azure_returnsAzureProvider() {
        Optional<HaLlmProvider> result = registry.forName("azure");

        assertThat(result)
            .as("forName('azure') must return a non-empty Optional")
            .isPresent();
        assertThat(result.get())
            .as("forName('azure') must return the AzureOpenAiLlmProvider instance")
            .isSameAs(azureProvider);
    }

    /**
     * {@code forName("ollama")} must resolve to the {@link OllamaLlmProvider} bean.
     */
    @Example
    @Label("forName('ollama') resolves to OllamaLlmProvider")
    void forName_ollama_returnsOllamaProvider() {
        Optional<HaLlmProvider> result = registry.forName("ollama");

        assertThat(result)
            .as("forName('ollama') must return a non-empty Optional")
            .isPresent();
        assertThat(result.get())
            .as("forName('ollama') must return the OllamaLlmProvider instance")
            .isSameAs(ollamaProvider);
    }

    // =========================================================================
    // forName — fallback cases (null, blank, unknown)
    // =========================================================================

    /**
     * {@code forName(null)} must return {@link Optional#empty()}.
     *
     * <p>Callers that receive empty are expected to call {@link ProviderRegistry#disabled()}
     * as the terminal fallback (Requirement 2.2).
     */
    @Example
    @Label("forName(null) returns Optional.empty()")
    void forName_null_returnsEmpty() {
        Optional<HaLlmProvider> result = registry.forName(null);

        assertThat(result)
            .as("forName(null) must return Optional.empty()")
            .isEmpty();
    }

    /**
     * {@code forName("")} must return {@link Optional#empty()}.
     */
    @Example
    @Label("forName('') returns Optional.empty()")
    void forName_emptyString_returnsEmpty() {
        Optional<HaLlmProvider> result = registry.forName("");

        assertThat(result)
            .as("forName('') must return Optional.empty()")
            .isEmpty();
    }

    /**
     * {@code forName("unknown")} — a name that is not registered — must return
     * {@link Optional#empty()}.
     */
    @Example
    @Label("forName('unknown') returns Optional.empty()")
    void forName_unknownName_returnsEmpty() {
        Optional<HaLlmProvider> result = registry.forName("unknown");

        assertThat(result)
            .as("forName('unknown') must return Optional.empty()")
            .isEmpty();
    }

    // =========================================================================
    // disabled()
    // =========================================================================

    /**
     * {@link ProviderRegistry#disabled()} must return the same
     * {@link DisabledLlmProvider} instance that was passed to the constructor.
     */
    @Example
    @Label("disabled() returns the DisabledLlmProvider bean")
    void disabled_returnsDisabledProviderBean() {
        HaLlmProvider result = registry.disabled();

        assertThat(result)
            .as("disabled() must return the DisabledLlmProvider bean")
            .isSameAs(disabledProvider);
    }
}
