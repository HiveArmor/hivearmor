package com.hivearmor.web.rest.soc_ai;

import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.dto.intelligence.IntelligenceFindingDTO;
import com.hivearmor.service.intelligence.IntelligenceFindingService;
import com.hivearmor.service.soc_ai.SocAiChatService;
import com.hivearmor.service.dto.soc_ai.ChatRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Non-streaming SOC AI query endpoints.
 *
 * POST /api/ha-soc-ai/query      — single-turn query → SocAiResponseDTO + IntelligenceFindingDTO
 * POST /api/ha-soc-ai/enrich-alert — alert enrichment → AlertEnrichmentDTO + IntelligenceFindingDTO
 *
 * Falls back gracefully when SOC_AI_BASE_URL is not configured.
 * Auth: ADMIN | SOC_MANAGER | ANALYST — READ_ONLY is blocked (AI usage is auditable).
 */
@RestController
@RequestMapping("/api/ha-soc-ai")
@RequiredArgsConstructor
public class SocAiQueryResource {

    private static final String CLASSNAME = "SocAiQueryResource";
    private static final String AUTH = "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')";

    private final Logger log = LoggerFactory.getLogger(SocAiQueryResource.class);

    private final SocAiChatService socAiChatService;
    private final IntelligenceFindingService intelligenceFindingService;

    public record SocAiQueryRequest(
        @NotBlank String prompt,
        String context,
        Boolean persist
    ) {}

    public record SocAiResponseDTO(
        String answer,
        double confidence,
        List<String> sources,
        long durationMs,
        IntelligenceFindingDTO finding
    ) {}

    public record AlertEnrichRequest(@NotBlank String alertId) {}

    public record AlertEnrichmentDTO(
        String summary,
        List<String> tactics,
        List<String> recommendedActions,
        IntelligenceFindingDTO finding
    ) {}

    /**
     * POST /api/ha-soc-ai/query
     * Single-turn NL query. Returns a synchronous response (non-streaming).
     * When AI is not configured → returns graceful fallback response.
     */
    @PostMapping("/query")
    @PreAuthorize(AUTH)
    public ResponseEntity<SocAiResponseDTO> query(@RequestBody @Valid SocAiQueryRequest req) {
        log.debug("{}.query prompt_length={}", CLASSNAME, req.prompt().length());
        long start = System.currentTimeMillis();

        if (!isAiConfigured()) {
            String answer =
                "AI service not configured. Set SOC_AI_BASE_URL to enable Hive Intelligence.";
            IntelligenceFindingDTO finding = intelligenceFindingService.buildFromSocAiAnswer(
                answer, 0.0, List.of(), "soc-ai-query", req.prompt(), false);
            finding = maybePersist(finding, req.persist());
            return ResponseEntity.ok(new SocAiResponseDTO(answer, 0.0, List.of(), 0, finding));
        }

        try {
            ChatRequest chatReq = buildChatRequest(req.prompt(), req.context());
            String answer = socAiChatService.querySynchronous(chatReq);
            long durationMs = System.currentTimeMillis() - start;
            IntelligenceFindingDTO finding = intelligenceFindingService.buildFromSocAiAnswer(
                answer, 1.0, List.of(), "soc-ai-query", req.prompt(), true);
            finding = maybePersist(finding, req.persist());
            return ResponseEntity.ok(new SocAiResponseDTO(answer, 1.0, List.of(), durationMs, finding));
        } catch (Exception e) {
            log.warn("{}.query failed: {}", CLASSNAME, e.getMessage());
            String answer = "AI service unavailable: " + e.getMessage();
            IntelligenceFindingDTO finding = intelligenceFindingService.buildFromSocAiAnswer(
                answer, 0.0, List.of(), "soc-ai-query", req.prompt(), false);
            return ResponseEntity.ok(new SocAiResponseDTO(answer, 0.0, List.of(), 0, finding));
        }
    }

    /**
     * POST /api/ha-soc-ai/enrich-alert
     * Returns structured enrichment for a specific alert ID.
     */
    @PostMapping("/enrich-alert")
    @PreAuthorize(AUTH)
    public ResponseEntity<AlertEnrichmentDTO> enrichAlert(@RequestBody @Valid AlertEnrichRequest req) {
        log.debug("{}.enrichAlert alertId={}", CLASSNAME, req.alertId());

        if (!isAiConfigured()) {
            String summary = "AI enrichment unavailable — set SOC_AI_BASE_URL to enable.";
            IntelligenceFindingDTO finding = intelligenceFindingService.buildFromSocAiAnswer(
                summary, 0.0, List.of(), "alert-enrichment", req.alertId(), false);
            return ResponseEntity.ok(new AlertEnrichmentDTO(summary, List.of(), List.of(), finding));
        }

        try {
            String prompt = "Analyse security alert ID " + req.alertId()
                + ". Return: 1) a 2-sentence summary, 2) MITRE ATT&CK tactics (comma-separated), "
                + "3) recommended SOC actions (bullet points).";
            ChatRequest chatReq = buildChatRequest(prompt, null);
            String raw = socAiChatService.querySynchronous(chatReq);
            IntelligenceFindingDTO finding = intelligenceFindingService.buildFromSocAiAnswer(
                raw, 1.0, List.of(), "alert-enrichment", req.alertId(), true);
            return ResponseEntity.ok(new AlertEnrichmentDTO(raw, List.of(), List.of(), finding));
        } catch (Exception e) {
            log.warn("{}.enrichAlert failed: {}", CLASSNAME, e.getMessage());
            String summary = "Enrichment failed: " + e.getMessage();
            IntelligenceFindingDTO finding = intelligenceFindingService.buildFromSocAiAnswer(
                summary, 0.0, List.of(), "alert-enrichment", req.alertId(), false);
            return ResponseEntity.ok(new AlertEnrichmentDTO(summary, List.of(), List.of(), finding));
        }
    }

    private IntelligenceFindingDTO maybePersist(IntelligenceFindingDTO finding, Boolean persist) {
        if (!Boolean.TRUE.equals(persist)) {
            return finding;
        }
        String user = SecurityUtils.getCurrentUserLogin().orElse("system");
        return intelligenceFindingService.persistSocAiFinding(finding, user);
    }

    private boolean isAiConfigured() {
        String url = System.getenv("SOC_AI_BASE_URL");
        return StringUtils.hasText(url);
    }

    private ChatRequest buildChatRequest(String prompt, String context) {
        var msg = new ChatRequest.ChatMessageDTO();
        msg.setRole("user");
        msg.setContent(context != null && !context.isBlank() ? context + "\n\n" + prompt : prompt);

        ChatRequest req = new ChatRequest();
        req.setMessages(List.of(msg));
        return req;
    }
}
