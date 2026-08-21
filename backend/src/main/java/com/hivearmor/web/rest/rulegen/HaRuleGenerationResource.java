package com.hivearmor.web.rest.rulegen;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.rulegen.HaRuleGenerationService;
import com.hivearmor.service.rulegen.dto.GenerateRequestDTO;
import com.hivearmor.service.rulegen.dto.RuleGenSessionDTO;
import com.hivearmor.service.rulegen.dto.SignalSummaryDTO;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for the rule generation workflow.
 *
 * <p>Exposes five endpoints under {@code /api/ha-rules} — all guarded by the
 * {@code ADMIN} authority. Delegates to {@link HaRuleGenerationService} for
 * business logic.
 */
@RestController
@RequestMapping("/api/ha-rules")
public class HaRuleGenerationResource {

    private static final Logger log = LoggerFactory.getLogger(HaRuleGenerationResource.class);

    private final HaRuleGenerationService service;

    public HaRuleGenerationResource(HaRuleGenerationService service) {
        this.service = service;
    }

    /**
     * GET /api/ha-rules/signals?minCount=3 — signal summary for the rule generation page.
     *
     * @param minCount minimum number of signals per group to include (default 3)
     * @return aggregated signal summary with per-group details
     */
    @GetMapping("/signals")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public SignalSummaryDTO listSignalSummary(@RequestParam(defaultValue = "3") long minCount) {
        log.debug("REST request to get signal summary with minCount={}", minCount);
        return service.getSignalSummary(minCount);
    }

    /**
     * GET /api/ha-rules/sessions/pending — list all pending-review sessions.
     *
     * @return list of sessions with status {@code pending_review}, ordered newest first
     */
    @GetMapping("/sessions/pending")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public List<RuleGenSessionDTO> listPendingSessions() {
        log.debug("REST request to list pending rule generation sessions");
        return service.getPendingSessions();
    }

    /**
     * POST /api/ha-rules/sessions — generate a new rule suggestion.
     *
     * <p>Calls the LLM to produce a validated YAML rule from recorded signals,
     * persists a session in {@code pending_review} status, and returns it.
     *
     * @param body the generation request with signal key and optional min count
     * @return 201 Created with the new session DTO
     */
    @PostMapping("/sessions")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<RuleGenSessionDTO> generate(@Valid @RequestBody GenerateRequestDTO body) {
        log.debug("REST request to generate rule suggestion for signalKey={}", body.signalKey());
        RuleGenSessionDTO dto = service.generateRuleSuggestion(body.toRequest());
        return ResponseEntity.status(HttpStatus.CREATED).body(dto);
    }

    /**
     * POST /api/ha-rules/sessions/{id}/approve — approve a pending session.
     *
     * <p>Writes the session's YAML to the configured output directory and transitions
     * the session status to {@code approved}.
     *
     * @param id the session ID to approve
     * @return the updated session DTO
     */
    @PostMapping("/sessions/{id}/approve")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public RuleGenSessionDTO approve(@PathVariable Long id) {
        log.debug("REST request to approve rule generation session id={}", id);
        return service.approveSession(id);
    }

    /**
     * POST /api/ha-rules/sessions/{id}/reject — reject a pending session.
     *
     * <p>Transitions the session status to {@code rejected} without writing any file.
     *
     * @param id the session ID to reject
     * @return the updated session DTO
     */
    @PostMapping("/sessions/{id}/reject")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public RuleGenSessionDTO reject(@PathVariable Long id) {
        log.debug("REST request to reject rule generation session id={}", id);
        return service.rejectSession(id);
    }

    /**
     * POST /api/ha-rules/sessions/{id}/regenerate — reject and regenerate.
     *
     * <p>Marks the current session as rejected and generates a fresh rule suggestion,
     * returning the new session.
     *
     * @param id   the session ID to reject
     * @param body the generation request for the new session
     * @return the newly generated session DTO
     */
    @PostMapping("/sessions/{id}/regenerate")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public RuleGenSessionDTO regenerate(@PathVariable Long id,
                                        @Valid @RequestBody GenerateRequestDTO body) {
        log.debug("REST request to regenerate rule for session id={}, signalKey={}",
            id, body.signalKey());
        return service.regenerateSession(id, body.toRequest());
    }
}
