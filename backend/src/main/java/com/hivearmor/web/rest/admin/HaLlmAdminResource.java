package com.hivearmor.web.rest.admin;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.HaLlmConfigService;
import com.hivearmor.service.dto.admin.LlmConfigUpdateDTO;
import com.hivearmor.service.dto.admin.LlmModelsDTO;
import com.hivearmor.service.dto.admin.LlmStatusDTO;
import com.hivearmor.service.dto.admin.PullRequestDTO;
import com.hivearmor.service.llm.OllamaLlmProvider;
import com.hivearmor.service.llm.OllamaPullProgress;
import com.hivearmor.service.llm.event.LlmConfigChangedEvent;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

/**
 * Admin REST controller for LLM provider management.
 *
 * <h3>Endpoint summary</h3>
 * <pre>
 *   GET  /api/ha-admin/llm/status       → LlmStatusDTO (provider, configured, latencyMs)
 *   POST /api/ha-admin/llm/config       → persists config rows then publishes LlmConfigChangedEvent
 *   GET  /api/ha-admin/llm/models       → LlmModelsDTO; 400 unless active provider is "ollama"
 *   POST /api/ha-admin/llm/models/pull  → text/event-stream of OllamaPullProgress; 400 unless "ollama"
 * </pre>
 *
 * <p>Every method requires {@code ROLE_ADMIN}. Non-admin callers receive HTTP 403 from
 * Spring Security before the method body is reached (Requirement 9.5).
 *
 * <p>Requirements: 5.1–5.5, 6.1–6.4, 8.2, 9.5
 */
@RestController
@RequestMapping("/api/ha-admin/llm")
@RequiredArgsConstructor
public class HaLlmAdminResource {

    private static final Logger log = LoggerFactory.getLogger(HaLlmAdminResource.class);

    private final HaLlmService         llmService;
    private final OllamaLlmProvider    ollama;
    private final HaLlmConfigService   configWriter;
    private final ApplicationEventPublisher events;

    // =========================================================================
    // GET /api/ha-admin/llm/status
    // =========================================================================

    /**
     * Returns the current LLM provider status.
     *
     * <p>When the active provider is {@code "ollama"} a live round-trip to
     * {@link OllamaLlmProvider#listModels()} is timed to produce {@code latencyMs}.
     * Any error during the probe (connection refused, timeout, etc.) is caught and
     * results in {@code latencyMs = null} rather than propagating an exception.
     *
     * @return {@link LlmStatusDTO} with {@code configured}, {@code provider}, and
     *         {@code latencyMs} (omitted when null — see {@link LlmStatusDTO})
     *
     * <p>Requirements: 5.1, 6.1
     */
    @GetMapping("/status")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public LlmStatusDTO status() {
        boolean configured = llmService.isConfigured();
        String  provider   = llmService.activeProviderName();
        Long    latencyMs  = null;

        if ("ollama".equals(provider)) {
            latencyMs = probeOllamaLatency();
        }

        log.debug("HaLlmAdminResource.status — provider={}, configured={}, latencyMs={}",
                provider, configured, latencyMs);
        return new LlmStatusDTO(configured, provider, latencyMs);
    }

    // =========================================================================
    // POST /api/ha-admin/llm/config
    // =========================================================================

    /**
     * Persists a full LLM configuration update and triggers a hot-reload.
     *
     * <p>All six rows ({@code LLM_PROVIDER}, {@code LLM_BASE_URL}, {@code LLM_MODEL},
     * {@code LLM_API_KEY}, {@code LLM_TEMPERATURE}, {@code LLM_MAX_TOKENS}) are written
     * inside a single transaction by {@link HaLlmConfigService#persist(LlmConfigUpdateDTO)}.
     * Exactly one {@link LlmConfigChangedEvent} is published after a successful persist,
     * causing {@link HaLlmService} to swing its active-provider reference without a JVM
     * restart (Requirement 6.4).
     *
     * @param dto validated LLM configuration payload
     * @return HTTP 200 with an empty body on success
     *
     * <p>Requirements: 6.2, 6.4
     */
    @PostMapping("/config")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<Void> updateConfig(@Valid @RequestBody LlmConfigUpdateDTO dto) {
        log.debug("HaLlmAdminResource.updateConfig — provider={}", dto.provider());
        configWriter.persist(dto);
        events.publishEvent(new LlmConfigChangedEvent(this));
        log.debug("HaLlmAdminResource.updateConfig — LlmConfigChangedEvent published");
        return ResponseEntity.ok().build();
    }

