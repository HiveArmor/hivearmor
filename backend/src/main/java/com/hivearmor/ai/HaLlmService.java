package com.hivearmor.ai;

import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.service.llm.HaLlmProvider;
import com.hivearmor.service.llm.ProviderRegistry;
import com.hivearmor.service.llm.event.LlmConfigChangedEvent;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Sprint 27 refactor — LLM service facade that delegates every call to the
 * currently active {@link HaLlmProvider}.
 *
 * <p>The active provider is selected from the {@code LLM_PROVIDER} row in
 * {@code hive_configuration_parameter} at startup (via {@link #init()}) and
 * hot-reloads whenever a {@link LlmConfigChangedEvent} is published (via
 * {@link #onConfigChanged(LlmConfigChangedEvent)}) without a JVM restart.
 *
 * <h3>Backward-compatibility contract</h3>
 * <p>All pre-Sprint-27 public method signatures are preserved exactly:
 * <ul>
 *   <li>{@link #chat(List, String)} — accepts {@link ChatMessage} (com.hivearmor.ai) + systemPrompt string</li>
 *   <li>{@link #streamChat(List, String)} — same parameter types</li>
 *   <li>{@link #isConfigured()} — delegates to active provider</li>
 *   <li>{@link #getActiveProviderName()} — delegates to active provider</li>
 * </ul>
 *
 * <h3>Sprint-27 additions</h3>
 * <ul>
 *   <li>{@link #chat(List, ChatOptions)} — new-style overload accepting llm-package ChatMessage</li>
 *   <li>{@link #streamChat(List, ChatOptions)} — new-style overload accepting llm-package ChatMessage</li>
 *   <li>{@link #activeProviderName()} — alias for {@link #getActiveProviderName()}</li>
 * </ul>
 *
 * <p>Requirements: 1.6, 2.1, 2.2, 2.3, 2.5, 6.4
 */
@Service
public class HaLlmService {

    private static final Logger log = LoggerFactory.getLogger(HaLlmService.class);

    /** Config key used by older Sprint-25 logic — kept for backward compatibility. */
    static final String KEY_AI_PROVIDER = "hivearmor.ai.provider";

    /** Config key for the Sprint-27 provider selection. */
    private static final String LLM_PROVIDER_KEY = "LLM_PROVIDER";

    private final ProviderRegistry providers;
    private final UtmConfigurationParameterRepository configRepo;

    /**
     * Thread-safe reference to the currently active provider.
     * Initialised by {@link #init()} and updated by {@link #reload()}.
     * Not injected — initialised inline so Lombok's generated constructor is unaffected.
     */
    @SuppressWarnings("java:S2390") // field is initialised here; init() sets the real value
    private final AtomicReference<HaLlmProvider> active = new AtomicReference<>();

    public HaLlmService(ProviderRegistry providers, UtmConfigurationParameterRepository configRepo) {
        this.providers  = providers;
        this.configRepo = configRepo;
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    /**
     * Initialises the active provider on startup by calling {@link #reload()}.
     * Executed once after all Spring beans are wired.
     */
    @PostConstruct
    void init() {
        reload();
    }

    // =========================================================================
    // Hot-reload on settings change
    // =========================================================================

    /**
     * Reacts to a Sprint-27 {@link LlmConfigChangedEvent} by re-selecting the active provider.
     * Spring's synchronous dispatch guarantees this completes before {@code publishEvent} returns.
     *
     * @param evt the change notification; never {@code null}
     */
    @EventListener
    public void onConfigChanged(LlmConfigChangedEvent evt) {
        log.debug("LlmConfigChangedEvent (Sprint-27) received — reloading active provider");
        reload();
    }

    /**
     * Reacts to the legacy Sprint-25 {@link com.hivearmor.service.admin.event.LlmConfigChangedEvent}
     * for backward compatibility with {@code HaSystemSettingsController}.
     *
     * @param evt the legacy change notification
     */
    @EventListener
    public void onLegacyConfigChanged(com.hivearmor.service.admin.event.LlmConfigChangedEvent evt) {
        log.debug("LlmConfigChangedEvent (legacy Sprint-25) received — reloading active provider");
        reload();
    }

    /**
     * Re-reads {@code LLM_PROVIDER} from the configuration store and swings the
     * {@link #active} reference to the matching provider bean, falling back to
     * {@code DisabledLlmProvider} when the key is absent or unknown.
     *
     * <p>Requirements: 2.1, 2.2
     */
    private void reload() {
        String key = configRepo.findByConfParamShort(LLM_PROVIDER_KEY)
            .map(p -> {
                String v = p.getConfParamValue();
                return (v == null || v.isBlank()) ? "disabled" : v;
            })
            .orElse("disabled");

        HaLlmProvider next = providers.forName(key).orElseGet(providers::disabled);
        active.set(next);
        log.debug("HaLlmService.reload() — active provider set to '{}'", next.providerName());
    }

    // =========================================================================
    // Sprint-27 public API
    // =========================================================================

    /**
     * Performs a synchronous chat completion using the currently active provider.
     *
     * <p>Accepts the new Sprint-27 {@link com.hivearmor.service.llm.ChatMessage} record type.
     *
     * @param messages conversation history (Sprint-27 ChatMessage type)
     * @param options  generation options; may be {@code null} for provider defaults
     * @return the LLM's text response
     * @throws LlmNotConfiguredException if the active provider is not configured
     * @see com.hivearmor.service.llm.ChatMessage
     */
    public String chat(List<com.hivearmor.service.llm.ChatMessage> messages, ChatOptions options) {
        return active.get().chat(messages, options);
    }

    /**
     * Returns a reactive token stream using the currently active provider.
     *
     * <p>Accepts the new Sprint-27 {@link com.hivearmor.service.llm.ChatMessage} record type.
     *
     * @param messages conversation history (Sprint-27 ChatMessage type)
     * @param options  generation options; may be {@code null} for provider defaults
     * @return a {@link Flux} of text deltas
     */
    public Flux<String> streamChat(List<com.hivearmor.service.llm.ChatMessage> messages, ChatOptions options) {
        return active.get().streamChat(messages, options);
    }

    /**
     * Returns the stable identifier of the currently active provider (e.g.
     * {@code "disabled"}, {@code "openai"}, {@code "azure"}, {@code "ollama"}).
     *
     * <p>Sprint-27 addition — mirrors {@link #getActiveProviderName()} with the
     * canonical Sprint-27 naming convention.
     *
     * @return provider name; never {@code null}
     */
    public String activeProviderName() {
        return active.get().providerName();
    }

    // =========================================================================
    // Pre-Sprint-27 public API — preserved exactly (Requirements: 1.6)
    // =========================================================================

    /**
     * Performs a synchronous chat completion.
     *
     * <p><strong>Pre-Sprint-27 signature preserved.</strong> Accepts the legacy
     * {@link ChatMessage} (com.hivearmor.ai package) and a plain system-prompt string.
     * Converts to the Sprint-27 message list internally before delegating to the
     * active provider.
     *
     * @param messages     conversation history (legacy ChatMessage type)
     * @param systemPrompt system-level instruction; prepended as a system message when non-blank
     * @return full LLM response text
     * @throws LlmNotConfiguredException if the active provider is not configured
     */
    public String chat(List<ChatMessage> messages, String systemPrompt) {
        return active.get().chat(toLlmMessages(messages, systemPrompt), null);
    }

    /**
     * Returns a reactive token stream.
     *
     * <p><strong>Pre-Sprint-27 signature preserved.</strong> Accepts the legacy
     * {@link ChatMessage} (com.hivearmor.ai package) and a plain system-prompt string.
     *
     * @param messages     conversation history (legacy ChatMessage type)
     * @param systemPrompt system-level instruction; prepended as a system message when non-blank
     * @return non-null {@link Flux} of text deltas
     */
    public Flux<String> streamChat(List<ChatMessage> messages, String systemPrompt) {
        return active.get().streamChat(toLlmMessages(messages, systemPrompt), null);
    }

    /**
     * Returns {@code true} when the active provider reports it is configured and ready.
     *
     * <p><strong>Pre-Sprint-27 signature preserved.</strong>
     *
     * @return {@code true} if the active provider is configured; {@code false} otherwise
     */
    public boolean isConfigured() {
        return active.get().isConfigured();
    }

    /**
     * Returns the stable identifier of the currently active provider.
     *
     * <p><strong>Pre-Sprint-27 signature preserved.</strong> Equivalent to
     * {@link #activeProviderName()}.
     *
     * @return provider name such as {@code "openai"}, {@code "ollama"}, or {@code "disabled"};
     *         never {@code null}
     */
    public String getActiveProviderName() {
        return active.get().providerName();
    }

    // =========================================================================
    // Internals
    // =========================================================================

    /**
     * Converts a list of legacy {@link ChatMessage} values (com.hivearmor.ai package) plus a
     * plain system-prompt string into a list of Sprint-27
     * {@link com.hivearmor.service.llm.ChatMessage} records.
     *
     * <p>When {@code systemPrompt} is non-blank it is prepended as a {@code "system"} message.
     *
     * @param messages     legacy message list; must not be {@code null}
     * @param systemPrompt system instruction string; may be {@code null} or blank
     * @return adapted message list for the active provider
     */
    private List<com.hivearmor.service.llm.ChatMessage> toLlmMessages(
            List<ChatMessage> messages, String systemPrompt) {

        java.util.ArrayList<com.hivearmor.service.llm.ChatMessage> result =
            new java.util.ArrayList<>();

        if (systemPrompt != null && !systemPrompt.isBlank()) {
            result.add(new com.hivearmor.service.llm.ChatMessage("system", systemPrompt));
        }

        if (messages != null) {
            messages.stream()
                .map(m -> new com.hivearmor.service.llm.ChatMessage(m.getRole(), m.getContent()))
                .forEach(result::add);
        }

        return java.util.Collections.unmodifiableList(result);
    }
}
