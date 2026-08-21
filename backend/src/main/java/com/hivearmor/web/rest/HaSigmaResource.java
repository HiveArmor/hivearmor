package com.hivearmor.web.rest;

import com.hivearmor.domain.HaSigmaRule;
import com.hivearmor.repository.HaSigmaRuleRepository;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.HaSigmaSyncService;
import com.hivearmor.service.dto.SigmaRuleDTO;
import com.hivearmor.service.dto.SigmaSyncResultDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller for HiveArmor Sigma Detection content.
 *
 * POST /api/ha-sigma/sync  — manual community rule sync (ADMIN only).
 *                            Short-circuits to HTTP 409 when air-gap mode is active
 *                            before any HttpClient is constructed (Req 2.11, 2.12).
 * GET  /api/ha-sigma/rules — paged rule listing with optional filters (Req 2.14).
 *
 * Requirements: 2.11, 2.12, 2.13, 2.14, 8.2
 */
@RestController
@RequestMapping("/api")
public class HaSigmaResource {

    private static final Logger log = LoggerFactory.getLogger(HaSigmaResource.class);

    /**
     * Fixed 409 body per Req 2.12 — must be byte-for-byte identical.
     * No trailing space, no alternative key ordering.
     */
    private static final String AIR_GAP_409_BODY =
        "{\"error\":\"Sigma sync unavailable in air-gap mode\",\"processed\":0,\"inserted\":0,\"updated\":0,\"errors\":0}";

    @Value("${app.air-gap:false}")
    private boolean airGap;

    private final HaSigmaSyncService syncService;
    private final HaSigmaRuleRepository ruleRepository;

    public HaSigmaResource(HaSigmaSyncService syncService,
                           HaSigmaRuleRepository ruleRepository) {
        this.syncService = syncService;
        this.ruleRepository = ruleRepository;
    }

    /**
     * POST /api/ha-sigma/sync
     *
     * Triggers a manual sync of the SigmaHQ community rule archive into PostgreSQL.
     *
     * Air-gap guard (Deviation 2, Req 2.12):
     *   When app.air-gap == true, this method short-circuits immediately and returns HTTP 409
     *   with a fixed JSON body.  It never reaches syncFromGithub() and never constructs an
     *   HttpClient — both paths are verified by Property 8 in HaSigmaResourceIT.
     *
     * @return 409 with fixed error body when air-gap is active; 200 with SigmaSyncResultDTO otherwise.
     */
    @PostMapping("/ha-sigma/sync")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<String> triggerSync() {
        // Air-gap guard must be the first check — no service calls before this point.
        if (airGap) {
            log.warn("POST /api/ha-sigma/sync rejected: air-gap mode is active");
            return ResponseEntity
                .status(409)
                .contentType(MediaType.APPLICATION_JSON)
                .body(AIR_GAP_409_BODY);
        }

        log.info("REST request to trigger Sigma community rule sync");
        try {
            SigmaSyncResultDTO result = syncService.syncFromGithub();
            // Serialise via Jackson — Spring Boot auto-configures ObjectMapper.
            // Return as String to share the same ResponseEntity<String> type with the 409 branch
            // while still producing valid JSON through content negotiation.
            return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(toJson(result));
        } catch (Exception e) {
            log.error("Sigma sync failed: {}", e.getMessage(), e);
            return ResponseEntity
                .status(500)
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"error\":\"Sync failed: " + e.getMessage().replace("\"", "'") + "\","
                    + "\"processed\":0,\"inserted\":0,\"updated\":0,\"errors\":1}");
        }
    }

    /**
     * GET /api/ha-sigma/rules
     *
     * Returns a paged list of Sigma rules stored in ha_sigma_rule.
     * Optional query parameters:
     *   logsourceProduct — filter by exact logsource_product value
     *   minSeverity      — filter by ha_severity >= minSeverity
     *   page             — zero-based page index (default 0)
     *   size             — page size (default 25)
     *
     * Requirements: 2.14
     */
    @GetMapping("/ha-sigma/rules")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ANALYST + "') or hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<Page<SigmaRuleDTO>> getRules(
            @RequestParam(required = false) String logsourceProduct,
            @RequestParam(required = false) Integer minSeverity,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "25") int size) {

        log.debug("REST request to list Sigma rules — product={}, minSeverity={}, page={}, size={}",
            logsourceProduct, minSeverity, page, size);

        Pageable pageable = PageRequest.of(page, size);

        Page<HaSigmaRule> entityPage;

        if (logsourceProduct != null && !logsourceProduct.isBlank() && minSeverity != null) {
            entityPage = ruleRepository.findByLogsourceProductAndHaSeverityGreaterThanEqual(
                logsourceProduct, minSeverity, pageable);
        } else if (logsourceProduct != null && !logsourceProduct.isBlank()) {
            entityPage = ruleRepository.findByLogsourceProduct(logsourceProduct, pageable);
        } else if (minSeverity != null) {
            entityPage = ruleRepository.findByHaSeverityGreaterThanEqual(minSeverity, pageable);
        } else {
            entityPage = ruleRepository.findAll(pageable);
        }

        Page<SigmaRuleDTO> dtoPage = entityPage.map(this::toDto);
        return ResponseEntity.ok(dtoPage);
    }

    // ---- private helpers ----

    /** Map HaSigmaRule entity → SigmaRuleDTO without a dedicated mapper class. */
    private SigmaRuleDTO toDto(HaSigmaRule rule) {
        return new SigmaRuleDTO(
            rule.getId(),
            rule.getSigmaId(),
            rule.getRuleTitle(),
            rule.getRuleStatus(),
            rule.getLogsourceProduct(),
            rule.getLogsourceService(),
            rule.getDetectionYaml(),
            rule.getHaSeverity(),
            rule.getMitreTags(),
            rule.getActive(),
            rule.getImportedAt(),
            rule.getUpdatedAt()
        );
    }

    /**
     * Minimal JSON serialiser for SigmaSyncResultDTO — avoids a Jackson ObjectMapper
     * dependency in the method signature while producing exactly the contract body.
     */
    private static String toJson(SigmaSyncResultDTO r) {
        return "{\"processed\":" + r.getProcessed()
            + ",\"inserted\":" + r.getInserted()
            + ",\"updated\":" + r.getUpdated()
            + ",\"errors\":" + r.getErrors()
            + "}";
    }
}
