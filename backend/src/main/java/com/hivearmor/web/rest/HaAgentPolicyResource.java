package com.hivearmor.web.rest;

import com.hivearmor.service.HaAgentPolicyService;
import com.hivearmor.service.dto.AgentPolicyAssignRequest;
import com.hivearmor.service.dto.AgentPolicyDTO;
import com.hivearmor.service.dto.AgentPolicyEnforcementEvidenceDTO;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

/**
 * REST controller for HiveArmor EDR agent monitoring policy management (T05).
 *
 * <p>All endpoints are mounted under {@code /api/ha-edr}.
 * Reads: Admin | SOC Manager | Analyst. Mutations: Admin | SOC Manager.
 *
 * <p>STAGING CANDIDATE — enforcement evidence never claims production host enforcement.
 */
@RestController
@RequestMapping("/api/ha-edr")
public class HaAgentPolicyResource {

    private static final Logger log = LoggerFactory.getLogger(HaAgentPolicyResource.class);
    private static final String CLASSNAME = "HaAgentPolicyResource";

    private static final String READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')";
    private static final String MUTATE_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER')";

    private final HaAgentPolicyService policyService;

    public HaAgentPolicyResource(HaAgentPolicyService policyService) {
        this.policyService = policyService;
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-edr/policies
    // -------------------------------------------------------------------------

    @GetMapping("/policies")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<List<AgentPolicyDTO>> listPolicies() {
        final String ctx = CLASSNAME + ".listPolicies";
        log.debug("{}: listing all agent policies", ctx);

        List<AgentPolicyDTO> policies = policyService.listPolicies();
        return ResponseEntity.ok(policies);
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-edr/policies/{id}/enforcement
    // -------------------------------------------------------------------------

    /**
     * Returns assignment plus agent-reported {@code AgentPolicyStateDTO} rows when present.
     * Availability is {@code unavailable} or {@code partial} only (POL-001).
     */
    @GetMapping("/policies/{id}/enforcement")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<AgentPolicyEnforcementEvidenceDTO> getEnforcementEvidence(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getEnforcementEvidence";
        log.debug("{}: enforcement evidence for policy id={}", ctx, id);
        try {
            return ResponseEntity.ok(policyService.getEnforcementEvidence(id));
        } catch (EntityNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-edr/policies
    // -------------------------------------------------------------------------

    @PostMapping("/policies")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<AgentPolicyDTO> createPolicy(@Valid @RequestBody AgentPolicyDTO dto) {
        final String ctx = CLASSNAME + ".createPolicy";
        log.debug("{}: creating agent policy name={}", ctx, dto.getName());

        AgentPolicyDTO created = policyService.createPolicy(dto);
        return ResponseEntity
                .created(URI.create("/api/ha-edr/policies/" + created.getId()))
                .body(created);
    }

    // -------------------------------------------------------------------------
    // PUT /api/ha-edr/policies/{id}
    // -------------------------------------------------------------------------

    @PutMapping("/policies/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<AgentPolicyDTO> updatePolicy(
            @PathVariable Long id,
            @Valid @RequestBody AgentPolicyDTO dto) {

        final String ctx = CLASSNAME + ".updatePolicy";
        log.debug("{}: updating agent policy id={}", ctx, id);

        AgentPolicyDTO updated = policyService.updatePolicy(id, dto);
        return ResponseEntity.ok(updated);
    }

    // -------------------------------------------------------------------------
    // DELETE /api/ha-edr/policies/{id}
    // -------------------------------------------------------------------------

    @DeleteMapping("/policies/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> deletePolicy(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".deletePolicy";
        log.debug("{}: deleting agent policy id={}", ctx, id);

        policyService.deletePolicy(id);
        return ResponseEntity.noContent().build();
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-edr/policies/{id}/assign
    // -------------------------------------------------------------------------

    @PostMapping("/policies/{id}/assign")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<AgentPolicyDTO> assignAgents(
            @PathVariable Long id,
            @Valid @RequestBody AgentPolicyAssignRequest request) {

        final String ctx = CLASSNAME + ".assignAgents";
        log.debug("{}: assigning agents to policy id={}", ctx, id);

        AgentPolicyDTO updated = policyService.assignAgents(id, request);
        return ResponseEntity.ok(updated);
    }
}
