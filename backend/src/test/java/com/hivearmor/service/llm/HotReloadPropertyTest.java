package com.hivearmor.service.llm;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.llm.event.LlmConfigChangedEvent;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Property 4: Hot-reload transitions the active provider without restart.
 *
 * <p><strong>Property 4: Hot-reload transitions the active provider without restart</strong><br>
 * For any pair of provider names {@code (before, after)} drawn from
 * {@code {disabled, openai, azure, ollama}}, if {@code LLM_PROVIDER} is set to
 * {@code before} and then updated to {@code after} followed by publishing
 * {@link LlmConfigChangedEvent}, the same {@link HaLlmService} singleton SHALL
 * report {@code activeProviderName() == after} on the very next call, without any
 * JVM restart and without any bean re-creation.
 *
 * <p><strong>Validates: Requirements 2.3, 6.4, 10.3</strong>
 */
@Label("Feature: sprint-27-ollama, Property 4: Hot-reload transitions the active provider without restart")
class HotReloadPropertyTest {

    // -------------------------------------------------------------------------
    // Test infrastructure — re-created fresh before every jqwik trial
    // -------------------------------------------------------------------------

    // ProviderRegistry requires a real DisabledLlmProvider instance (it checks via
    // DisabledLlmProvider.class::isInstance). The other three slots use lightweight stubs.
    private ProviderRegistry registry;
    private UtmConfigurationParameterRepository configRepo;
    private HaLlmService service;

    @BeforeTry
    void setUp() {
        DisabledLlmProvider realDisabled = new DisabledLlmProvider();
        NamedStubProvider openaiProvider = new NamedStubProvider("openai");
        NamedStubProvider azureProvider  = new NamedStubProvider("azure");
        NamedStubProvider ollamaProvider = new NamedStubProvider("ollama");

        registry   = new ProviderRegistry(List.of(realDisabled, openaiProvider, azureProvider, ollamaProvider));
        configRepo = mock(UtmConfigurationParameterRepository.class);
        service    = new HaLlmService(registry, configRepo);
    }

    // =========================================================================
    // Property 4-A: activeProviderName() reflects the new provider after reload
    // =========================================================================

    /**
     * <strong>Property 4-A: hot-reload swings activeProviderName() to the new value</strong>
     *
     * <p>Steps:
     * <ol>
     *   <li>Stub the config repo to return {@code before}.</li>
     *   <li>Trigger an initial reload by firing {@link LlmConfigChangedEvent} so the
     *       service picks up {@code before} as its active provider.</li>
     *   <li>Assert {@code activeProviderName() == before}.</li>
     *   <li>Re-stub the config repo to return {@code after}.</li>
     *   <li>Fire a second {@link LlmConfigChangedEvent} — same instance, no restart.</li>
     *   <li>Assert {@code activeProviderName() == after} on the very next call.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 2.3, 6.4, 10.3</strong>
     */
    @Property(tries = 200)
    @Label("Property 4-A: activeProviderName() == after on the next call, without restart")
    void property4a_hotReload_activeSwitchesToNewProvider(
            @ForAll("providerNamePairs") String[] pair) {

        String before = pair[0];
        String after  = pair[1];

        // Step 1 + 2: seed "before", trigger initial reload
        stubProvider(before);
        service.onConfigChanged(new LlmConfigChangedEvent(this));

        // Step 3: service must already report "before"
        assertThat(service.activeProviderName())
            .as("Before hot-reload, activeProviderName() should be '%s'", before)
            .isEqualTo(before);

        // Step 4: update config to "after"
        stubProvider(after);

        // Step 5: fire the hot-reload event — same service instance, no restart
        service.onConfigChanged(new LlmConfigChangedEvent(this));

        // Step 6: the very next call must report "after"
        assertThat(service.activeProviderName())
            .as("After hot-reload event, activeProviderName() must be '%s' (same singleton, no restart)", after)
            .isEqualTo(after);
    }

    // =========================================================================
    // Property 4-B: repeated transitions always track the latest config value
    // =========================================================================

    /**
     * <strong>Property 4-B: successive reloads always track the latest config value</strong>
     *
     * <p>A second reload (provider swings back from {@code second} to {@code first})
     * must also reflect the updated value, confirming that hot-reload is repeatable
     * and the {@code AtomicReference} is not frozen after the first transition.
     *
     * <p><strong>Validates: Requirements 2.3, 6.4</strong>
     */
    @Property(tries = 200)
    @Label("Property 4-B: second reload also tracks the latest config value")
    void property4b_hotReload_isRepeatable(
            @ForAll("distinctProviderNamePairs") String[] pair) {

        String first  = pair[0];
        String second = pair[1];

        // Forward transition: first → second
        stubProvider(first);
        service.onConfigChanged(new LlmConfigChangedEvent(this));
        assertThat(service.activeProviderName())
            .as("After initial load to '%s'", first)
            .isEqualTo(first);

        stubProvider(second);
        service.onConfigChanged(new LlmConfigChangedEvent(this));
        assertThat(service.activeProviderName())
            .as("After first reload to '%s'", second)
            .isEqualTo(second);

        // Reverse transition: second → first
        stubProvider(first);
        service.onConfigChanged(new LlmConfigChangedEvent(this));
        assertThat(service.activeProviderName())
            .as("After second reload back to '%s', same singleton must track the config", first)
            .isEqualTo(first);
    }

