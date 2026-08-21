package com.hivearmor.web.rest.admin;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.HaLlmConfigService;
import com.hivearmor.service.dto.admin.LlmStatusDTO;
import com.hivearmor.service.llm.AzureOpenAiLlmProvider;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.service.llm.DisabledLlmProvider;
import com.hivearmor.service.llm.LlmNotConfiguredException;
import com.hivearmor.service.llm.OllamaLlmProvider;
import com.hivearmor.service.llm.OpenAiLlmProvider;
import com.hivearmor.service.llm.ProviderRegistry;
import com.hivearmor.service.llm.event.LlmConfigChangedEvent;
import net.jqwik.api.Example;
import net.jqwik.api.Label;
import net.jqwik.api.Tag;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.context.ApplicationEventPublisher;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Integration test: revert-to-disabled check.
 *
 * <p>Validates that posting {@code provider: disabled} via
 * {@link HaLlmService#onConfigChanged(LlmConfigChangedEvent)} causes:
 * <ol>
 *   <li>{@link HaLlmService#chat} to throw {@link LlmNotConfiguredException}
 *       (HTTP 503 at the controller layer — Requirement 10.6).</li>
 *   <li>{@link HaLlmService#streamChat} to return a {@link reactor.core.publisher.Flux}
 *       that terminates with {@link LlmNotConfiguredException}
 *       (Requirement 8.3 / 10.6).</li>
 *   <li>{@link HaLlmService#isConfigured()} to return {@code false}
 *       (Requirement 8.3).</li>
 *   <li>{@link HaLlmAdminResource#status()} to return a {@link LlmStatusDTO}
 *       with {@code configured() == false} (Requirement 10.6).</li>
 * </ol>
 *
 * <p>Frontend degradation behavior (null-state card, hidden triage panel, panel-level
 * error message) is validated by the component test in:
 * {@code frontend-v3/src/components/ai-chat/AiComponents.503.test.tsx}
 * (Property 13 — Validates: Requirements 8.3, 10.6).
 *
 * <p>Tests live in {@code src/test/java/} to match the project's secondary test location.
 * Mocks replace all Spring infrastructure so no application context is required.
 *
 * <p><strong>Validates: Requirements 10.6, 8.3</strong>
 */
@Label("Feature: sprint-27-ollama, Task 8.8 — Automate revert-to-disabled check")
@Tag("integration")
class Sprint27RevertToDisabledIT {

    // -------------------------------------------------------------------------
    // Shared fixtures — rebuilt before every trial
    // -------------------------------------------------------------------------

    private UtmConfigurationParameterRepository configRepo;

    private DisabledLlmProvider    disabledProvider;
    private OpenAiLlmProvider      openAiProvider;
    private AzureOpenAiLlmProvider azureProvider;
    private OllamaLlmProvider      ollamaProvider;

    private ProviderRegistry       registry;

    /** The service under test — wired with all four provider mocks. */
    private HaLlmService service;

    /** Admin resource wired to the same service under test. */
    private HaLlmAdminResource adminResource;

    @BeforeTry
    void setUp() {
        configRepo = mock(UtmConfigurationParameterRepository.class);

        disabledProvider = mock(DisabledLlmProvider.class);
        when(disabledProvider.providerName()).thenReturn("disabled");
        when(disabledProvider.isConfigured()).thenReturn(false);
        when(disabledProvider.chat(org.mockito.ArgumentMatchers.anyList(),
                org.mockito.ArgumentMatchers.any()))
            .thenThrow(new LlmNotConfiguredException("disabled"));
        when(disabledProvider.streamChat(org.mockito.ArgumentMatchers.anyList(),
                org.mockito.ArgumentMatchers.any()))
            .thenReturn(reactor.core.publisher.Flux.error(
                    new LlmNotConfiguredException("disabled")));

        openAiProvider = mock(OpenAiLlmProvider.class);
        when(openAiProvider.providerName()).thenReturn("openai");

        azureProvider = mock(AzureOpenAiLlmProvider.class);
        when(azureProvider.providerName()).thenReturn("azure");

        ollamaProvider = mock(OllamaLlmProvider.class);
        when(ollamaProvider.providerName()).thenReturn("ollama");

        registry = new ProviderRegistry(
            List.of(disabledProvider, openAiProvider, azureProvider, ollamaProvider)
        );

        service = new HaLlmService(registry, configRepo);

        HaLlmConfigService configWriter = mock(HaLlmConfigService.class);
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        adminResource = new HaLlmAdminResource(service, ollamaProvider, configWriter, events);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Stubs the config repo to return {@code "disabled"} for {@code LLM_PROVIDER}
     * and fires {@link HaLlmService#onConfigChanged} to trigger a reload — equivalent
     * to posting {@code provider: disabled} via the admin config endpoint.
     */
    private void revertToDisabled() {
        stubProviderRow("disabled");
        service.onConfigChanged(new LlmConfigChangedEvent(this));
    }

    private void stubProviderRow(String value) {
        UtmConfigurationParameter param = new UtmConfigurationParameter();
        param.setConfParamShort("LLM_PROVIDER");
        param.setConfParamValue(value);
        when(configRepo.findByConfParamShort("LLM_PROVIDER"))
            .thenReturn(Optional.of(param));
    }

    private static final List<ChatMessage> SAMPLE_MESSAGES =
        List.of(new ChatMessage("user", "ping"));

    private static final ChatOptions DEFAULT_OPTIONS =
        new ChatOptions(null, null, null);

    // =========================================================================
    // Check 1: chat() throws LlmNotConfiguredException → HTTP 503
    // =========================================================================

    /**
     * After reverting to {@code disabled}, {@link HaLlmService#chat} must throw
     * {@link LlmNotConfiguredException}, which {@code @ResponseStatus(503)} on
     * that exception class translates to an HTTP 503 at the controller layer.
     *
     * <p><strong>Validates: Requirements 10.6, 8.3</strong>
     */
    @Example
    @Label("8.8-A: revert to disabled → chat() throws LlmNotConfiguredException (HTTP 503)")
    void check_A_chat_throwsLlmNotConfiguredException_afterRevertToDisabled() {
        revertToDisabled();

        assertThatThrownBy(() -> service.chat(SAMPLE_MESSAGES, DEFAULT_OPTIONS))
            .as("chat() must throw LlmNotConfiguredException after provider is set to 'disabled'. "
                + "LlmNotConfiguredException carries @ResponseStatus(503) so any propagating "
                + "controller returns HTTP 503 (Requirements 10.6, 8.3).")
            .isInstanceOf(LlmNotConfiguredException.class)
            .hasMessageContaining("disabled");
    }

    // =========================================================================
    // Check 2: streamChat() returns a Flux that errors with LlmNotConfiguredException
    // =========================================================================

    /**
     * After reverting to {@code disabled}, {@link HaLlmService#streamChat} must
     * return a {@link reactor.core.publisher.Flux} that terminates with
     * {@link LlmNotConfiguredException} rather than emitting any tokens.
     *
     * <p>This causes SSE-backed streaming controllers to emit an error frame,
     * which the frontend treats as a 503 degradation signal
     * (Requirements 10.6, 8.3).
     *
     * <p><strong>Validates: Requirements 10.6, 8.3</strong>
     */
    @Example
    @Label("8.8-B: revert to disabled → streamChat() Flux errors with LlmNotConfiguredException")
    void check_B_streamChat_fluxErrorsWithLlmNotConfiguredException_afterRevertToDisabled() {
        revertToDisabled();

        AtomicReference<Throwable> capturedError = new AtomicReference<>();
        service.streamChat(SAMPLE_MESSAGES, DEFAULT_OPTIONS)
            .onErrorResume(ex -> {
                capturedError.set(ex);
                return Flux.empty();
            })
            .blockLast();

        assertThat(capturedError.get())
            .as("streamChat() Flux must terminate with LlmNotConfiguredException "
                + "after provider is reverted to 'disabled' "
                + "(Requirements 10.6, 8.3).")
            .isNotNull()
            .isInstanceOf(LlmNotConfiguredException.class);
        assertThat(capturedError.get().getMessage())
            .as("LlmNotConfiguredException message must reference provider 'disabled'")
            .contains("disabled");
    }

    // =========================================================================
    // Check 3: isConfigured() returns false
    // =========================================================================

    /**
     * After reverting to {@code disabled}, {@link HaLlmService#isConfigured()}
     * must return {@code false}.  Admin status surfaces and health probes rely
     * on this to signal the degraded state accurately (Requirement 8.3).
     *
     * <p><strong>Validates: Requirements 10.6, 8.3</strong>
     */
    @Example
    @Label("8.8-C: revert to disabled → isConfigured() == false")
    void check_C_isConfigured_returnsFalse_afterRevertToDisabled() {
        revertToDisabled();

        assertThat(service.isConfigured())
            .as("isConfigured() must return false after provider is reverted to 'disabled' "
                + "(Requirements 10.6, 8.3).")
            .isFalse();
    }

    // =========================================================================
    // Check 4: HaLlmAdminResource.status().configured() == false
    // =========================================================================

    /**
     * After reverting to {@code disabled}, the admin status endpoint must return
     * a {@link LlmStatusDTO} with {@code configured() == false} and
     * {@code provider() == "disabled"}.
     *
     * <p>The frontend reads this DTO to decide whether to render the degradation
     * null-state card (Requirements 10.6, 8.3).
     *
     * <p><strong>Validates: Requirements 10.6, 8.3</strong>
     */
    @Example
    @Label("8.8-D: revert to disabled → HaLlmAdminResource.status().configured() == false")
    void check_D_adminStatusEndpoint_returnsConfiguredFalse_afterRevertToDisabled() {
        revertToDisabled();

        LlmStatusDTO status = adminResource.status();

        assertThat(status.configured())
            .as("LlmStatusDTO.configured must be false after provider is reverted to 'disabled'. "
                + "The frontend uses this field to show the degradation null-state card "
                + "(Requirements 10.6, 8.3).")
            .isFalse();

        assertThat(status.provider())
            .as("LlmStatusDTO.provider must be 'disabled' after revert (Requirements 10.6).")
            .isEqualTo("disabled");
    }

    // =========================================================================
    // Check 5: transition from a non-disabled provider back to disabled
    // =========================================================================

    /**
     * Verifies that a service previously configured with a non-disabled provider
     * correctly reverts all the above checks after a second hot-reload to
     * {@code disabled}.  This mirrors the real admin flow: user sets provider to
     * {@code ollama}, then later posts {@code provider: disabled}.
     *
     * <p><strong>Validates: Requirements 10.6, 8.3, 10.3</strong>
     */
    @Example
    @Label("8.8-E: transition ollama → disabled → all checks hold")
    void check_E_transitionFromOllamaToDisabled_allChecksHold() {
        // First configure as ollama
        stubProviderRow("ollama");
        service.onConfigChanged(new LlmConfigChangedEvent(this));
        assertThat(service.activeProviderName())
            .as("Pre-condition: provider should be 'ollama' before revert")
            .isEqualTo("ollama");

        // Now revert to disabled
        revertToDisabled();

        // 1 — chat throws
        assertThatThrownBy(() -> service.chat(SAMPLE_MESSAGES, DEFAULT_OPTIONS))
            .as("chat() must throw LlmNotConfiguredException after ollama→disabled transition "
                + "(Requirements 10.6)")
            .isInstanceOf(LlmNotConfiguredException.class);

        // 2 — streamChat Flux errors
        AtomicReference<Throwable> capturedError = new AtomicReference<>();
        service.streamChat(SAMPLE_MESSAGES, DEFAULT_OPTIONS)
            .onErrorResume(ex -> {
                capturedError.set(ex);
                return Flux.empty();
            })
            .blockLast();
        assertThat(capturedError.get())
            .as("streamChat Flux must error after ollama→disabled (Requirements 10.6)")
            .isNotNull()
            .isInstanceOf(LlmNotConfiguredException.class);

        // 3 — isConfigured false
        assertThat(service.isConfigured())
            .as("isConfigured() must be false after ollama→disabled (Requirements 8.3)")
            .isFalse();

        // 4 — admin status DTO
        LlmStatusDTO status = adminResource.status();
        assertThat(status.configured())
            .as("status.configured must be false after ollama→disabled (Requirements 8.3)")
            .isFalse();
        assertThat(status.provider())
            .as("status.provider must be 'disabled' after ollama→disabled (Requirements 10.6)")
            .isEqualTo("disabled");
    }
}
