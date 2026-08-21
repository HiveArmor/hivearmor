package com.hivearmor.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.ChatMessage;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.HaAiChatHistory;
import com.hivearmor.repository.HaAiChatHistoryRepository;
import com.hivearmor.web.rest.dto.AiChatHistoryDTO;
import com.hivearmor.web.rest.dto.AiChatRequestDTO;
import com.hivearmor.web.rest.dto.AiIncidentSummaryDTO;
import com.hivearmor.web.rest.dto.ChatMessageDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Orchestration core for the Sprint 25 AI Chat Assistant.
 *
 * <p>Responsibilities:
 * <ul>
 *   <li>Compose system prompts from the base prompt + whitelisted context JSON.</li>
 *   <li>Delegate streaming and synchronous chat to {@link HaLlmService}.</li>
 *   <li>Persist and retrieve per-user, per-context chat history rows.</li>
 *   <li>Generate and cache alert triage summaries (TTL = 3600 s, contextType = "triage").</li>
 *   <li>Generate and cache incident summaries (TTL = 3600 s, contextType = "incident_summary").</li>
 *   <li>Harden LLM output via {@link #parseSummaryOrFallback} and {@link #normalizeRiskLevel}.</li>
 * </ul>
 *
 * <h3>NoGetFirstInvariant</h3>
 * <p>All list indexing uses {@code .get(0)} — the Java 21+ {@code .getFirst()} API
 * is banned because HiveArmor targets Java 17.
 *
 * <h3>Per-user isolation</h3>
 * <p>Every repository query is scoped by {@code userLogin} derived from the Spring
 * Security {@code Principal}. No row belonging to one user is ever returned to another.
 *
 * @see HaLlmService
 * @see HaAiChatHistoryRepository
 * @see HaAlertContextService
 * @see HaIncidentContextService
 */
@Service
public class HaAiChatService {

    private static final Logger log = LoggerFactory.getLogger(HaAiChatService.class);

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /** Cache TTL for triage and incident-summary results (seconds). */
    static final long CACHE_TTL_SECONDS = 3600;

    /** Context type stored in ha_ai_chat_history for cached triage results. */
    static final String TRIAGE_CTX = "triage";

    /** Context type stored in ha_ai_chat_history for cached incident summaries. */
    static final String SUMMARY_CTX = "incident_summary";

    /** Allowed risk-level values — anything else is rewritten to {@link #RISK_DEFAULT}. */
    private static final Set<String> RISK_LEVELS = Set.of("low", "medium", "high", "critical");

    /** Default risk level used when the LLM emits an unrecognised value. */
    private static final String RISK_DEFAULT = "medium";

    /**
     * Base system prompt prepended to every chat request.
     * Context JSON (alert or incident) is appended after this string.
     */
    private static final String BASE_SYSTEM_PROMPT =
        "You are a cybersecurity analyst assistant for the HiveArmor SIEM/XDR platform. " +
        "Answer questions concisely and accurately based on the provided context. " +
        "Focus on security-relevant information and actionable insights. " +
        "Do not include personally identifiable information in your responses.";

    /**
     * System prompt used when generating triage summaries.
     * Instructs the LLM to produce a structured, concise triage analysis.
     */
    private static final String TRIAGE_SYSTEM_PROMPT =
        "You are a SOC analyst. Given the following alert context, provide a concise triage summary " +
        "that covers: (1) what the alert indicates, (2) likely severity reasoning, " +
        "(3) suggested immediate investigation steps. Keep the response under 300 words.";

    /**
     * System prompt used when generating incident summaries.
     * Instructs the LLM to produce a JSON-structured {@code AiIncidentSummaryDTO}.
     */
    private static final String SUMMARY_SYSTEM_PROMPT =
        "You are a senior security analyst. Given the incident context, respond with a valid JSON object " +
        "matching this exact schema: " +
        "{\"narrative\": \"<string>\", \"threatActorType\": \"<string>\", " +
        "\"recommendedSteps\": [\"<string>\", ...], \"riskLevel\": \"<low|medium|high|critical>\"}. " +
        "Respond ONLY with the JSON object — no markdown, no code fences, no extra text.";

    // -------------------------------------------------------------------------
    // Dependencies
    // -------------------------------------------------------------------------

    private final HaLlmService llmService;
    private final HaAiChatHistoryRepository historyRepository;
    private final HaAlertContextService alertContextService;
    private final HaIncidentContextService incidentContextService;
    private final ObjectMapper objectMapper;

    public HaAiChatService(
            HaLlmService llmService,
            HaAiChatHistoryRepository historyRepository,
            HaAlertContextService alertContextService,
            HaIncidentContextService incidentContextService,
            ObjectMapper objectMapper) {
        this.llmService             = llmService;
        this.historyRepository      = historyRepository;
        this.alertContextService    = alertContextService;
        this.incidentContextService = incidentContextService;
        this.objectMapper           = objectMapper;
    }

    // =========================================================================
    // Streaming chat (Req 3.4, 3.5, 3.6, 5.1, 5.2)
    // =========================================================================

    /**
     * Composes the system prompt from the base + whitelisted context JSON, then
     * delegates to {@link HaLlmService#streamChat(List, String)}.
     *
     * <p>Context loading failures are caught and logged; the base prompt is used
     * alone rather than propagating the error to the caller.
     *
     * @param request   validated chat request DTO
     * @param userLogin authenticated user login (from Spring Security Principal)
     * @return non-empty Flux of text deltas
     */
    public Flux<String> streamChat(AiChatRequestDTO request, String userLogin) {
        String systemPrompt = composeSystemPrompt(request);
        List<ChatMessage> messages = toChatMessages(request.messages());
        return llmService.streamChat(messages, systemPrompt);
    }

    // =========================================================================
    // Triage (Req 13.1, 13.2, 13.4, 13.5)
    // =========================================================================

    /**
     * Returns a triage summary for the given alert.
     *
     * <p>Cache logic: if a history row exists for
     * {@code (userLogin, "triage", alertId)} with
     * {@code createdAt ≥ now − 3600s}, the cached text is returned and the LLM is
     * not called. Otherwise the LLM is called, the result is persisted, and
     * returned.
     *
     * @param alertId   the alert to triage
     * @param userLogin authenticated user login
     * @return triage summary text
     * @throws ResponseStatusException HTTP 404 when the alert is not found
     */
    public String generateTriage(String alertId, String userLogin) {
        // 1. Check cache.
        Optional<String> cached = cachedTextSummary(userLogin, TRIAGE_CTX, alertId);
        if (cached.isPresent()) {
            log.debug("generateTriage: cache hit for userLogin={} alertId={}", userLogin, alertId);
            return cached.get();
        }

        // 2. Load alert context.
        String alertJson = alertContextService.loadAlertAsJson(alertId);
        if (alertJson == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Alert not found: " + alertId);
        }

        // 3. Call LLM.
        List<ChatMessage> messages = triageMessages(alertJson);
        String summary = llmService.chat(messages, TRIAGE_SYSTEM_PROMPT);

        // 4. Persist to cache.
        persistCached(userLogin, TRIAGE_CTX, alertId, summaryAsChatMessageDTOs(summary));

        return summary;
    }

    // =========================================================================
    // Incident summary (Req 17.1, 17.2, 17.4, 17.5, 17.7, 17.8)
    // =========================================================================

    /**
     * Returns an AI-generated incident summary for the given incident.
     *
     * <p>Cache logic mirrors {@link #generateTriage}: checks the
     * {@code "incident_summary"} context type with the same 3600-second TTL.
     *
     * <p>The raw LLM output is parsed via {@link #parseSummaryOrFallback}; the
     * resulting {@code riskLevel} is normalised via {@link #normalizeRiskLevel}.
     *
     * @param incidentId the incident to summarise
     * @param userLogin  authenticated user login
     * @return normalised incident summary DTO
     * @throws ResponseStatusException HTTP 404 when the incident is not found
     */
    public AiIncidentSummaryDTO generateIncidentSummary(String incidentId, String userLogin) {
        // 1. Check cache.
        Optional<AiIncidentSummaryDTO> cached = cachedIncidentSummary(userLogin, SUMMARY_CTX, incidentId);
        if (cached.isPresent()) {
            log.debug("generateIncidentSummary: cache hit for userLogin={} incidentId={}", userLogin, incidentId);
            return cached.get();
        }

        // 2. Load incident context.
        String incidentJson = incidentContextService.loadIncidentAsJson(incidentId);
        if (incidentJson == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Incident not found: " + incidentId);
        }

        // 3. Call LLM.
        List<ChatMessage> messages = summaryMessages(incidentJson);
        String raw = llmService.chat(messages, SUMMARY_SYSTEM_PROMPT);

        // 4. Parse and normalise.
        AiIncidentSummaryDTO dto        = parseSummaryOrFallback(raw);
        AiIncidentSummaryDTO normalized = normalizeRiskLevel(dto);

        // 5. Persist to cache.
        try {
            String dtoJson = objectMapper.writeValueAsString(normalized);
            persistCached(userLogin, SUMMARY_CTX, incidentId, summaryAsChatMessageDTOs(dtoJson));
        } catch (Exception e) {
            log.warn("generateIncidentSummary: failed to persist cache for incidentId={}", incidentId, e);
        }

        return normalized;
    }

    // =========================================================================
    // History persistence (Req 5.1, 5.2, 17.1, 17.2)
    // =========================================================================

    /**
     * Persists a new {@code ha_ai_chat_history} row for the given request and user.
     *
     * @param request   the chat request whose messages are serialised
     * @param userLogin authenticated user login (from Spring Security Principal)
     * @return DTO of the newly persisted row
     */
    public AiChatHistoryDTO saveHistory(AiChatRequestDTO request, String userLogin) {
        try {
            String messagesJson = objectMapper.writeValueAsString(request.messages());
            HaAiChatHistory entity = new HaAiChatHistory();
            entity.setUserLogin(userLogin);
            entity.setContextType(request.contextType());
            entity.setContextId(request.contextId());
            entity.setMessagesJson(messagesJson);
            HaAiChatHistory saved = historyRepository.save(entity);
            return toDto(saved);
        } catch (Exception e) {
            log.error("saveHistory: failed to persist history for userLogin={}", userLogin, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                "Failed to save chat history");
        }
    }

    /**
     * Returns all chat history rows for the given context, scoped by user login.
     *
     * <p>If {@code contextId} is null or blank, all rows for the context type are
     * returned (regardless of context ID). Otherwise only rows matching the exact
     * context ID are returned.
     *
     * @param contextType context category (e.g. "alert", "incident")
     * @param contextId   optional record identifier (may be null)
     * @param userLogin   authenticated user login — all queries scoped by this value
     * @return list of history DTOs, sorted newest first
     */
    public List<AiChatHistoryDTO> getHistory(String contextType,
                                              String contextId,
                                              String userLogin) {
        List<HaAiChatHistory> rows = (contextId == null || contextId.isBlank())
            ? historyRepository.findByUserLoginAndContextTypeOrderByCreatedAtDesc(
                userLogin, contextType)
            : historyRepository.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                userLogin, contextType, contextId);

        return rows.stream()
            .map(this::toDto)
            .collect(Collectors.toList());
    }

    // =========================================================================
    // Helpers — system prompt composition
    // =========================================================================

    /**
     * Builds the final system prompt string from the base prompt and any available
     * context JSON. Context load failures are caught and logged; the base prompt is
     * used alone rather than surfacing the error to the caller
     * (Requirements 3.4, 3.5, 3.6).
     */
    private String composeSystemPrompt(AiChatRequestDTO request) {
        StringBuilder sb = new StringBuilder(BASE_SYSTEM_PROMPT);
        try {
            String ctx = null;
            if ("alert".equals(request.contextType()) && isNonBlank(request.contextId())) {
                ctx = alertContextService.loadAlertAsJson(request.contextId());
            } else if ("incident".equals(request.contextType()) && isNonBlank(request.contextId())) {
                ctx = incidentContextService.loadIncidentAsJson(request.contextId());
            }
            if (ctx != null) {
                sb.append("\n\nContext:\n").append(ctx);
            }
        } catch (Exception e) {
            log.warn("composeSystemPrompt: context load failed contextType={} contextId={}",
                request.contextType(), request.contextId(), e);
        }
        return sb.toString();
    }

    // =========================================================================
    // Helpers — cache lookup
    // =========================================================================

    /**
     * Returns the cached text summary for the given user/context/id combination
     * if a history row exists within the TTL window.
     *
     * <p>Uses {@code rows.get(0)} — NOT {@code .getFirst()} (NoGetFirstInvariant).
     */
    private Optional<String> cachedTextSummary(String userLogin, String ctxType, String ctxId) {
        List<HaAiChatHistory> rows =
            historyRepository.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                userLogin, ctxType, ctxId);

        if (rows.isEmpty()) {
            return Optional.empty();
        }
        // NoGetFirstInvariant — use .get(0) not .getFirst()
        HaAiChatHistory top = rows.get(0);
        if (top.getCreatedAt().isBefore(Instant.now().minusSeconds(CACHE_TTL_SECONDS))) {
            return Optional.empty();
        }
        return Optional.of(extractTextFromMessagesJson(top.getMessagesJson()));
    }

    /**
     * Returns the cached {@link AiIncidentSummaryDTO} for the given user/context/id
     * combination if a history row exists within the TTL window.
     *
     * <p>Uses {@code rows.get(0)} — NOT {@code .getFirst()} (NoGetFirstInvariant).
     */
    private Optional<AiIncidentSummaryDTO> cachedIncidentSummary(String userLogin,
                                                                   String ctxType,
                                                                   String ctxId) {
        List<HaAiChatHistory> rows =
            historyRepository.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                userLogin, ctxType, ctxId);

        if (rows.isEmpty()) {
            return Optional.empty();
        }
        // NoGetFirstInvariant — use .get(0) not .getFirst()
        HaAiChatHistory top = rows.get(0);
        if (top.getCreatedAt().isBefore(Instant.now().minusSeconds(CACHE_TTL_SECONDS))) {
            return Optional.empty();
        }

        // The cached content is the JSON of an AiIncidentSummaryDTO stored as the
        // assistant message content.
        String raw = extractTextFromMessagesJson(top.getMessagesJson());
        return Optional.of(parseSummaryOrFallback(raw));
    }

    // =========================================================================
    // Helpers — LLM response parsing and normalisation
    // =========================================================================

    /**
     * Deserialises the LLM response string into an {@link AiIncidentSummaryDTO}.
     *
     * <p>On any Jackson exception (invalid JSON, missing fields, wrong types) a
     * medium-severity fallback DTO is returned instead of propagating the error.
     * This ensures the endpoint never returns HTTP 500 due to an unpredictable LLM
     * output format (Requirements 17.7, 17.8).
     *
     * @param raw the raw string emitted by the LLM
     * @return parsed DTO, or the medium-severity fallback
     */
    AiIncidentSummaryDTO parseSummaryOrFallback(String raw) {
        try {
            return objectMapper.readValue(raw, AiIncidentSummaryDTO.class);
        } catch (Exception e) {
            log.warn("parseSummaryOrFallback: failed to parse LLM output as AiIncidentSummaryDTO", e);
            return new AiIncidentSummaryDTO(
                "Unable to generate narrative — AI response was not valid JSON.",
                "Unknown",
                List.of("Review attached alerts manually", "Check MITRE ATT&CK mapping"),
                RISK_DEFAULT);
        }
    }

    /**
     * Rewrites {@link AiIncidentSummaryDTO#riskLevel()} to {@link #RISK_DEFAULT}
     * when the value is not a member of {@code {low, medium, high, critical}}.
     *
     * <p>This invariant ensures the risk badge in the UI always maps to a valid
     * CSS attribute selector (Requirements 17.7, 17.8).
     *
     * @param dto the DTO whose risk level will be checked
     * @return the same DTO if the risk level is valid; a new DTO with
     *         {@code riskLevel = "medium"} otherwise
     */
    AiIncidentSummaryDTO normalizeRiskLevel(AiIncidentSummaryDTO dto) {
        if (dto.riskLevel() != null && RISK_LEVELS.contains(dto.riskLevel())) {
            return dto;
        }
        return new AiIncidentSummaryDTO(
            dto.narrative(),
            dto.threatActorType(),
            dto.recommendedSteps(),
            RISK_DEFAULT);
    }

    // =========================================================================
    // Helpers — entity / DTO conversion
    // =========================================================================

    /**
     * Converts a {@link HaAiChatHistory} entity to an {@link AiChatHistoryDTO} by
     * deserialising the {@code messagesJson} column with {@link ObjectMapper}.
     *
     * <p>On any Jackson exception an empty message list is used rather than
     * propagating the error.
     */
    AiChatHistoryDTO toDto(HaAiChatHistory entity) {
        List<ChatMessageDTO> messages = List.of();
        try {
            messages = objectMapper.readValue(
                entity.getMessagesJson(),
                new TypeReference<List<ChatMessageDTO>>() {});
        } catch (Exception e) {
            log.warn("toDto: failed to deserialise messagesJson for id={}", entity.getId(), e);
        }
        return new AiChatHistoryDTO(
            entity.getId(),
            entity.getUserLogin(),
            entity.getContextType(),
            entity.getContextId(),
            messages,
            entity.getCreatedAt(),
            entity.getUpdatedAt());
    }

    /**
     * Converts a list of {@link ChatMessageDTO}s to a list of {@link ChatMessage}s
     * suitable for the {@link HaLlmService} API.
     */
    private List<ChatMessage> toChatMessages(List<ChatMessageDTO> dtos) {
        return dtos.stream()
            .map(d -> new ChatMessage(d.role(), d.content()))
            .collect(Collectors.toList());
    }

    // =========================================================================
    // Helpers — cache persistence
    // =========================================================================

    /**
     * Persists a new history row for a cached result (triage or incident summary).
     * The {@code messages} list is serialised to JSON and stored in
     * {@code messages_json}.
     */
    private void persistCached(String userLogin,
                                String ctxType,
                                String ctxId,
                                List<ChatMessageDTO> messages) {
        try {
            String messagesJson = objectMapper.writeValueAsString(messages);
            HaAiChatHistory entity = new HaAiChatHistory();
            entity.setUserLogin(userLogin);
            entity.setContextType(ctxType);
            entity.setContextId(ctxId);
            entity.setMessagesJson(messagesJson);
            historyRepository.save(entity);
        } catch (Exception e) {
            log.warn("persistCached: failed to persist cache row ctxType={} ctxId={}", ctxType, ctxId, e);
        }
    }

    // =========================================================================
    // Helpers — message builders
    // =========================================================================

    /**
     * Builds the conversation-style message list for a triage request.
     * A single user message carrying the alert JSON is sufficient.
     */
    private List<ChatMessage> triageMessages(String alertJson) {
        return List.of(
            new ChatMessage("user",
                "Please triage this alert and provide a summary:\n\n" + alertJson));
    }

    /**
     * Builds the conversation-style message list for an incident summary request.
     */
    private List<ChatMessage> summaryMessages(String incidentJson) {
        return List.of(
            new ChatMessage("user",
                "Generate an incident summary for the following incident context:\n\n" + incidentJson));
    }

    /**
     * Wraps a plain-text summary string as a minimal single-message list for cache storage.
     * The assistant role is used so the cached content is retrievable as the AI response.
     */
    private List<ChatMessageDTO> summaryAsChatMessageDTOs(String summary) {
        return List.of(new ChatMessageDTO("assistant", summary));
    }

    // =========================================================================
    // Helpers — text extraction
    // =========================================================================

    /**
     * Extracts the text content from a serialised messages JSON string.
     *
     * <p>The assumption is that cached rows store the assistant response as the
     * {@code content} of the last (or only) message. Falls back to returning
     * the raw JSON string if parsing fails.
     *
     * <p>Uses {@code list.get(0)} — NOT {@code .getFirst()} (NoGetFirstInvariant).
     */
    private String extractTextFromMessagesJson(String messagesJson) {
        try {
            List<ChatMessageDTO> messages = objectMapper.readValue(
                messagesJson, new TypeReference<List<ChatMessageDTO>>() {});
            if (!messages.isEmpty()) {
                // NoGetFirstInvariant — use .get(0) not .getFirst()
                return messages.get(0).content();
            }
        } catch (Exception e) {
            log.warn("extractTextFromMessagesJson: failed to parse messagesJson", e);
        }
        return messagesJson;
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    private static boolean isNonBlank(String s) {
        return s != null && !s.isBlank();
    }
}
