package com.hivearmor.web.rest;

import com.hivearmor.service.ResponseGovernanceProjectionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * RESP-020 STAGING CANDIDATE — Response Governance compatibility projection.
 *
 * <p>Exposes {@code GET /api/ha-response-governance/approvals} as a thin projection
 * over playbook executions awaiting approval. Decision POST bridges to existing
 * {@code POST /api/ha-playbooks/executions/{id}/approve|reject} (ADMIN-only).
 *
 * <p>Policies and delegations are not implemented. Not PRODUCTION READY.
 */
@RestController
@RequestMapping("/api")
public class HaResponseGovernanceResource {

    private static final Logger log = LoggerFactory.getLogger(HaResponseGovernanceResource.class);
    private static final String CLASSNAME = "HaResponseGovernanceResource";

    private final ResponseGovernanceProjectionService projectionService;

    public HaResponseGovernanceResource(ResponseGovernanceProjectionService projectionService) {
        this.projectionService = projectionService;
    }

    /**
     * GET /api/ha-response-governance/approvals
     *
     * <p>Projects playbook executions into the Response Governance approval queue shape.
     * Policies/delegates are always empty with honest {@code partialFailures}.
     */
    @GetMapping("/ha-response-governance/approvals")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')")
    public ResponseEntity<Map<String, Object>> listApprovals(
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String risk,
            @RequestParam(required = false) String tenantScope,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Integer limit) {
        final String ctx = CLASSNAME + ".listApprovals";
        try {
            return ResponseEntity.ok(projectionService.listApprovals(
                state, risk, tenantScope, search, limit));
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * POST /api/ha-response-governance/approvals/{approvalId}/decision
     *
     * <p>Bridges to playbook approve/reject. Preserves ADMIN-only auth of the
     * underlying execution gate. STAGING CANDIDATE.
     */
    @PostMapping("/ha-response-governance/approvals/{approvalId}/decision")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Map<String, Object>> decide(
            @PathVariable String approvalId,
            @RequestBody(required = false) Map<String, Object> body) {
        final String ctx = CLASSNAME + ".decide";
        try {
            return ResponseEntity.ok(projectionService.decide(approvalId, body));
        } catch (ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode())
                .body(Map.of("error", e.getReason() != null ? e.getReason() : "error"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", e.getMessage() != null ? e.getMessage() : "not found"));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", e.getMessage() != null ? e.getMessage() : "conflict"));
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
