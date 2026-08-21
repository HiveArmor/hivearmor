package com.hivearmor.web.rest.admin;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.HaLlmConfigService;
import com.hivearmor.service.dto.admin.LlmConfigUpdateDTO;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.service.llm.DisabledLlmProvider;
import com.hivearmor.service.llm.HaLlmProvider;
import com.hivearmor.service.llm.LlmNotConfiguredException;
import com.hivearmor.service.llm.OllamaLlmProvider;
import com.hivearmor.service.llm.ProviderRegistry;
import com.hivearmor.service.llm.event.LlmConfigChangedEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Integration test for Requirement 10.3: a configuration change submitted through
 * {@code POST /api/ha-admin/llm/config} takes effect without restarting the backend process.
 *
 * <h2>What this test verifies</h2>
 * <ol>
 *   <li><strong>Step 1 — openai transition:</strong> The config repository is stubbed to
 *       return {@code LLM_PROVIDER=openai}. A {@link LlmConfigUpdateDTO} with
 *       {@code provider="openai"} is submitted through {@link HaLlmAdminResource#updateConfig}.
 *       The resource persists the DTO via {@link HaLlmConfigService#persist} and publishes
 *       {@link LlmConfigChangedEvent}.  {@link HaLlmService#onConfigChanged} fires
 *       synchronously (Spring's default in-process dispatch) and re-reads the repo, causing
 *       {@link HaLlmService#activeProviderName()} to return {@code "openai"}.</li>
 *
 *   <li><strong>Step 2 — ollama transition:</strong> Immediately after — without any restart
 *       or bean re-creation — the repo stub is updated to return {@code LLM_PROVIDER=ollama}
 *       and a second {@link LlmConfigUpdateDTO} with {@code provider="ollama"} is submitted.
 *       After the second event fires, {@link HaLlmService#activeProviderName()} must return
 *       {@code "ollama"}.</li>
 *
 *   <li><strong>Same instance throughout:</strong> The test holds a reference to the
 *       {@link HaLlmService} instance created in {@link #setUp()} and asserts that it is
 *       the exact same object after both transitions — no re-creation occurred.</li>
 * </ol>
 *
 * <p>No running server is required. The Spring context is bypassed entirely: every
 * collaborator is constructed directly (real implementations where possible, mocks where
 * a database or network would be needed). The {@link ApplicationEventPublisher} uses a
 * real lambda that calls {@link HaLlmService#onConfigChanged} synchronously, mirroring
 * Spring's synchronous in-process dispatch contract.
 *
 * <p>Requirements: 10.3
 */
@Tag("integration")
@DisplayName("Sprint27HotReloadIT — hot-reload without restart (Requirement 10.3)")
class Sprint27HotReloadIT {

    // -------------------------------------------------------------------------
    // Collaborators assembled without a Spring context
    // -------------------------------------------------------------------------

    /** Mocked repository — controls what value reload() reads for LLM_PROVIDER. */
    private UtmConfigurationParameterRepository configRepo;

    /** Real HaLlmService singleton — must remain the same instance throughout. */
    private HaLlmService haLlmService;

    /** Real HaLlmConfigService backed by the mocked repo. */
    private HaLlmConfigService configService;

    /** The controller under test — wired with real dependencies where feasible. */
    private HaLlmAdminResource adminResource;

    /**
     * Reconstructs the object graph before each test method.
     *
     * <p>Stub providers for {@code openai} and {@code ollama} are lightweight anonymous
     * implementations — only {@code providerName()} matters here. A real
     * {@link DisabledLlmProvider} is used for the fallback slot because
     * {@link ProviderRegistry} performs an {@code instanceof DisabledLlmProvider} check
     * to locate the terminal fallback.
     */
    @BeforeEach
    void setUp() throws Exception {
        configRepo = mock(UtmConfigurationParameterRepository.class);

        // Default: repo returns "disabled" so init() sets the fallback provider.
        stubLlmProvider("disabled");

        // Build provider registry with real disabled + two stubs for openai and ollama.
        ProviderRegistry registry = new ProviderRegistry(List.of(
            new DisabledLlmProvider(),
            namedProvider("openai"),
            namedProvider("azure"),
            namedProvider("ollama")
        ));

        // Construct real HaLlmService and manually invoke @PostConstruct.
        haLlmService = new HaLlmService(registry, configRepo);
        invokeInit(haLlmService);

        // Real HaLlmConfigService backed by the mocked repo.
        configService = new HaLlmConfigService(configRepo);

        // Real publisher that calls onConfigChanged synchronously on haLlmService,
        // mirroring Spring's synchronous in-process ApplicationEvent dispatch.
        ApplicationEventPublisher publisher = event -> {
            if (event instanceof LlmConfigChangedEvent e) {
                haLlmService.onConfigChanged(e);
            }
        };

        OllamaLlmProvider ollamaMock = mock(OllamaLlmProvider.class);
        adminResource = new HaLlmAdminResource(haLlmService, ollamaMock, configService, publisher);
    }

    // =========================================================================
    // Test: two back-to-back POSTs transition provider without restart
    // =========================================================================

    /**
     * Requirement 10.3 — configuration change takes effect without restarting the backend.
     *
     * <p>Two {@link LlmConfigUpdateDTO} values are submitted back-to-back through
     * {@link HaLlmAdminResource#updateConfig}. After each submission,
     * {@link HaLlmService#activeProviderName()} is asserted to reflect the new value.
     * The same {@link HaLlmService} object identity is confirmed throughout.
     */
    @Test
    @DisplayName("Two back-to-back config updates transition activeProviderName() without restart")
    void hotReload_twoBackToBackUpdates_transitionProviderWithoutRestart() {
        // Capture the service identity — it must never change.
        HaLlmService serviceRef = haLlmService;

        // --- Transition 1: disabled → openai ---
        stubLlmProvider("openai");
        LlmConfigUpdateDTO dto1 = new LlmConfigUpdateDTO(
            "openai",   // provider
            "https://api.openai.com/v1",  // baseUrl
            "gpt-4o",   // model
            "",         // apiKey (empty — acceptable for the test)
            0.2,        // temperature
            2048        // maxTokens
        );
        adminResource.updateConfig(dto1);

        assertThat(haLlmService.activeProviderName())
            .as("After first config update (openai), activeProviderName() must return 'openai' "
                + "without a restart")
            .isEqualTo("openai");

        // --- Transition 2: openai → ollama (immediately, same JVM, same bean) ---
        stubLlmProvider("ollama");
        LlmConfigUpdateDTO dto2 = new LlmConfigUpdateDTO(
            "ollama",               // provider
            "http://ollama:11434",  // baseUrl
            "llama3.2:3b",         // model
            "",                    // apiKey
            0.2,                   // temperature
            2048                   // maxTokens
        );
        adminResource.updateConfig(dto2);

        assertThat(haLlmService.activeProviderName())
            .as("After second config update (ollama), activeProviderName() must return 'ollama' "
                + "without a restart")
            .isEqualTo("ollama");

        // --- Same instance throughout — no restart, no bean re-creation ---
        assertThat(haLlmService)
            .as("HaLlmService must be the same object reference throughout both transitions "
                + "— hot-reload must not re-create the bean")
            .isSameAs(serviceRef);
    }

    /**
     * Sanity check: the initial provider after construction is {@code "disabled"},
     * confirming baseline state before any hot-reload.
     */
    @Test
    @DisplayName("Initial provider is 'disabled' before any config update")
    void initialProvider_isDisabled_beforeAnyUpdate() {
        assertThat(haLlmService.activeProviderName())
            .as("Before any config update, the active provider must be 'disabled'")
            .isEqualTo("disabled");
    }

    /**
     * Round-trip: {@code openai → ollama → disabled} — three consecutive transitions
     * all on the same singleton, each verifying the provider swings correctly.
     */
    @Test
    @DisplayName("Three consecutive transitions on the same singleton — openai → ollama → disabled")
    void hotReload_threeConsecutiveTransitions_allReflectedOnSameSingleton() {
        HaLlmService serviceRef = haLlmService;

        // Step 1: → openai
        stubLlmProvider("openai");
        adminResource.updateConfig(dto("openai"));
        assertThat(haLlmService.activeProviderName()).isEqualTo("openai");

        // Step 2: → ollama
        stubLlmProvider("ollama");
        adminResource.updateConfig(dto("ollama"));
        assertThat(haLlmService.activeProviderName()).isEqualTo("ollama");

        // Step 3: → disabled
        stubLlmProvider("disabled");
        adminResource.updateConfig(dto("disabled"));
        assertThat(haLlmService.activeProviderName()).isEqualTo("disabled");

        // Object identity preserved across all three transitions.
        assertThat(haLlmService)
            .as("Same singleton after three transitions")
            .isSameAs(serviceRef);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Stubs the mocked repo so that every call to
     * {@link UtmConfigurationParameterRepository#findByConfParamShort(String)} for any
     * key returns a {@link UtmConfigurationParameter} whose {@code confParamValue} is
     * {@code providerName} for the {@code LLM_PROVIDER} key and an empty Optional for
     * all other keys.
     *
     * <p>This lets {@link HaLlmConfigService#persist} perform its find-and-update
     * upserts (returning empty → creates a new entity) while still allowing
     * {@link HaLlmService#reload()} to read the updated provider name.
     *
     * @param providerName the value to return for the {@code LLM_PROVIDER} row
     */
    private void stubLlmProvider(String providerName) {
        // For the LLM_PROVIDER row, return the value that reload() needs.
        UtmConfigurationParameter providerParam = new UtmConfigurationParameter();
        providerParam.setConfParamShort("LLM_PROVIDER");
        providerParam.setConfParamValue(providerName);
        when(configRepo.findByConfParamShort(eq("LLM_PROVIDER")))
            .thenReturn(Optional.of(providerParam));

        // For all other LLM_* rows (LLM_BASE_URL, LLM_MODEL, etc.) return empty
        // so that HaLlmConfigService.upsert() creates new entities rather than
        // trying to update non-existent managed objects.
        when(configRepo.findByConfParamShort(anyString()))
            .thenAnswer(inv -> {
                String key = inv.getArgument(0);
                if ("LLM_PROVIDER".equals(key)) {
                    return Optional.of(providerParam);
                }
                return Optional.empty();
            });
    }

    /**
     * Invokes the private {@code init()} method of {@link HaLlmService} via reflection
     * to trigger the {@code @PostConstruct} lifecycle that Spring would normally handle.
     *
     * @param service the service instance on which {@code init()} should be called
     * @throws RuntimeException if the method cannot be accessed or invoked
     */
    private static void invokeInit(HaLlmService service) {
        try {
            java.lang.reflect.Method initMethod =
                HaLlmService.class.getDeclaredMethod("init");
            initMethod.setAccessible(true);
            initMethod.invoke(service);
        } catch (Exception e) {
            throw new RuntimeException("Failed to invoke HaLlmService.init()", e);
        }
    }

    /**
     * Creates a minimal {@link LlmConfigUpdateDTO} with default field values and only
     * the provider field set. Used by multi-step tests where the other fields are
     * irrelevant to the assertion.
     *
     * @param provider the provider name ({@code disabled}, {@code openai}, {@code azure},
     *                 or {@code ollama})
     * @return a valid DTO with the given provider and sensible defaults
     */
    private static LlmConfigUpdateDTO dto(String provider) {
        return new LlmConfigUpdateDTO(provider, "", "", "", 0.2, 2048);
    }

    /**
     * Returns a minimal {@link HaLlmProvider} stub whose {@code providerName()} returns
     * the given name. The {@code chat} and {@code streamChat} methods throw / emit
     * {@link LlmNotConfiguredException}, which is acceptable because no test in this
     * class exercises the actual inference path.
     *
     * @param name stable provider identifier
     * @return a no-op stub implementing {@link HaLlmProvider}
     */
    private static HaLlmProvider namedProvider(final String name) {
        return new HaLlmProvider() {
            @Override public String providerName() { return name; }
            @Override public boolean isConfigured() { return true; }
            @Override public String chat(List<ChatMessage> m, ChatOptions o) {
                throw new LlmNotConfiguredException(name);
            }
            @Override public Flux<String> streamChat(List<ChatMessage> m, ChatOptions o) {
                return Flux.error(new LlmNotConfiguredException(name));
            }
        };
    }
}
