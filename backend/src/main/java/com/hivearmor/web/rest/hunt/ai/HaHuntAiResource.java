package com.hivearmor.web.rest.hunt.ai;

import jakarta.validation.Valid;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.hivearmor.service.hunt.ai.HaHuntAiExplainService;
import com.hivearmor.service.hunt.ai.HaAiCalibrationService;
import com.hivearmor.web.rest.hunt.ai.dto.AiFeedbackRequestDTO;
import com.hivearmor.web.rest.hunt.ai.dto.ExplainClauseRequestDTO;
import com.hivearmor.web.rest.hunt.ai.dto.ExplainClauseResponseDTO;

/**
 * Hunt AI endpoints ({@code /api/ha-hunts/ai/*}) — the backend side of the frozen Hunt AI
 * contract (.plan/HUNT-AI-CONTRACT-v1.md). The frontend calls these through {@code huntAiService};
 * flipping {@code HUNT_AI_MODE} mock→live requires these to return the contract shapes.
 *
 * <p>First increment: {@code explain} (the plain-language clause gloss). Verdict / provenance /
 * feedback endpoints land in later increments (see HUNT-AI-BACKEND-SCOPE-2026-09-04.md).
 */
@RestController
@RequestMapping("/api/ha-hunts/ai")
public class HaHuntAiResource {

    private static final Logger log = LoggerFactory.getLogger(HaHuntAiResource.class);

    /** Same tier as the hunt/alert-queue surface. */
    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') "
        + "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private final HaHuntAiExplainService explainService;
    private final HaAiCalibrationService calibrationService;

    public HaHuntAiResource(HaHuntAiExplainService explainService,
                            HaAiCalibrationService calibrationService) {
        this.explainService = explainService;
        this.calibrationService = calibrationService;
    }

    /**
     * Explain a query clause in plain language (move 5). Always HTTP 200 — an unconfigured
     * or failing LLM yields {@code state = "unavailable"} rather than a 5xx.
     */
    @PostMapping("/explain")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<ExplainClauseResponseDTO> explain(@Valid @RequestBody ExplainClauseRequestDTO body) {
        log.debug("HaHuntAiResource: explain clause ({} chars)", body.clause().length());
        return ResponseEntity.ok(explainService.explain(body.clause(), body.languageOrDefault()));
    }

    /**
     * Record analyst feedback (👍/👎 + optional correction) on an AI verdict/lead — the closed
     * loop that feeds trust calibration (contract §6). Returns {@code {"recorded": true}}.
     */
    @PostMapping("/feedback")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Map<String, Boolean>> feedback(@Valid @RequestBody AiFeedbackRequestDTO body) {
        calibrationService.record(body);
        return ResponseEntity.ok(Map.of("recorded", true));
    }
}
