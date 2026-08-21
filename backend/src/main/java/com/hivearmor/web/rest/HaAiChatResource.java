package com.hivearmor.web.rest;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.HaAiChatService;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.web.rest.dto.AiChatHistoryDTO;
import com.hivearmor.web.rest.dto.AiChatRequestDTO;
import com.hivearmor.web.rest.dto.AiIncidentSummaryDTO;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * REST controller exposing the AI Chat endpoints under {@code /api/ha-ai}.
 *
 * <p>Every method is guarded by {@link #AI_AUTH} — only users with the
 * {@code ANALYST} or {@code ADMIN} authority may call these endpoints.
 *
 * <p>The principal is always resolved from the Spring Security context via
 * {@link Principal#getName()} and is never taken from the request body.
 *
 * <h3>SSE streaming ({@code POST /chat})</h3>
 * <p>The response is a {@code text/event-stream} of JSON objects. Spring's reactive
 * pipeline wraps each emitted {@link String} in {@code data:…\n\n} automatically
 * when the return type is {@code Flux<String>}. The stream shape is:
 * <ul>
 *   <li>N incremental frames: {@code {"delta":"<chunk>","done":false}}</li>
 *   <li>Exactly one terminal frame: {@code {"delta":"","done":true,"totalTokens":<N>}}</li>
 * </ul>
 *
 * <p>Requirements: 5.3, 5.4, 6.1, 6.2, 13.7, 17.6, 22.1
 */
@RestController
@RequestMapping("/api/ha-ai")
public class HaAiChatResource {

    /**
     * Spring Security expression applied to every endpoint in this controller.
     * Only {@code ANALYST} or {@code ADMIN} authority holders are permitted.
     */
    private static final String AI_AUTH =
        "hasAuthority('ANALYST') or hasAuthority('ADMIN')";

    private final HaAiChatService service;
    private final ObjectMapper mapper;

    public HaAiChatResource(HaAiChatService service, ObjectMapper mapper) {
        this.service = service;
        this.mapper  = mapper;
    }

    // =========================================================================
    // POST /chat — streaming SSE
    // =========================================================================

    /**
     * Streams an AI chat response as {@code text/event-stream}.
     *
     * <p>Delegates to {@link HaAiChatService#streamChat} for the raw delta tokens
     * and wraps them as JSON SSE frames. A single terminal frame with
     * {@code "done":true} and the accumulated {@code totalTokens} count is
     * appended via {@code concatWith} so it is emitted exactly once after all
     * deltas complete.
     *
     * @param request the chat request body (validated)
     * @param p       the authenticated principal — login read via {@link Principal#getName()}
     * @return a {@code Flux<String>} of SSE JSON frames
     */
    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize(AI_AUTH)
    public Flux<String> chat(@Valid @RequestBody AiChatRequestDTO request, Principal p) {
        AtomicInteger tokenCount = new AtomicInteger(0);

        Flux<String> deltas = service.streamChat(request, currentUser(p))
            .map(chunk -> {
                tokenCount.incrementAndGet();
                return sseFrame(Map.of("delta", chunk, "done", false));
            });

        Flux<String> terminal = Flux.defer(() -> Flux.just(
            sseFrame(Map.of("delta", "", "done", true, "totalTokens", tokenCount.get()))
        ));

        return deltas.concatWith(terminal);
    }

    // =========================================================================
    // POST /chat/history — persist conversation
    // =========================================================================

    /**
     * Persists the current conversation as a history entry scoped to the caller.
     *
     * @param req the chat request containing the message list and context metadata
     * @param p   the authenticated principal
     * @return the persisted {@link AiChatHistoryDTO}
     */
    @PostMapping("/chat/history")
    @PreAuthorize(AI_AUTH)
    public AiChatHistoryDTO saveHistory(@Valid @RequestBody AiChatRequestDTO req, Principal p) {
        return service.saveHistory(req, currentUser(p));
    }

    // =========================================================================
    // GET /chat/history — retrieve conversation history
    // =========================================================================

    /**
     * Retrieves the caller's conversation history for the given context.
     *
     * @param contextType  required context surface: {@code alert}, {@code incident}, or {@code general}
     * @param contextId    optional identifier of the specific alert or incident
     * @param p            the authenticated principal
     * @return list of matching {@link AiChatHistoryDTO} ordered newest-first
     */
    @GetMapping("/chat/history")
    @PreAuthorize(AI_AUTH)
    public List<AiChatHistoryDTO> listHistory(
            @RequestParam String contextType,
            @RequestParam(required = false) String contextId,
            Principal p) {
        return service.getHistory(contextType, contextId, currentUser(p));
    }

    // =========================================================================
    // POST /triage — generate or retrieve cached alert triage
    // =========================================================================

    /**
     * Returns an AI-generated triage summary for the specified alert.
     *
     * <p>Results are cached for up to 3600 seconds per {@code (userLogin, alertId)} pair
     * by {@link HaAiChatService#generateTriage}. Subsequent calls within the TTL window
     * return the cached response without invoking the LLM again.
     *
     * @param body  request body — must contain a non-blank {@code alertId} key
     * @param p     the authenticated principal
     * @return a single-entry map {@code {"summary":"<text>"}}
     * @throws ResponseStatusException {@code 400} when {@code alertId} is missing or blank
     */
    @PostMapping("/triage")
    @PreAuthorize(AI_AUTH)
    public Map<String, String> triage(@RequestBody Map<String, String> body, Principal p) {
        String alertId = body.get("alertId");
        if (alertId == null || alertId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "alertId is required");
        }
        return Map.of("summary", service.generateTriage(alertId, currentUser(p)));
    }

    // =========================================================================
    // POST /incident-summary — generate or retrieve cached incident summary
    // =========================================================================

    /**
     * Returns an AI-generated structured summary for the specified incident.
     *
     * <p>Results are cached for up to 3600 seconds per {@code (userLogin, incidentId)} pair.
     * The returned {@link AiIncidentSummaryDTO} always carries a normalised
     * {@code riskLevel} value from {@code {low, medium, high, critical}}.
     *
     * @param body       request body — must contain a non-blank {@code incidentId} key
     * @param p          the authenticated principal
     * @return the structured incident summary DTO
     * @throws ResponseStatusException {@code 400} when {@code incidentId} is missing or blank
     */
    @PostMapping("/incident-summary")
    @PreAuthorize(AI_AUTH)
    public AiIncidentSummaryDTO incidentSummary(
            @RequestBody Map<String, String> body, Principal p) {
        String incidentId = body.get("incidentId");
        if (incidentId == null || incidentId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "incidentId is required");
        }
        return service.generateIncidentSummary(incidentId, currentUser(p));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private String currentUser(Principal principal) {
        if (principal != null && principal.getName() != null && !principal.getName().isBlank()) {
            return principal.getName();
        }
        return SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required"));
    }

    /**
     * Serialises {@code payload} to a compact JSON string for use as an SSE frame body.
     *
     * <p>Spring's reactive SSE pipeline automatically wraps each emitted {@code String}
     * in {@code data:…\n\n} — this method only needs to produce the JSON content.
     *
     * @param payload the frame data as a plain {@code Map}
     * @return compact JSON string
     * @throws IllegalStateException if JSON serialisation fails (should never happen
     *                               for simple {@code Map<String, Object>} payloads)
     */
    private String sseFrame(Map<String, Object> payload) {
        try {
            return mapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("SSE frame serialization failed", e);
        }
    }
}
