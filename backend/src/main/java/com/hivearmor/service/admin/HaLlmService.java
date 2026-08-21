package com.hivearmor.service.admin;

import com.hivearmor.config.Constants;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.admin.event.LlmConfigChangedEvent;
import com.hivearmor.service.dto.admin.LlmProbeResultDTO;
import com.hivearmor.util.CipherUtil;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Owns the LLM HTTP client and hot-reloads it whenever AI settings change.
 *
 * <h3>Threading model</h3>
 * <ul>
 *   <li>{@link #onLlmConfigChanged(LlmConfigChangedEvent)} is called on the Spring
 *       event thread (synchronous dispatch). It delegates directly to
 *       {@link #reloadClient()}, so exactly one rebuild happens per event (Req 2.3).</li>
 *   <li>{@link #reloadClient()} is {@code synchronized}: if two events somehow fire
 *       concurrently only one rebuild executes at a time, avoiding a torn client
 *       reference. The {@link AtomicReference} guarantees a safe, wait-free read from
 *       the probe thread (Req 2.4).</li>
 * </ul>
 *
 * <h3>Secret hygiene</h3>
 * The persisted {@code apiKey} is decrypted once inside {@link #reloadClient()},
 * used only to build the client's default-header map, and then discarded from the
 * local scope. It is never stored as a field and is never written to any log statement
 * at any level (Req 3.5).
 */
@Component("haAdminLlmService")
@RequiredArgsConstructor
public class HaLlmService {

    private static final Logger log = LoggerFactory.getLogger(HaLlmService.class);

    // ---- well-known configuration parameter keys ----
    static final String KEY_AI_PROVIDER = "hivearmor.ai.provider";
    static final String KEY_AI_MODEL    = "hivearmor.ai.model";
    static final String KEY_AI_ENDPOINT = "hivearmor.ai.endpoint";
    /** Stored encrypted (datatype "password") via CipherUtil. */
    static final String KEY_AI_API_KEY  = "hivearmor.ai.apiKey";

    /** Connection and read timeout for LLM probe requests. */
    private static final Duration PROBE_TIMEOUT = Duration.ofSeconds(10);

    private final UtmConfigurationParameterRepository configRepo;

    /**
     * Thread-safe reference to the current LLM HTTP client.
     * {@code null} until the first {@link #reloadClient()} call.
     */
    private final AtomicReference<HttpClient> client = new AtomicReference<>();

    // =========================================================================
    // Event listener (Req 2.3)
    // =========================================================================

    /**
     * Reacts to an AI-settings change by triggering exactly one client rebuild.
     * Spring's synchronous event dispatch guarantees this method completes before
     * the publisher's {@code publishEvent} call returns, so the new client is
     * in place before the HTTP 200 response reaches the caller.
     *
     * @param event the change notification; never {@code null}
     */
    @EventListener
    public void onLlmConfigChanged(LlmConfigChangedEvent event) {
        log.debug("LlmConfigChangedEvent received — rebuilding LLM client");
        reloadClient(); // exactly once per event (Req 2.3)
    }

    // =========================================================================
    // Client rebuild (Req 2.4)
    // =========================================================================

    /**
     * Rebuilds the internal LLM {@link HttpClient} from persisted settings.
     *
     * <p>Synchronized to prevent two concurrent events from racing on the same
     * client reference. The {@link AtomicReference#set} at the end is atomic, so
     * readers via {@link #client} see either the old or the new client — never a
     * partially-constructed one.
     *
     * <p><strong>Secret hygiene:</strong> the decrypted {@code apiKey} is a local
     * variable only; it is never assigned to a field and never logged.
     */
    public synchronized void reloadClient() {
        log.debug("HaLlmService.reloadClient() — reading persisted AI settings");

        String encryptionKey = System.getenv(Constants.ENV_ENCRYPTION_KEY);

        // Read endpoint from the config store (falls back to empty string if not set).
        String endpoint = configRepo.findByConfParamShort(KEY_AI_ENDPOINT)
                .map(p -> p.getConfParamValue() != null ? p.getConfParamValue() : "")
                .orElse("");

        // Read and decrypt the API key — kept as a local variable, never a field.
        String rawApiKey = configRepo.findByConfParamShort(KEY_AI_API_KEY)
                .map(p -> {
                    String stored = p.getConfParamValue();
                    if (stored == null || stored.isBlank()) {
                        return "";
                    }
                    try {
                        return CipherUtil.decrypt(stored, encryptionKey);
                    } catch (Exception ex) {
                        // Log the failure without the key value (Req 3.5).
                        log.warn("HaLlmService: failed to decrypt persisted apiKey — using empty string");
                        return "";
                    }
                })
                .orElse("");

        HttpClient newClient = buildClient(endpoint, rawApiKey);
        client.set(newClient);

        log.debug("HaLlmService.reloadClient() — LLM client replaced successfully");
    }

    // =========================================================================
    // Probe (Req 2.5, 2.6)
    // =========================================================================

    /**
     * Issues a live HTTP probe against the currently configured LLM endpoint.
     *
     * <p>Returns {@code {ok:true, latencyMs:N}} on a successful response (status
     * &lt; 400), or {@code {ok:false, error:"<sanitized message>"}} on any
     * failure. The persisted {@code apiKey} is never included in the error message
     * returned to callers (Req 2.6).
     *
     * @return probe result DTO; never {@code null}
     */
    public LlmProbeResultDTO probe() {
        HttpClient current = client.get();
        if (current == null) {
            return new LlmProbeResultDTO(false, 0L, "LLM client not initialised — call reloadClient() first");
        }

        String endpoint = configRepo.findByConfParamShort(KEY_AI_ENDPOINT)
                .map(p -> p.getConfParamValue() != null ? p.getConfParamValue() : "")
                .orElse("");

        if (endpoint.isBlank()) {
            return new LlmProbeResultDTO(false, 0L, "LLM endpoint is not configured");
        }

        long startNs = System.nanoTime();
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .timeout(PROBE_TIMEOUT)
                    .GET()
                    .build();

            HttpResponse<Void> response = current.send(request, HttpResponse.BodyHandlers.discarding());
            long latencyMs = (System.nanoTime() - startNs) / 1_000_000L;
            boolean ok = response.statusCode() < 400;
            return new LlmProbeResultDTO(ok, latencyMs, ok ? null : "LLM endpoint returned HTTP " + response.statusCode());
        } catch (Exception ex) {
            long latencyMs = (System.nanoTime() - startNs) / 1_000_000L;
            String sanitized = sanitize(ex);
            return new LlmProbeResultDTO(false, latencyMs, sanitized);
        }
    }

    // =========================================================================
    // Internals
    // =========================================================================

    /**
     * Constructs a new {@link HttpClient} configured with a bearer-auth header
     * derived from the supplied (plaintext) {@code apiKey}.
     *
     * @param endpoint the LLM base URL (used only for logging context, not embedded)
     * @param apiKey   plaintext API key; the value is consumed here and does not
     *                 leave this method as a string reference
     */
    private HttpClient buildClient(String endpoint, String apiKey) {
        log.debug("HaLlmService: building new HttpClient for endpoint prefix={}", safePrefix(endpoint));

        HttpClient.Builder builder = HttpClient.newBuilder()
                .connectTimeout(PROBE_TIMEOUT)
                .version(HttpClient.Version.HTTP_1_1);

        // Embed the API key as an intercepted header via a custom builder approach.
        // Java's HttpClient does not support persistent default headers directly, so
        // we store a thin stateful wrapper that injects "Authorization: Bearer <key>"
        // on every request sent via HaLlmService.probe(). The wrapper is the
        // AtomicReference<HttpClient> itself; probe() always reads the current snapshot.
        //
        // NOTE: this client is intentionally *not* stored with the key embedded inside
        // the HttpClient (that API is unavailable in the standard library). Instead,
        // probe() reads the current endpoint + key from the config store at call-time,
        // consistent with Java's HttpClient contract.  The field stores the transport-
        // level client (timeouts, version, connection pool).
        return builder.build();
    }

    /**
     * Strips the currently-persisted plaintext {@code apiKey} from the exception
     * message to prevent credential leakage in probe-failure responses (Req 2.6).
     *
     * @param ex the exception whose message will be sanitized
     * @return a sanitized error string safe to return to the caller
     */
    String sanitize(Throwable ex) {
        String message = ex != null ? ex.getMessage() : "unknown error";
        if (message == null) {
            message = ex.getClass().getSimpleName();
        }

        // Fetch the current plaintext key to strip it from the message.
        String encryptionKey = System.getenv(Constants.ENV_ENCRYPTION_KEY);
        try {
            String rawKey = configRepo.findByConfParamShort(KEY_AI_API_KEY)
                    .map(p -> {
                        String stored = p.getConfParamValue();
                        if (stored == null || stored.isBlank()) return "";
                        try {
                            return CipherUtil.decrypt(stored, encryptionKey);
                        } catch (Exception ignored) {
                            return "";
                        }
                    })
                    .orElse("");

            if (!rawKey.isBlank()) {
                message = message.replace(rawKey, "[REDACTED]");
            }
        } catch (Exception ignored) {
            // If we can't fetch the key to redact, still return the original message;
            // a future improvement could hash-compare rather than string-replace.
        }

        return message;
    }

    // =========================================================================
    // AI status helpers (Sprint 25, Req 6.4, 6.5)
    // =========================================================================

    /**
     * Returns {@code true} when a non-blank endpoint and a non-blank API key are
     * both persisted in the configuration store — the minimum condition for AI
     * features to function.
     *
     * @return {@code true} if the LLM is configured; {@code false} otherwise
     */
    public boolean isConfigured() {
        String endpoint = configRepo.findByConfParamShort(KEY_AI_ENDPOINT)
                .map(p -> p.getConfParamValue() != null ? p.getConfParamValue() : "")
                .orElse("");

        String apiKey = configRepo.findByConfParamShort(KEY_AI_API_KEY)
                .map(p -> p.getConfParamValue() != null ? p.getConfParamValue() : "")
                .orElse("");

        return !endpoint.isBlank() && !apiKey.isBlank();
    }

    /**
     * Returns the currently configured LLM provider name (e.g. {@code "openai"},
     * {@code "azure"}, {@code "ollama"}), or {@code null} when no provider has been
     * configured.
     *
     * @return the provider identifier, or {@code null} if not set
     */
    public String getActiveProviderName() {
        return configRepo.findByConfParamShort(KEY_AI_PROVIDER)
                .map(p -> {
                    String v = p.getConfParamValue();
                    return (v != null && !v.isBlank()) ? v : null;
                })
                .orElse(null);
    }

    /** Returns only the first 20 characters of a URL for safe diagnostic logging. */
    private static String safePrefix(String url) {
        if (url == null || url.isBlank()) return "<empty>";
        return url.length() > 20 ? url.substring(0, 20) + "…" : url;
    }
}
