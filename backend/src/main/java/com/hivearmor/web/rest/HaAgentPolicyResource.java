package com.hivearmor.web.rest;

import com.hivearmor.service.HaAgentPolicyService;
import com.hivearmor.service.dto.AgentPolicyAssignRequest;
import com.hivearmor.service.dto.AgentPolicyDTO;
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
 * <p>All endpoints are mounted under {@code /api/ha-edr} and are restricted to
 * {@code ROLE_ADMIN} via {@code @PreAuthorize}.
 *
 * <p>Constraints upheld:
 * <ul>
 *   <li>Constructor injection only — no {@code @Autowired} on fields or setters.
 *   <li>No Lombok annotations.
 *   <li>No {@code java.util.List#getFirst()} calls.
 *   <li>POST /policies returns HTTP 201 with a {@code Location} header.
 *   <li>DELETE /policies/{id} returns HTTP 204 with no body.
 * </ul>
 */
@RestController
@RequestMapping("/api/ha-edr")
public class HaAgentPolicyResource {

    private static final Logger log = LoggerFactory.getLogger(HaAgentPolicyResource.class);
    private static final String CLASSNAME = "HaAgentPolicyResource";

    private final HaAgentPolicyService policyService;

    public HaAgentPolicyResource(HaAgentPolicyService policyService) {
        this.policyService = policyService;
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-edr/policies
    // -------------------------------------------------------------------------

    /**
     * Returns all agent monitoring policies.
     *
     * @return 200 OK with the list of {@link AgentPolicyDTO} bodies
     */
    @GetMapping("/policies")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<AgentPolicyDTO>> listPolicies() {
        final String ctx = CLASSNAME + ".listPolicies";
        log.debug("{}: listing all agent policies", ctx);

        List<AgentPolicyDTO> policies = policyService.listPolicies();
        return ResponseEntity.ok(policies);
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-edr/policies
    // -------------------------------------------------------------------------

    /**
     * Creates a new agent monitoring policy.
     *
     * @param dto the policy to create
     * @return 201 Created with a {@code Location} header and the created {@link AgentPolicyDTO} body
     */
    @PostMapping("/policies")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
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

    /**
     * Updates an existing agent monitoring policy.
     *
     * @param id  the ID of the policy to update
     * @param dto the updated policy data
     * @return 200 OK with the updated {@link AgentPolicyDTO} body
     */
    @PutMapping("/policies/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
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

    /**
     * Deletes an agent monitoring policy by ID.
     *
     * @param id the ID of the policy to delete
     * @return 204 No Content with no body
     */
    @DeleteMapping("/policies/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Void> deletePolicy(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".deletePolicy";
        log.debug("{}: deleting agent policy id={}", ctx, id);

        policyService.deletePolicy(id);
        return ResponseEntity.noContent().build();
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-edr/policies/{id}/assign
    // -------------------------------------------------------------------------

    /**
     * Assigns agents to an existing monitoring policy, replacing the current
     * list of assigned agent IDs.
     *
     * @param id      the ID of the policy to assign agents to
     * @param request the assign request containing the list of agent IDs
     * @return 200 OK with the updated {@link AgentPolicyDTO} body
     */
    @PostMapping("/policies/{id}/assign")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<AgentPolicyDTO> assignAgents(
            @PathVariable Long id,
            @Valid @RequestBody AgentPolicyAssignRequest request) {

        final String ctx = CLASSNAME + ".assignAgents";
        log.debug("{}: assigning agents to policy id={}", ctx, id);

        AgentPolicyDTO updated = policyService.assignAgents(id, request);
        return ResponseEntity.ok(updated);
    }
}
