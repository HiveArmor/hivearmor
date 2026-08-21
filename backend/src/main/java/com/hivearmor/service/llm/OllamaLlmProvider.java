package com.hivearmor.service.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.llm.event.LlmConfigChangedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import reactor.util.retry.Retry;
import reactor.netty.http.client.HttpClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * {@link HaLlmProvider} implementation targeting a self-hosted Ollama server.
 *
 * <p>Configuration is loaded from {@code hive_configuration_parameter} rows
 * {@value KEY_BASE_URL}, {@value KEY_MODEL}, {@value KEY_TEMPERATURE},
 * {@value KEY_MAX_TOKENS} and hot-reloaded on {@link LlmConfigChangedEvent}.
 *
 * <p>Requirements: 1.5, 3.1–3.6, 5.1, 9.2, 9.3
 */
@Component
public class OllamaLlmProvider implements HaLlmProvider {

    private static final Logger log = LoggerFactory.getLogger(OllamaLlmProvider.class);

    static final Duration READ_TIMEOUT       = Duration.ofSeconds(120);
    static final Duration HEALTH_CACHE_TTL   = Duration.ofSeconds(30);
    private static final long HEALTH_CACHE_TTL_SECONDS = HEALTH_CACHE_TTL.getSeconds();
    static final int MAX_RETRY_ATTEMPTS      = 2;

    public static final String KEY_BASE_URL    = "LLM_BASE_URL";
    public static final String KEY_MODEL       = "LLM_MODEL";
    public static final String KEY_TEMPERATURE = "LLM_TEMPERATURE";
    public static final String KEY_MAX_TOKENS  = "LLM_MAX_TOKENS";

    private volatile WebClient webClient;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final UtmConfigurationParameterRepository configRepo;
    private volatile OllamaConfig config;
    private final AtomicReference<HealthProbe> lastProbe = new AtomicReference<>();
    private final AtomicBoolean probing = new AtomicBoolean(false);

    public OllamaLlmProvider(ObjectMapper mapper,
                              Clock clock,
                              UtmConfigurationParameterRepository configRepo) {
        this.mapper     = mapper;
        this.clock      = clock;
        this.configRepo = configRepo;
        this.config     = loadConfig();
        this.webClient  = buildWebClient(this.config.baseUrl());
    }

    // ── identity ─────────────────────────────────────────────────────────────

    @Override
    public String providerName() { return "ollama"; }

    // ── isConfigured — 30-second health probe cache (Requirement 3.5) ────────

    @Override
    public boolean isConfigured() {
        OllamaConfig current = config;
        if (current == null || current.baseUrl() == null || current.baseUrl().isBlank()) {
            return false;
        }
        HealthProbe cached = lastProbe.get();
        if (cached != null) {
            long age = Duration.between(cached.probedAt(), clock.instant()).getSeconds();
            if (age < HEALTH_CACHE_TTL_SECONDS) {
                return cached.healthy();
            }
        }
        if (!probing.compareAndSet(false, true)) {
            HealthProbe stale = lastProbe.get();
            return stale != null && stale.healthy();
        }
        try {
            boolean healthy = executeHealthProbe();
            lastProbe.set(new HealthProbe(healthy, clock.instant()));
            return healthy;
        } catch (Exception ex) {
            log.warn("OllamaLlmProvider: health probe threw — treating as unhealthy", ex);
            lastProbe.set(new HealthProbe(false, clock.instant()));
            return false;
        } finally {
            probing.set(false);
        }
    }

    private boolean executeHealthProbe() {
        try {
            webClient.get().uri("/api/tags").retrieve().toBodilessEntity().block();
            return true;
        } catch (WebClientResponseException ex) {
            log.debug("OllamaLlmProvider: probe HTTP {} — unhealthy", ex.getStatusCode().value());
            return false;
        } catch (WebClientRequestException ex) {
            log.debug("OllamaLlmProvider: probe transport failure — {}", ex.getMessage());
            return false;
        }
    }

    // ── chat (blocking) ───────────────────────────────────────────────────────

    /** Requirements: 3.1, 3.6 */
    @Override
    public String chat(List<ChatMessage> messages, ChatOptions options) {
        return streamChat(messages, options)
                .collectList()
                .map(tokens -> String.join("", tokens))
                .block();
    }

    // ── streamChat — NDJSON pipeline (Requirements 3.1, 3.6) ─────────────────

