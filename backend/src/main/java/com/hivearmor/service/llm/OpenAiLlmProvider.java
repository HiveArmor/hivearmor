package com.hivearmor.service.llm;

import com.hivearmor.repository.UtmConfigurationParameterRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * {@link HaLlmProvider} implementation that targets the OpenAI chat completions API.
 *
 * <h3>Configuration</h3>
 * All credentials and endpoint settings are read at call time from the
 * {@code hive_configuration_parameter} table via
 * {@link UtmConfigurationParameterRepository} — no values are hardcoded.
 *
 * <table border="1">
 *   <tr><th>Parameter key</th><th>Purpose</th></tr>
 *   <tr><td>{@value #KEY_API_KEY}</td><td>OpenAI API key (required)</td></tr>
 *   <tr><td>{@value #KEY_BASE_URL}</td><td>Base URL override (optional; defaults to the official OpenAI endpoint)</td></tr>
 *   <tr><td>{@value #KEY_MODEL}</td><td>Model identifier (e.g. {@code "gpt-4o"})</td></tr>
 * </table>
 *
 * <h3>Security invariants</h3>
 * <ul>
 *   <li>No hardcoded API keys, credentials, or secrets — all read from the DB.</li>
 *   <li>TLS uses the JVM default trust store. {@code InsecureSkipVerify} and
 *       {@code InsecureTrustManagerFactory} are never enabled.</li>
 *   <li>Class lives under the {@code com.hivearmor} package root.</li>
 * </ul>
 *
 * <h3>Sprint 27 status</h3>
 * This is a skeleton. {@link #chat} and {@link #streamChat} throw
 * {@link UnsupportedOperationException} until the full OpenAI HTTP client
 * implementation is delivered in a later task.
 *
 * <p>Requirements: 1.5, 9.2, 9.3
 */
@Component
@RequiredArgsConstructor
public class OpenAiLlmProvider implements HaLlmProvider {

    private static final Logger log = LoggerFactory.getLogger(OpenAiLlmProvider.class);

    /** {@code hive_configuration_parameter} key for the OpenAI API key. */
    public static final String KEY_API_KEY  = "LLM_API_KEY";

    /** {@code hive_configuration_parameter} key for the OpenAI base URL. */
    public static final String KEY_BASE_URL = "LLM_BASE_URL";

    /** {@code hive_configuration_parameter} key for the active model identifier. */
    public static final String KEY_MODEL    = "LLM_MODEL";

    private final UtmConfigurationParameterRepository configRepo;

    // -------------------------------------------------------------------------
    // HaLlmProvider — chat operations (skeleton — full impl in later task)
    // -------------------------------------------------------------------------

    /**
     * {@inheritDoc}
     *
     * <p><b>Skeleton:</b> throws {@link UnsupportedOperationException}.
     * Full implementation (POST to {@code /v1/chat/completions}) will be added
     * in the T02 session.
     *
     * @throws UnsupportedOperationException always, until full impl is delivered
     */
    @Override
    public String chat(List<ChatMessage> messages, ChatOptions options) {
        throw new UnsupportedOperationException(
            "OpenAiLlmProvider.chat is not yet implemented — coming in T02");
    }

    /**
     * {@inheritDoc}
     *
     * <p><b>Skeleton:</b> returns a {@link Flux} that immediately errors with
     * {@link UnsupportedOperationException}.
     * Full streaming implementation will be added in the T02 session.
     *
     * @return a Flux that immediately terminates with {@link UnsupportedOperationException}
     */
    @Override
    public Flux<String> streamChat(List<ChatMessage> messages, ChatOptions options) {
        return Flux.error(new UnsupportedOperationException(
            "OpenAiLlmProvider.streamChat is not yet implemented — coming in T02"));
    }

    // -------------------------------------------------------------------------
    // HaLlmProvider — configuration / health
    // -------------------------------------------------------------------------

    /**
     * Returns {@code true} when a non-blank API key is present in the
     * {@code hive_configuration_parameter} table under {@value #KEY_API_KEY}.
     *
     * <p>No network probe is performed — this check is intentionally fast and
     * purely config-driven. The OpenAI endpoint is a public SaaS; liveness is
     * confirmed by a successful API call rather than a dedicated health probe.
     *
     * @return {@code true} if the API key is configured and non-blank
     */
    @Override
    public boolean isConfigured() {
        String apiKey = readParam(KEY_API_KEY);
        return StringUtils.hasText(apiKey);
    }

    /**
     * Returns the stable provider identifier {@code "openai"}.
     */
    @Override
    public String providerName() {
        return "openai";
    }

    // -------------------------------------------------------------------------
    // Config accessors — package-visible for tests
    // -------------------------------------------------------------------------

    /**
     * Reads the configured API key from the parameter store.
     * Returns {@code null} when the key is absent or blank.
     *
     * @return raw API key value, or {@code null}
     */
    String apiKey() {
        String v = readParam(KEY_API_KEY);
        return StringUtils.hasText(v) ? v : null;
    }

    /**
     * Reads the configured base URL from the parameter store.
     * Returns {@code null} when the key is absent or blank.
     *
     * @return base URL override, or {@code null} to use the official OpenAI endpoint
     */
    String baseUrl() {
        String v = readParam(KEY_BASE_URL);
        return StringUtils.hasText(v) ? v : null;
    }

    /**
     * Reads the configured model identifier from the parameter store.
     * Returns {@code null} when the key is absent or blank.
     *
     * @return model name, or {@code null}
     */
    String model() {
        String v = readParam(KEY_MODEL);
        return StringUtils.hasText(v) ? v : null;
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Looks up a single {@code hive_configuration_parameter} row by its short key
     * and returns its value, or {@code null} when the row is absent.
     *
     * @param key the {@code conf_param_short} key to look up
     * @return the stored value string, or {@code null}
     */
    private String readParam(String key) {
        return configRepo.findByConfParamShort(key)
            .map(p -> {
                String v = p.getConfParamValue();
                if (!StringUtils.hasText(v)) {
                    log.trace("OpenAiLlmProvider: config key '{}' is present but blank", key);
                }
                return v;
            })
            .orElse(null);
    }
}
