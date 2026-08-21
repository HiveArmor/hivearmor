package com.hivearmor.service.llm;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import reactor.core.publisher.Flux;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Property-based test for {@link HaLlmService} delegation behaviour.
 *
 * <p><strong>Property 6: HaLlmService delegates to the active provider</strong><br>
 * <strong>Validates: Requirements 2.5</strong>
 *
 * <p>For any invocation of {@link HaLlmService#chat(List, ChatOptions)} or
 * {@link HaLlmService#streamChat(List, ChatOptions)} with any argument list, the
 * call SHALL be dispatched to the provider currently held in the {@code active}
 * {@link AtomicReference} at invocation time.
 *
 * <h2>Test strategy</h2>
 * <p>Three sub-properties are verified across arbitrary generated inputs:
 * <ol>
 *   <li><strong>6-A</strong> — {@code chat(messages, options)} routes its arguments
 *       unchanged to {@code active.get().chat(messages, options)} and returns whatever
 *       the active provider returns.</li>
 *   <li><strong>6-B</strong> — {@code streamChat(messages, options)} routes its arguments
 *       unchanged to {@code active.get().streamChat(messages, options)} and returns the
 *       same {@link Flux} reference.</li>
 *   <li><strong>6-C</strong> — when the {@code active} reference is swapped to a different
 *       provider before invocation, the call is dispatched to the <em>new</em> provider,
 *       not the previous one.</li>
 * </ol>
 *
 * <p>The Spring context is bypassed entirely: {@link HaLlmService} is constructed with
 * a mock {@link ProviderRegistry} and a mock {@link UtmConfigurationParameterRepository}
 * that returns {@code "disabled"} (preventing any I/O), and the private
 * {@code AtomicReference<HaLlmProvider> active} field is overwritten via reflection so
 * the mock provider is in place before each assertion.
 */
@Label("Feature: sprint-27-ollama, Property 6: HaLlmService delegates to the active provider")
class HaLlmServiceDelegationPropertyTest {

    // -------------------------------------------------------------------------
    // Test infrastructure — re-created before every jqwik trial
    // -------------------------------------------------------------------------

    private HaLlmService service;
    private ProviderRegistry registry;
    private UtmConfigurationParameterRepository configRepo;

    /**
     * Constructs a fresh {@link HaLlmService} before every property trial.
     *
     * <p>The repository mock returns {@link Optional#empty()} for every call so that
     * {@link HaLlmService#init()} (which is NOT invoked here — {@code @PostConstruct}
     * is a Spring concern) falls back to disabled via {@code reload()} if called.
     * We never call {@code init()} directly; instead we plant the mock provider
     * directly into the {@code active} field via reflection.
     */
    @BeforeTry
    void setUp() {
        DisabledLlmProvider disabledProvider = new DisabledLlmProvider();
        registry = mock(ProviderRegistry.class);
        when(registry.disabled()).thenReturn(disabledProvider);
        when(registry.forName(anyString())).thenReturn(Optional.of(disabledProvider));

        configRepo = mock(UtmConfigurationParameterRepository.class);
        when(configRepo.findByConfParamShort(anyString())).thenReturn(Optional.empty());

        service = new HaLlmService(registry, configRepo);

        // Manually trigger init() to ensure 'active' is not null.
        // HaLlmService.init() calls reload() which reads configRepo → "disabled" fallback.
        // We invoke it reflectively so we don't need Spring's @PostConstruct lifecycle.
        try {
            java.lang.reflect.Method initMethod =
                HaLlmService.class.getDeclaredMethod("init");
            initMethod.setAccessible(true);
            initMethod.invoke(service);
        } catch (Exception e) {
            throw new RuntimeException("Failed to invoke HaLlmService.init()", e);
        }
    }

    // =========================================================================
    // Property 6-A: chat(...) delegates to active.get().chat(messages, options)
    // =========================================================================

    /**
     * <strong>Property 6-A: {@code chat} dispatches to the active provider</strong>
     *
     * <p>For any list of {@link ChatMessage} values and any {@link ChatOptions},
     * {@link HaLlmService#chat(List, ChatOptions)} must invoke
     * {@link HaLlmProvider#chat(List, ChatOptions)} on the currently-active provider
     * with the exact same arguments, and must return whatever that provider returns.
     *
     * <p><strong>Validates: Requirements 2.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 6-A: chat dispatches to active provider with unchanged arguments")
    void property6a_chat_delegatesToActiveProvider(
            @ForAll("chatMessages") List<ChatMessage> messages,
            @ForAll("chatOptions") ChatOptions options) throws Exception {

        // Arrange: a mock provider that records calls and returns a sentinel response.
        HaLlmProvider mockProvider = mock(HaLlmProvider.class);
        String sentinelResponse = "delegated-response-" + messages.size();
        when(mockProvider.chat(anyList(), any())).thenReturn(sentinelResponse);

        // Plant the mock as the active provider.
        plantActiveProvider(service, mockProvider);

        // Act.
        String result = service.chat(messages, options);

        // Assert: the return value comes from the mock provider.
        assertThat(result)
            .as("HaLlmService.chat must return the value produced by the active provider "
                + "(messages=%s, options=%s)", messages, options)
            .isEqualTo(sentinelResponse);

        // Assert: the mock was invoked exactly once with the exact arguments.
        verify(mockProvider, times(1)).chat(messages, options);
        verifyNoMoreInteractions(mockProvider);
    }

    // =========================================================================
    // Property 6-B: streamChat(...) delegates to active.get().streamChat(messages, options)
    // =========================================================================

    /**
     * <strong>Property 6-B: {@code streamChat} dispatches to the active provider</strong>
     *
     * <p>For any list of {@link ChatMessage} values and any {@link ChatOptions},
     * {@link HaLlmService#streamChat(List, ChatOptions)} must invoke
     * {@link HaLlmProvider#streamChat(List, ChatOptions)} on the currently-active
     * provider with the exact same arguments, and must return the same {@link Flux}
     * reference that the provider returned.
     *
     * <p><strong>Validates: Requirements 2.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 6-B: streamChat dispatches to active provider with unchanged arguments")
    void property6b_streamChat_delegatesToActiveProvider(
            @ForAll("chatMessages") List<ChatMessage> messages,
            @ForAll("chatOptions") ChatOptions options) throws Exception {

        // Arrange: a mock provider that records calls and returns a known Flux.
        HaLlmProvider mockProvider = mock(HaLlmProvider.class);
        Flux<String> sentinelFlux = Flux.just("token-a", "token-b");
        when(mockProvider.streamChat(anyList(), any())).thenReturn(sentinelFlux);

        // Plant the mock as the active provider.
        plantActiveProvider(service, mockProvider);

        // Act.
        Flux<String> result = service.streamChat(messages, options);

        // Assert: the same Flux reference is returned (delegation, not wrapping).
        assertThat(result)
            .as("HaLlmService.streamChat must return the Flux produced by the active provider "
                + "(messages=%s, options=%s)", messages, options)
            .isSameAs(sentinelFlux);

        // Assert: the mock was invoked exactly once with the exact arguments.
        verify(mockProvider, times(1)).streamChat(messages, options);
        verifyNoMoreInteractions(mockProvider);
    }

    // =========================================================================
    // Property 6-C: swapping active reference before call routes to new provider
    // =========================================================================

    /**
     * <strong>Property 6-C: calls route to whichever provider is active at invocation time</strong>
     *
     * <p>If the {@code active} reference is set to provider {@code A} and then
     * swapped to provider {@code B} before the call is made, the call MUST reach
     * provider {@code B} only — provider {@code A} must not receive any call.
     *
     * <p>This verifies that {@link HaLlmService} reads {@code active.get()} at
     * call time rather than caching the provider at construction time.
     *
     * <p><strong>Validates: Requirements 2.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 6-C: call reaches whichever provider is active at invocation time")
    void property6c_activeProviderAtInvocationTime_receivesCall(
            @ForAll("chatMessages") List<ChatMessage> messages,
            @ForAll("chatOptions") ChatOptions options) throws Exception {

        // Arrange: two distinct mock providers.
        HaLlmProvider providerA = mock(HaLlmProvider.class, "providerA");
        HaLlmProvider providerB = mock(HaLlmProvider.class, "providerB");

        String responseFromB = "response-from-B";
        Flux<String> fluxFromB = Flux.just("stream-from-B");

        when(providerB.chat(anyList(), any())).thenReturn(responseFromB);
        when(providerB.streamChat(anyList(), any())).thenReturn(fluxFromB);

        // Plant provider A first (simulating an earlier state), then swap to B
        // before the actual call — the call must reach B, not A.
        plantActiveProvider(service, providerA);
        plantActiveProvider(service, providerB);

        // Act: chat.
        String chatResult = service.chat(messages, options);
        assertThat(chatResult)
            .as("After swapping active to providerB, chat must reach providerB "
                + "(messages=%s, options=%s)", messages, options)
            .isEqualTo(responseFromB);

        verify(providerA, never()).chat(any(), any());
        verify(providerB, times(1)).chat(messages, options);

        // Act: streamChat.
        Flux<String> streamResult = service.streamChat(messages, options);
        assertThat(streamResult)
            .as("After swapping active to providerB, streamChat must reach providerB "
                + "(messages=%s, options=%s)", messages, options)
            .isSameAs(fluxFromB);

        verify(providerA, never()).streamChat(any(), any());
        verify(providerB, times(1)).streamChat(messages, options);
    }

    // =========================================================================
    // Arbitrary providers (generators)
    // =========================================================================

    /**
     * Generates lists of {@link ChatMessage} values with roles drawn from the OpenAI
     * convention ({@code system}, {@code user}, {@code assistant}) and arbitrary
     * content strings. Lists have between 1 and 10 elements.
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
     * The delegation property must hold for all combinations including null fields,
     * because {@link HaLlmService} passes the options object through unchanged.
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

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Overwrites the private {@code AtomicReference<HaLlmProvider> active} field of
     * the given {@link HaLlmService} instance via reflection, placing {@code provider}
     * as the currently active provider.
     *
     * <p>This is necessary because {@code active} is private final and the normal
     * hot-reload path ({@code reload()}) depends on the Spring database stack. The
     * reflective approach is the standard pattern used across the project's property
     * test suite (see also {@code HaLlmServicePropertyTest}) and does not compromise
     * production code.
     *
     * @param llmService the service whose active provider should be overwritten
     * @param provider   the provider to install as the active reference
     * @throws RuntimeException if the field cannot be accessed or set
     */
    @SuppressWarnings("unchecked")
    private static void plantActiveProvider(HaLlmService llmService, HaLlmProvider provider) {
        try {
            Field activeField = HaLlmService.class.getDeclaredField("active");
            activeField.setAccessible(true);
            AtomicReference<HaLlmProvider> activeRef =
                (AtomicReference<HaLlmProvider>) activeField.get(llmService);
            activeRef.set(provider);
        } catch (NoSuchFieldException | IllegalAccessException e) {
            throw new RuntimeException(
                "Could not access HaLlmService.active field — "
                + "check the field name matches the production declaration", e);
        }
    }
}
