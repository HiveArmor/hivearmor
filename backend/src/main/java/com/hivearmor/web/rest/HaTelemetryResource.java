package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.JsonNode;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.telemetry.HaTelemetryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for agent telemetry ingest endpoints.
 *
 * <p>These endpoints are called by the HiveArmor agent binary, not by the
 * frontend. Authentication is {@code X-HiveArmor-Agent-Id} plus {@code X-Agent-Key},
 * or {@code INTERNAL_KEY} when {@code ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY=true}.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>{@code POST /api/ha-telemetry/sbom} — receive CycloneDX 1.5 SBOM payload
 *   <li>{@code POST /api/ha-telemetry/sca}  — receive SCA (CIS benchmark) results
 *   <li>{@code PUT  /api/ha-telemetry/vitals/:agentId} — receive agent vitals sample
 * </ul>
 *
 * <p>Constraints upheld:
 * <ul>
 *   <li>Constructor injection only.
 *   <li>No Lombok.
 *   <li>No {@code List#getFirst()}.
 * </ul>
 */
@RestController
@RequestMapping("/api/ha-telemetry")
public class HaTelemetryResource {

    private static final Logger log = LoggerFactory.getLogger(HaTelemetryResource.class);
    private static final String CLASSNAME = "HaTelemetryResource";

    private final HaTelemetryService telemetryService;

    public HaTelemetryResource(HaTelemetryService telemetryService) {
        this.telemetryService = telemetryService;
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-telemetry/sbom
    // -------------------------------------------------------------------------

    /**
     * Receives a CycloneDX 1.5 SBOM payload from the agent.
     *
     * <p>The payload is a JSON object conforming to the CycloneDX 1.5 schema.
     * The service parses the component list, upserts {@code ha_sbom_component}
     * rows, and triggers an asynchronous CVE matching job.
     *
     * @param payload CycloneDX JSON body
     * @return 202 Accepted
     */
    @PostMapping("/sbom")
    public ResponseEntity<Void> ingestSbom(@RequestBody JsonNode payload) {
        final String ctx = CLASSNAME + ".ingestSbom";
        log.debug("{}: received SBOM payload ({} bytes)", ctx,
                payload != null ? payload.toString().length() : 0);
        telemetryService.processSbom(payload, TenantContext.getClientId());
        return ResponseEntity.accepted().build();
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-telemetry/sca
    // -------------------------------------------------------------------------

    /**
     * Receives a batch of SCA (Security Configuration Assessment) results from the agent.
     *
     * <p>The payload is a JSON object containing:
     * <ul>
     *   <li>{@code agentId} — agent identifier
     *   <li>{@code packId}  — CIS benchmark pack identifier
     *   <li>{@code results} — array of check result objects
     * </ul>
     *
     * @param payload SCA results JSON body
     * @return 202 Accepted
     */
    @PostMapping("/sca")
    public ResponseEntity<Void> ingestSca(@RequestBody JsonNode payload) {
        final String ctx = CLASSNAME + ".ingestSca";
        log.debug("{}: received SCA results", ctx);
        telemetryService.processSca(payload, TenantContext.getClientId());
        return ResponseEntity.accepted().build();
    }

    // -------------------------------------------------------------------------
    // PUT /api/ha-telemetry/vitals/{agentId}   — agent writes vitals
    // GET /api/ha-telemetry/vitals/{agentId}   — frontend reads stored vitals
    // -------------------------------------------------------------------------

    /**
     * Receives an agent vitals sample (CPU, RAM, queue depth, EPS).
     * Called by the agent binary using an INTERNAL_KEY header.
     */
    @PutMapping("/vitals/{agentId}")
    public ResponseEntity<Void> ingestVitals(
            @PathVariable String agentId,
            @RequestBody JsonNode payload) {
        final String ctx = CLASSNAME + ".ingestVitals";
        log.debug("{}: agentId={}", ctx, agentId);
        telemetryService.processVitals(agentId, payload);
        return ResponseEntity.noContent().build();
    }

    /**
     * Returns the most recent vitals samples for a specific agent.
     * Called by the SensorGridPage to render sparklines and health indicators.
     * Returns up to 144 samples (12 hours at 5-min intervals, or 72 hours at 30s intervals).
     *
     * @param agentId the agent identifier
     * @return 200 OK with list of vitals samples, newest-first
     */
    @GetMapping("/vitals/{agentId}")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_SOC_MANAGER', 'ROLE_ANALYST', 'ROLE_USER')")
    public ResponseEntity<java.util.List<java.util.Map<String, Object>>> getVitals(
            @PathVariable String agentId) {
        final String ctx = CLASSNAME + ".getVitals";
        log.debug("{}: agentId={}", ctx, agentId);
        java.util.List<java.util.Map<String, Object>> vitals = telemetryService.getRecentVitals(agentId);
        return ResponseEntity.ok(vitals);
    }
}