    /**
     * Issues POST /api/chat with stream=true and returns token-level deltas.
     * Pipeline: request body → DataBuffer flux → decodeNdjson →
     * takeUntil(done) → filter(!done) → map(message.content) → retryWhen.
     */
    @Override
    public Flux<String> streamChat(List<ChatMessage> messages, ChatOptions options) {
        OllamaConfig current = config;
        String model = (options != null && options.model() != null && !options.model().isBlank())
                ? options.model()
                : current.model();
        OllamaChatRequest request = new OllamaChatRequest(model, toOllamaMessages(messages), true, options);

        return webClient.post()
                .uri("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .retrieve()
                .bodyToFlux(DataBuffer.class)
                .transform(this::decodeNdjson)
                .takeUntil(node -> node.path("done").asBoolean(false))
                .filter(node -> !node.path("done").asBoolean(false))
                .map(node -> node.path("message").path("content").asText(""))
                .retryWhen(retrySpecForRequestErrors());
    }

    // ── NDJSON decoder ────────────────────────────────────────────────────────

    /**
     * Line-buffers DataBuffer chunks, splits on newlines, parses each non-empty
     * line as JSON. Releases each DataBuffer to prevent Reactor Netty pool leaks.
     */
    Flux<JsonNode> decodeNdjson(Flux<DataBuffer> buffers) {
        return Flux.create(sink -> {
            StringBuilder acc = new StringBuilder();
            buffers.subscribe(
                    buffer -> {
                        String chunk;
                        try {
                            chunk = buffer.toString(StandardCharsets.UTF_8);
                        } finally {
                            DataBufferUtils.release(buffer);
                        }
                        acc.append(chunk);
                        int idx;
                        while ((idx = acc.indexOf("\n")) >= 0) {
                            String line = acc.substring(0, idx).trim();
                            acc.delete(0, idx + 1);
                            if (!line.isEmpty()) {
                                try { sink.next(mapper.readTree(line)); }
                                catch (IOException e) {
                                    log.warn("OllamaLlmProvider: skipping non-JSON line: {}", e.getMessage());
                                }
                            }
                        }
                    },
                    sink::error,
                    () -> {
                        String tail = acc.toString().trim();
                        if (!tail.isEmpty()) {
                            try { sink.next(mapper.readTree(tail)); }
                            catch (IOException e) {
                                log.warn("OllamaLlmProvider: skipping non-JSON tail: {}", e.getMessage());
                            }
                        }
                        sink.complete();
                    }
            );
        });
    }

    // ── listModels (Requirements 3.2, 3.6, 5.1) ──────────────────────────────

    public List<OllamaModel> listModels() {
        return webClient.get()
                .uri("/api/tags")
                .retrieve()
                .bodyToMono(OllamaTagsResponse.class)
                .map(OllamaTagsResponse::models)
                .retryWhen(retrySpecForRequestErrors())
                .block();
    }

    // ── pullModel (Requirements 3.3, 3.6) ────────────────────────────────────

    public Flux<OllamaPullProgress> pullModel(String modelName) {
        return webClient.post()
                .uri("/api/pull")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("name", modelName, "stream", true))
                .retrieve()
                .bodyToFlux(DataBuffer.class)
                .transform(this::decodeNdjson)
                .map(node -> mapper.convertValue(node, OllamaPullProgress.class))
                .retryWhen(retrySpecForRequestErrors());
    }

    // ── config hot-reload ─────────────────────────────────────────────────────

    @EventListener
    public void onLlmConfigChanged(LlmConfigChangedEvent event) {
        config    = loadConfig();
        webClient = buildWebClient(config.baseUrl());
        lastProbe.set(null);
        log.debug("OllamaLlmProvider: config reloaded — baseUrl={}", safePrefix(config.baseUrl()));
    }

    // ── internal helpers ──────────────────────────────────────────────────────

    private WebClient buildWebClient(String baseUrl) {
        HttpClient httpClient = HttpClient.create().responseTimeout(READ_TIMEOUT);
        WebClient.Builder builder = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(httpClient));
        if (baseUrl != null && !baseUrl.isBlank()) {
            builder.baseUrl(baseUrl);
        }
        return builder.build();
    }

    Retry retrySpecForRequestErrors() {
        return Retry.max(MAX_RETRY_ATTEMPTS)
                    .filter(WebClientRequestException.class::isInstance);
    }

    private OllamaConfig loadConfig() {
        String baseUrl = readParam(KEY_BASE_URL);
        String model   = readParam(KEY_MODEL);
        Double temperature = null;
        String tempStr = readParam(KEY_TEMPERATURE);
        if (tempStr != null) {
            try { temperature = Double.parseDouble(tempStr); }
            catch (NumberFormatException e) {
                log.warn("OllamaLlmProvider: invalid LLM_TEMPERATURE '{}' — using null", tempStr);
            }
        }
        Integer maxTokens = null;
        String tokStr = readParam(KEY_MAX_TOKENS);
        if (tokStr != null) {
            try { maxTokens = Integer.parseInt(tokStr); }
            catch (NumberFormatException e) {
                log.warn("OllamaLlmProvider: invalid LLM_MAX_TOKENS '{}' — using null", tokStr);
            }
        }
        return new OllamaConfig(baseUrl, model, temperature, maxTokens);
    }

    private String readParam(String key) {
        return configRepo.findByConfParamShort(key)
                .map(p -> {
                    String v = p.getConfParamValue();
                    return (v == null || v.isBlank()) ? null : v.trim();
                })
                .orElse(null);
    }

    private static List<OllamaMessage> toOllamaMessages(List<ChatMessage> messages) {
        return messages.stream()
                .map(m -> new OllamaMessage(m.role(), m.content()))
                .toList();
    }

    private static String safePrefix(String url) {
        if (url == null || url.isBlank()) return "<empty>";
        return url.length() > 30 ? url.substring(0, 30) + "…" : url;
    }

    // ── inner records ─────────────────────────────────────────────────────────

    /** Snapshot of Ollama connection parameters. */
    public record OllamaConfig(String baseUrl, String model, Double temperature, Integer maxTokens) {}

    /** Cached health probe result. */
    public record HealthProbe(boolean healthy, Instant probedAt) {}

    /** Ollama wire-format chat message. */
    public record OllamaMessage(String role, String content) {}

    /**
     * Request body for POST /api/chat.
     * The compact constructor maps a {@link ChatOptions} to {@link OllamaChatOptions}.
     */
    public record OllamaChatRequest(
            String model,
            List<OllamaMessage> messages,
            boolean stream,
            OllamaChatOptions options
    ) {
        public OllamaChatRequest(String model, List<OllamaMessage> messages,
                                 boolean stream, ChatOptions opts) {
            this(model, messages, stream,
                    opts != null ? new OllamaChatOptions(opts.temperature(), opts.maxTokens()) : null);
        }
    }

    /** Ollama generation options sub-object. Null fields are omitted from JSON. */
    public record OllamaChatOptions(Double temperature, Integer num_predict) {}
}