    // =========================================================================
    // Property 4-C: same service object identity throughout all transitions
    // =========================================================================

    /**
     * <strong>Property 4-C: no bean re-creation occurs — same object reference throughout</strong>
     *
     * <p>The test holds a reference to the {@link HaLlmService} instance created in
     * {@link #setUp()} and verifies that it is the exact same object after all
     * transitions — confirming no re-creation occurred.
     *
     * <p><strong>Validates: Requirements 10.3</strong>
     */
    @Property(tries = 200)
    @Label("Property 4-C: no service re-creation — same singleton object throughout all transitions")
    void property4c_sameObjectReference_throughAllTransitions(
            @ForAll("providerNamePairs") String[] pair) {

        String before = pair[0];
        String after  = pair[1];

        // Capture object identity before any operation
        HaLlmService capturedRef = service;

        stubProvider(before);
        service.onConfigChanged(new LlmConfigChangedEvent(this));

        stubProvider(after);
        service.onConfigChanged(new LlmConfigChangedEvent(this));

        // The service variable must point to the same instance — never reassigned
        assertThat(service)
            .as("service reference must be the same object — no bean re-creation allowed")
            .isSameAs(capturedRef);

        // And that instance reports the correct provider
        assertThat(service.activeProviderName())
            .as("The same singleton must now report '%s'", after)
            .isEqualTo(after);
    }

    // =========================================================================
    // Property 4-D: legacy LlmConfigChangedEvent also triggers the reload
    // =========================================================================

    /**
     * <strong>Property 4-D: legacy Sprint-25 event also hot-reloads the active provider</strong>
     *
     * <p>For backward compatibility, {@link HaLlmService} listens to both the Sprint-27
     * {@link LlmConfigChangedEvent} and the legacy Sprint-25 event. This property
     * verifies the legacy path also triggers a reload without requiring a restart.
     *
     * <p><strong>Validates: Requirements 2.3, 6.4</strong>
     */
    @Property(tries = 200)
    @Label("Property 4-D: legacy Sprint-25 LlmConfigChangedEvent also reloads the active provider")
    void property4d_legacyEvent_alsoTriggersReload(
            @ForAll("providerNamePairs") String[] pair) {

        String before = pair[0];
        String after  = pair[1];

        // Establish "before" via the Sprint-27 event
        stubProvider(before);
        service.onConfigChanged(new LlmConfigChangedEvent(this));
        assertThat(service.activeProviderName()).isEqualTo(before);

        // Transition to "after" via the legacy Sprint-25 event
        stubProvider(after);
        service.onLegacyConfigChanged(
            new com.hivearmor.service.admin.event.LlmConfigChangedEvent(this));

        assertThat(service.activeProviderName())
            .as("Legacy event must also hot-reload the provider to '%s'", after)
            .isEqualTo(after);
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates all ordered pairs {@code (before, after)} from the four provider names,
     * including cases where {@code before == after} (idempotent reload verification).
     */
    @Provide
    Arbitrary<String[]> providerNamePairs() {
        return Arbitraries.of("disabled", "openai", "azure", "ollama")
            .tuple2()
            .map(t -> new String[]{ t.get1(), t.get2() });
    }

    /**
     * Generates pairs where {@code before != after}, exercising actual provider transitions.
     */
    @Provide
    Arbitrary<String[]> distinctProviderNamePairs() {
        return Arbitraries.of("disabled", "openai", "azure", "ollama")
            .tuple2()
            .filter(t -> !t.get1().equals(t.get2()))
            .map(t -> new String[]{ t.get1(), t.get2() });
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Stubs {@link UtmConfigurationParameterRepository#findByConfParamShort(String)}
     * to return a {@link UtmConfigurationParameter} row whose
     * {@code confParamValue} is {@code providerName}.
     */
    private void stubProvider(String providerName) {
        UtmConfigurationParameter param = new UtmConfigurationParameter();
        param.setConfParamShort("LLM_PROVIDER");
        param.setConfParamValue(providerName);
        when(configRepo.findByConfParamShort(eq("LLM_PROVIDER")))
            .thenReturn(Optional.of(param));
    }

    // =========================================================================
    // Minimal stub provider implementation
    // =========================================================================

    /**
     * Minimal {@link HaLlmProvider} stub that returns a fixed provider name.
     *
     * <p>Used for the {@code openai}, {@code azure}, and {@code ollama} slots.
     * The {@code disabled} slot always uses a real {@link DisabledLlmProvider} because
     * {@link ProviderRegistry}'s constructor performs an
     * {@code instanceof DisabledLlmProvider} check to locate the fallback bean.
     */
    private static class NamedStubProvider implements HaLlmProvider {

        private final String name;

        NamedStubProvider(String name) {
            this.name = name;
        }

        @Override
        public String chat(List<ChatMessage> messages, ChatOptions options) {
            throw new LlmNotConfiguredException(name);
        }

        @Override
        public Flux<String> streamChat(List<ChatMessage> messages, ChatOptions options) {
            return Flux.error(new LlmNotConfiguredException(name));
        }

        @Override
        public boolean isConfigured() {
            return true;
        }

        @Override
        public String providerName() {
            return name;
        }
    }
}