    // =========================================================================
    // GET /api/ha-admin/llm/models
    // =========================================================================

    /**
     * Lists the models available on the active Ollama instance.
     *
     * <p>Returns HTTP 400 with a plain-text reason when the active provider is anything
     * other than {@code "ollama"}. This prevents the endpoint from being used against
     * non-Ollama providers which have no concept of local model management
     * (Requirements 5.2, 5.3).
     *
     * @return {@link LlmModelsDTO} containing provider name and ordered model list
     * @throws ResponseStatusException HTTP 400 when active provider is not {@code "ollama"}
     *
     * <p>Requirements: 5.2, 5.3, 6.1
     */
    @GetMapping("/models")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public LlmModelsDTO models() {
        requireOllamaProvider("listModels");
        log.debug("HaLlmAdminResource.models — listing models from Ollama");
        return new LlmModelsDTO("ollama", ollama.listModels());
    }

    // =========================================================================
    // POST /api/ha-admin/llm/models/pull  (text/event-stream)
    // =========================================================================

    /**
     * Streams pull progress for a named Ollama model as Server-Sent Events.
     *
     * <p>Returns HTTP 400 when the active provider is not {@code "ollama"}
     * (Requirement 5.4). When the provider is Ollama, delegates to
     * {@link OllamaLlmProvider#pullModel(String)} and wraps each
     * {@link OllamaPullProgress} frame in a {@link ServerSentEvent}.
     *
     * <p>The SSE stream is a reactive {@link Flux} — Spring WebFlux serialises each
     * emitted element to the client as a {@code data:} frame before the next element
     * arrives, enabling real-time download progress in the browser.
     *
     * @param body the validated pull request containing the model name
     * @return a {@link Flux} of {@link ServerSentEvent}&lt;{@link OllamaPullProgress}&gt;
     *         streamed as {@code text/event-stream}
     * @throws ResponseStatusException HTTP 400 when active provider is not {@code "ollama"}
     *
     * <p>Requirements: 5.4, 5.5, 6.3
     */
    @PostMapping(value = "/models/pull", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public Flux<ServerSentEvent<OllamaPullProgress>> pull(@Valid @RequestBody PullRequestDTO body) {
        requireOllamaProvider("pull");
        log.debug("HaLlmAdminResource.pull — starting pull for model={}", body.model());
        return ollama.pullModel(body.model())
                .map(progress -> ServerSentEvent.<OllamaPullProgress>builder()
                        .data(progress)
                        .build());
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /**
     * Guards Ollama-only endpoints: throws HTTP 400 when the active provider is
     * not {@code "ollama"}.
     *
     * @param operation human-readable operation name used in the error message
     * @throws ResponseStatusException HTTP 400
     */
    private void requireOllamaProvider(String operation) {
        if (!"ollama".equals(llmService.activeProviderName())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    operation + " is only supported when the active provider is ollama");
        }
    }

    /**
     * Times a single call to {@link OllamaLlmProvider#listModels()} and returns
     * elapsed milliseconds, or {@code null} when the call throws any exception.
     *
     * <p>Using {@code listModels()} rather than a separate health endpoint mirrors the
     * contract described in the status endpoint spec: probe Ollama for latency. Any
     * transport or application error is caught and silently converted to {@code null}
     * so the status endpoint always returns a usable response.
     *
     * @return round-trip latency in milliseconds, or {@code null} on any failure
     */
    private Long probeOllamaLatency() {
        try {
            long start = System.currentTimeMillis();
            ollama.listModels();
            return System.currentTimeMillis() - start;
        } catch (Exception ex) {
            log.debug("HaLlmAdminResource.probeOllamaLatency — probe failed: {}", ex.getMessage());
            return null;
        }
    }
}
