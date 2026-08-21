package com.hivearmor.web.rest;

import com.hivearmor.service.HaEdrFimService;
import com.hivearmor.service.dto.FimSummaryDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for the File Integrity Monitoring (FIM) dashboard endpoint.
 *
 * <p>All endpoints are mounted under {@code /api/ha-edr} and are protected by
 * {@code @PreAuthorize("hasAnyAuthority('ROLE_ANALYST', 'ROLE_ADMIN')")}.
 *
 * <p>Constraints upheld:
 * <ul>
 *   <li>Constructor injection only — no {@code @Autowired} on fields or setters.
 *   <li>No Lombok annotations.
 *   <li>No {@code java.util.List#getFirst()} calls.
 * </ul>
 */
@RestController
@RequestMapping("/api/ha-edr")
public class HaEdrFimResource {

    private static final Logger log = LoggerFactory.getLogger(HaEdrFimResource.class);
    private static final String CLASSNAME = "HaEdrFimResource";

    private final HaEdrFimService fimService;

    public HaEdrFimResource(HaEdrFimService fimService) {
        this.fimService = fimService;
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-edr/fim/summary
    // -------------------------------------------------------------------------

    /**
     * Returns a FIM summary covering Changes Over Time, Top Changed Paths,
     * and Suspicious Hashes for the specified time window and optional filters.
     *
     * <p>Query parameters:
     * <ul>
     *   <li>{@code from}        — ISO-8601 start of the time window (required)
     *   <li>{@code to}          — ISO-8601 end of the time window (required)
     *   <li>{@code agentIds}    — comma-separated agent IDs (optional)
     *   <li>{@code changeTypes} — comma-separated change types: create, modify, delete, rename (optional)
     * </ul>
     *
     * @param from        inclusive start of the time range (required)
     * @param to          inclusive end of the time range (required)
     * @param agentIds    comma-separated agent IDs to scope the query (optional)
     * @param changeTypes comma-separated change types to include (optional)
     * @return 200 OK with a {@link FimSummaryDTO} body
     */
    @GetMapping("/fim/summary")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST', 'ROLE_ADMIN')")
    public ResponseEntity<FimSummaryDTO> getFimSummary(
            @RequestParam("from") String from,
            @RequestParam("to") String to,
            @RequestParam(value = "agentIds", required = false) String agentIds,
            @RequestParam(value = "changeTypes", required = false) String changeTypes) {

        final String ctx = CLASSNAME + ".getFimSummary";
        log.debug("{}: from={} to={} agentIds={} changeTypes={}", ctx, from, to, agentIds, changeTypes);

        FimSummaryDTO summary = fimService.buildSummary(from, to, agentIds, changeTypes);
        return ResponseEntity.ok(summary);
    }
}
