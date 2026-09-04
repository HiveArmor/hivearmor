package com.hivearmor.web.rest.hunt.ai;

import jakarta.validation.Valid;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.hivearmor.service.hunt.ai.HaHuntAiExplainService;
import com.hivearmor.service.hunt.ai.HaAiCalibrationService;
import com.hivearmor.service.hunt.ai.HaHuntProvenanceService;
import com.hivearmor.service.hunt.ai.HaHuntVerdictService;
import com.hivearmor.service.hunt.HaHuntService;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.web.rest.hunt.ai.dto.AiFeedbackRequestDTO;
import com.hivearmor.web.rest.hunt.ai.dto.ExplainClauseRequestDTO;
import com.hivearmor.web.rest.hunt.ai.dto.ExplainClauseResponseDTO;
import com.hivearmor.web.rest.hunt.ai.dto.HuntEventSample;
import com.hivearmor.web.rest.hunt.ai.dto.HuntFieldProvenanceDTO;
import com.hivearmor.web.rest.hunt.ai.dto.VerdictRequestDTO;
import com.hivearmor.web.rest.hunt.ai.dto.VerdictResponseDTO;

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
    private final HaHuntVerdictService verdictService;
    private final HaHuntService huntService;
    private final HaHuntProvenanceService provenanceService;

    public HaHuntAiResource(HaHuntAiExplainService explainService,
                            HaAiCalibrationService calibrationService,
                            HaHuntVerdictService verdictService,
                            HaHuntService huntService,
                            HaHuntProvenanceService provenanceService) {
        this.explainService = explainService;
        this.calibrationService = calibrationService;
        this.verdictService = verdictService;
        this.huntService = huntService;
        this.provenanceService = provenanceService;
    }

    /** Max events sampled from a completed search for verdict analysis. */
    private static final int VERDICT_SAMPLE_LIMIT = 120;

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

    /**
     * Produce an AI verdict over a completed search's result set (contract §3, the keystone).
     * Always HTTP 200: an expired/unknown session or too-few events yields a non-ready
     * state ("insufficient_data"), and an unconfigured/failing LLM yields "unavailable" —
     * never a fabricated verdict, never a 5xx.
     */
    @PostMapping("/verdict")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<VerdictResponseDTO> verdict(@Valid @RequestBody VerdictRequestDTO body) {
        final String owner = SecurityUtils.getCurrentUserLogin().orElse(null);
        final String tenantKey = tenantKey();
        List<HuntEventSample> sample;
        try {
            sample = huntService.sampleEvents(body.searchId(), owner, tenantKey, VERDICT_SAMPLE_LIMIT);
        } catch (RuntimeException e) {
            // Session expired / unknown / not owned by caller — honest non-ready, not an error.
            log.debug("HaHuntAiResource: verdict sample unavailable for {} — insufficient_data", body.searchId());
            return ResponseEntity.ok(VerdictResponseDTO.nonReady("insufficient_data"));
        } catch (Exception e) {
            log.warn("HaHuntAiResource: verdict sample fetch failed", e);
            return ResponseEntity.ok(VerdictResponseDTO.nonReady("unavailable"));
        }
        return ResponseEntity.ok(verdictService.verdict(body.searchId(), sample));
    }

    /**
     * Per-field provenance for the "show AI's hand" lens (contract §4). Deterministic, no LLM —
     * classifies each projected field as raw / enrichment / model. The {@code searchId} param is
     * accepted for contract symmetry; the map is schema-wide (same for any search).
     */
    @GetMapping("/provenance")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<List<HuntFieldProvenanceDTO>> provenance(@RequestParam(required = false) String searchId) {
        return ResponseEntity.ok(provenanceService.fieldProvenance());
    }

    private static String tenantKey() {
        String prefix = TenantContext.getClientPrefix();
        return (prefix == null || prefix.isBlank()) ? "authorized" : prefix;
    }
}
