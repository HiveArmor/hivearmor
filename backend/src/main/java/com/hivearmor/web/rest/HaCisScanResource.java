package com.hivearmor.web.rest;

import com.hivearmor.service.dto.cis.CisScanResultDTO;
import com.hivearmor.service.dto.cis.CisScanSummaryDTO;
import com.hivearmor.service.telemetry.HaCisScanService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Per-host CIS benchmark scan read surface (PT-5, Option A). Serves results from the
 * net-new OpenSearch index {@code v3-hive-cis-*} — DISTINCT from {@code /api/ha-cis}
 * (the legacy Postgres observed-SSH SCA pack surface), kept separate per SPEC-PT-5 §4.
 *
 * <p>PT-5 scope is the per-host posture view only. Cross-fleet trend/reporting is PT-6
 * and is deliberately NOT exposed here.
 *
 * <p>Constructor injection only; no Lombok; no {@code List#getFirst()}.
 */
@RestController
@RequestMapping("/api/ha-cis-scan")
public class HaCisScanResource {

    private static final Logger log = LoggerFactory.getLogger(HaCisScanResource.class);
    private static final String CLASSNAME = "HaCisScanResource";
    private static final String AUTH = "hasAnyAuthority('ROLE_ANALYST', 'ROLE_ADMIN', 'ROLE_SOC_MANAGER')";

    private final HaCisScanService cisScanService;

    public HaCisScanResource(HaCisScanService cisScanService) {
        this.cisScanService = cisScanService;
    }

    /**
     * Control results of the latest CIS scan for a host. Empty list when the host has
     * not been scanned yet (honest — the UI shows a not-scanned state, never a fake 100%).
     */
    @GetMapping("/results/agent/{agentId}")
    @PreAuthorize(AUTH)
    public ResponseEntity<List<CisScanResultDTO>> getResultsByAgent(
            @PathVariable String agentId,
            @RequestParam(value = "status", required = false) String status) {
        log.debug("{}.getResultsByAgent: agentId={} status={}", CLASSNAME, agentId, status);
        return ResponseEntity.ok(cisScanService.findResultsByAgent(agentId, status));
    }

    /**
     * Latest CIS scan summary (pass/fail tally + score) for a host. Returns a summary
     * with {@code scanned=false} when no scan has been ingested.
     */
    @GetMapping("/results/agent/{agentId}/summary")
    @PreAuthorize(AUTH)
    public ResponseEntity<CisScanSummaryDTO> getSummaryByAgent(@PathVariable String agentId) {
        log.debug("{}.getSummaryByAgent: agentId={}", CLASSNAME, agentId);
        return ResponseEntity.ok(cisScanService.summaryByAgent(agentId));
    }
}
