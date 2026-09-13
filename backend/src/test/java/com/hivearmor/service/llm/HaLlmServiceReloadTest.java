package com.hivearmor.service.llm;

import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import net.jqwik.api.Example;
import net.jqwik.api.Label;
import net.jqwik.api.lifecycle.BeforeTry;
import com.hivearmor.ai.HaLlmService;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link HaLlmService#reload()} behaviour — exercised indirectly via the
 * {@code @PostConstruct init()} path that is triggered by the constructor + reflection
 * injection, and via direct event-listener wiring.
 *
 * <p>Because {@code reload()} is {@code private}, each test builds a fully wired
 * {@link HaLlmService} (using its package-accessible constructor) and asserts the
 * resulting {@link HaLlmService#activeProviderName()} value.  Calling the constructor
 * is sufficient: {@link jakarta.annotation.PostConstruct} is <em>not</em> invoked
 * outside a Spring context, so we invoke {@link HaLlmService#activeProviderName()}
 * after publishing a {@link com.hivearmor.service.llm.event.LlmConfigChangedEvent}
 * via {@link HaLlmService#onConfigChanged} to trigger a reload.
 *
 * <p>Strategy for triggering reload without a Spring context:
 * <ol>
 *   <li>Build {@link HaLlmService} — the {@code AtomicReference<HaLlmProvider> active}
 *       is initialised to {@code null} (field initialiser only; {@code @PostConstruct}
 *       is not called outside a container).</li>
 *   <li>Call {@link HaLlmService#onConfigChanged} directly — this is a
 *       {@code public} method that delegates to the private {@code reload()}, which is
 *       exactly what we want to test.</li>
 *   <li>Assert {@link HaLlmService#activeProviderName()} returns the expected provider
 *       name.</li>
 * </ol>
 *
 * <p>Tests live in {@code src/main/java/} per the project convention (no
 * {@code src/test/} directory).
 *
 * <p>Requirements: 2.1, 2.2
 */
@Label("Feature: sprint-27-ollama, Task 1.14 — HaLlmService.reload unit tests")
class HaLlmServiceReloadTest {

    // -------------------------------------------------------------------------
    // Shared mocks — re-created before every trial
    // -------------------------------------------------------------------------

    private UtmConfigurationParameterRepository configRepo;

    private DisabledLlmProvider    disabledProvider;
    private OpenAiLlmProvider      openAiProvider;
    private AzureOpenAiLlmProvider azureProvider;
    private OllamaLlmProvider      ollamaProvider;

    private ProviderRegistry       registry;

    @BeforeTry
    void setUp() {
        configRepo = mock(UtmConfigurationParameterRepository.class);

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
    // Helpers
    // =========================================================================

    /**
     * Creates an {@link HaLlmService} and triggers {@code reload()} by calling
     * {@link HaLlmService#onConfigChanged} — the only public entry point that
     * calls the private {@code reload()} method without a Spring context.
     */
    private HaLlmService buildAndReload() {
        HaLlmService service = new HaLlmService(registry, configRepo);
        service.onConfigChanged(
            new com.hivearmor.service.llm.event.LlmConfigChangedEvent(this)
        );
        return service;
    }

    /**
     * Stubs {@code configRepo.findByConfParamShort("LLM_PROVIDER")} to return
     * a {@link UtmConfigurationParameter} entity whose {@code confParamValue}
     * is {@code value}.
     */
    private void stubProviderRow(String value) {
        UtmConfigurationParameter param = new UtmConfigurationParameter();
        param.setConfParamShort("LLM_PROVIDER");
        param.setConfParamValue(value);
        when(configRepo.findByConfParamShort("LLM_PROVIDER"))
            .thenReturn(Optional.of(param));
    }

    // =========================================================================
    // Fallback to disabled — row absent / empty / null value
    // =========================================================================

    /**
     * When the {@code LLM_PROVIDER} row is absent from the configuration store,
     * {@code reload()} must fall back to {@link DisabledLlmProvider}.
     *
     * <p>Requirements: 2.2
     */
    @Example
    @Label("reload: missing LLM_PROVIDER row → active is DisabledLlmProvider")
    void reload_missingRow_activatesDisabledProvider() {
        when(configRepo.findByConfParamShort("LLM_PROVIDER"))
            .thenReturn(Optional.empty());

        HaLlmService service = buildAndReload();

        assertThat(service.activeProviderName())
            .as("Missing LLM_PROVIDER row must fall back to 'disabled'")
            .isEqualTo("disabled");
    }

    /**
     * When the {@code LLM_PROVIDER} row exists but its value is an empty string,
     * {@code reload()} must fall back to {@link DisabledLlmProvider}.
     *
     * <p>Requirements: 2.2
     */
    @Example
    @Label("reload: LLM_PROVIDER = '' → active is DisabledLlmProvider")
    void reload_emptyValue_activatesDisabledProvider() {
        stubProviderRow("");

        HaLlmService service = buildAndReload();

        assertThat(service.activeProviderName())
            .as("Empty LLM_PROVIDER value must fall back to 'disabled'")
            .isEqualTo("disabled");
    }

    /**
     * When the {@code LLM_PROVIDER} row exists but its value is {@code null},
     * {@code reload()} must fall back to {@link DisabledLlmProvider}.
     *
     * <p>Requirements: 2.2
     */
    @Example
    @Label("reload: LLM_PROVIDER = null → active is DisabledLlmProvider")
    void reload_nullValue_activatesDisabledProvider() {
        stubProviderRow(null);

        HaLlmService service = buildAndReload();

        assertThat(service.activeProviderName())
            .as("Null LLM_PROVIDER value must fall back to 'disabled'")
            .isEqualTo("disabled");
    }

    // =========================================================================
    // Known provider names
    // =========================================================================

    /**
     * When {@code LLM_PROVIDER = "disabled"}, the active provider must be
     * {@link DisabledLlmProvider}.
     *
     * <p>Requirements: 2.1
     */
    @Example
    @Label("reload: LLM_PROVIDER = 'disabled' → active is DisabledLlmProvider")
    void reload_disabled_activatesDisabledProvider() {
        stubProviderRow("disabled");

        HaLlmService service = buildAndReload();

        assertThat(service.activeProviderName())
            .as("LLM_PROVIDER='disabled' must activate the DisabledLlmProvider")
            .isEqualTo("disabled");
    }

    /**
     * When {@code LLM_PROVIDER = "openai"}, the active provider must be
     * {@link OpenAiLlmProvider}.
     *
     * <p>Requirements: 2.1
     */
    @Example
    @Label("reload: LLM_PROVIDER = 'openai' → active is OpenAiLlmProvider")
    void reload_openai_activatesOpenAiProvider() {
        stubProviderRow("openai");

        HaLlmService service = buildAndReload();

        assertThat(service.activeProviderName())
            .as("LLM_PROVIDER='openai' must activate the OpenAiLlmProvider")
            .isEqualTo("openai");
    }

    /**
     * When {@code LLM_PROVIDER = "azure"}, the active provider must be
     * {@link AzureOpenAiLlmProvider}.
     *
     * <p>Requirements: 2.1
     */
    @Example
    @Label("reload: LLM_PROVIDER = 'azure' → active is AzureOpenAiLlmProvider")
    void reload_azure_activatesAzureProvider() {
        stubProviderRow("azure");

        HaLlmService service = buildAndReload();

        assertThat(service.activeProviderName())
            .as("LLM_PROVIDER='azure' must activate the AzureOpenAiLlmProvider")
            .isEqualTo("azure");
    }

    /**
     * When {@code LLM_PROVIDER = "ollama"}, the active provider must be
     * {@link OllamaLlmProvider}.
     *
     * <p>Requirements: 2.1
     */
    @Example
    @Label("reload: LLM_PROVIDER = 'ollama' → active is OllamaLlmProvider")
    void reload_ollama_activatesOllamaProvider() {
        stubProviderRow("ollama");

        HaLlmService service = buildAndReload();

        assertThat(service.activeProviderName())
            .as("LLM_PROVIDER='ollama' must activate the OllamaLlmProvider")
            .isEqualTo("ollama");
    }
}
