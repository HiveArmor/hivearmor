package com.hivearmor.web.rest;

import com.hivearmor.service.HaEdrIsolationService;
import com.hivearmor.service.HaEdrQuarantineService;
import com.hivearmor.service.HaEdrService;
import com.hivearmor.service.dto.EdrEventDTO;
import com.hivearmor.service.dto.IsolatedHostDTO;
import com.hivearmor.service.dto.ProcessNodeDTO;
import com.hivearmor.service.dto.QuarantineActionRequest;
import com.hivearmor.service.dto.QuarantineBulkRequest;
import com.hivearmor.service.dto.QuarantinedFileDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST controller for the EDR investigation endpoints.
 *
 * <p>All endpoints are mapped under {@code /api/ha-edr} and secured with
 * {@code @PreAuthorize}. Constructor injection is used exclusively — no field
 * or setter injection.
 *
 * <p>GET /api/ha-edr/process-tree — returns a flat list of process nodes for a
 * given agent and time window. The frontend assembles the tree via
 * {@code buildProcessTree} in {@code edrService.ts}.
 *
 * <p>GET /api/ha-edr/quarantine — lists quarantined files with optional filters.
 * <p>PATCH /api/ha-edr/quarantine/{id} — applies a restore or delete action to a
 * single quarantined file.
 * <p>POST /api/ha-edr/quarantine/bulk — applies a restore or delete action to
 * multiple quarantined files in one request.
 * <p>GET /api/ha-edr/isolation — secured host-isolation inventory (STAGING
 * CANDIDATE). Does not adopt legacy {@code /api/edr/isolation}.
 */
@RestController
@RequestMapping("/api/ha-edr")
public class HaEdrResource {

    private static final Logger log = LoggerFactory.getLogger(HaEdrResource.class);
    private static final String CLASSNAME = "HaEdrResource";

    private final HaEdrService haEdrService;
    private final HaEdrQuarantineService haEdrQuarantineService;
    private final HaEdrIsolationService haEdrIsolationService;

    public HaEdrResource(HaEdrService haEdrService,
                         HaEdrQuarantineService haEdrQuarantineService,
                         HaEdrIsolationService haEdrIsolationService) {
        this.haEdrService = haEdrService;
        this.haEdrQuarantineService = haEdrQuarantineService;
        this.haEdrIsolationService = haEdrIsolationService;
    }

    /**
     * GET /api/ha-edr/process-tree
     *
     * <p>Returns a flat list of {@link ProcessNodeDTO} objects representing all
     * processes observed on the specified agent within a sliding window of
     * [{@code timestamp} − {@code windowMinutes}, {@code timestamp} + {@code windowMinutes}].
     *
     * @param agentId       the agent identifier (required)
     * @param timestamp     ISO-8601 anchor timestamp (required)
     * @param windowMinutes half-width of the time window in minutes (optional, default 30)
     * @return 200 OK with the process node list, or 200 with an empty list on error
     */
    @GetMapping("/process-tree")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_ANALYST', 'ROLE_SOC_MANAGER')")
    public ResponseEntity<List<ProcessNodeDTO>> getProcessTree(
            @RequestParam("agentId") String agentId,
            @RequestParam("timestamp") String timestamp,
            @RequestParam(value = "windowMinutes", defaultValue = "30") int windowMinutes) {

        final String ctx = CLASSNAME + ".getProcessTree";
        log.debug("{}: agentId={}, timestamp={}, windowMinutes={}", ctx, agentId, timestamp, windowMinutes);

        List<ProcessNodeDTO> nodes = haEdrService.fetchProcessNodes(agentId, timestamp, windowMinutes);
        return ResponseEntity.ok(nodes);
    }

    /**
     * GET /api/ha-edr/timeline
     *
     * <p>Returns a paginated list of {@link EdrEventDTO} objects for the given agent
     * and time range. The optional {@code types} parameter accepts a comma-separated
     * list of EdrEventType values; when absent or blank, all event types are returned.
     *
     * <p>{@code size} is clamped to a maximum of 200 regardless of the caller's input.
     *
     * @param agentId the agent identifier (required)
     * @param from    ISO-8601 start of the time range (required)
     * @param to      ISO-8601 end of the time range (required)
     * @param types   comma-separated event type filter (optional)
     * @param page    zero-based page index (default 0)
     * @param size    page size, clamped to max 200 (default 50)
     * @return 200 OK with a page of EDR events
     */
    @GetMapping("/timeline")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_ANALYST', 'ROLE_SOC_MANAGER')")
    public ResponseEntity<Page<EdrEventDTO>> getTimeline(
            @RequestParam("agentId") String agentId,
            @RequestParam("from") String from,
            @RequestParam("to") String to,
            @RequestParam(value = "types", required = false) String types,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "50") int size) {

        final String ctx = CLASSNAME + ".getTimeline";
        int clampedSize = Math.min(size, 200);
        log.debug("{}: agentId={}, from={}, to={}, types={}, page={}, size={}",
                ctx, agentId, from, to, types, page, clampedSize);

        Page<EdrEventDTO> result = haEdrService.fetchTimeline(agentId, from, to, types, page, clampedSize);
        return ResponseEntity.ok(result);
    }

    /**
     * GET /api/ha-edr/quarantine
     *
     * <p>Returns a paginated list of quarantined files, optionally filtered by
     * {@code agentId} and/or {@code status}. Results are sorted by
     * {@code quarantineTime} descending.
     *
     * @param agentId filter by agent identifier (optional)
     * @param status  filter by quarantine status, e.g. {@code "quarantined"},
     *                {@code "restored"}, {@code "deleted"} (optional)
     * @param page    zero-based page index (default 0)
     * @param size    page size (default 50)
     * @return 200 OK with a page of {@link QuarantinedFileDTO}
     */
    @GetMapping("/quarantine")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN')")
    public ResponseEntity<Page<QuarantinedFileDTO>> listQuarantinedFiles(
            @RequestParam(value = "agentId", required = false) String agentId,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "50") int size) {

        final String ctx = CLASSNAME + ".listQuarantinedFiles";
        log.debug("{}: agentId={}, status={}, page={}, size={}", ctx, agentId, status, page, size);

        Page<QuarantinedFileDTO> result = haEdrQuarantineService.listQuarantinedFiles(agentId, status, page, size);
        return ResponseEntity.ok(result);
    }

    /**
     * PATCH /api/ha-edr/quarantine/{id}
     *
     * <p>Applies a restore or delete action to a single quarantined file record.
     * The {@code action} field in the request body must be {@code "restore"} or
     * {@code "delete"}.
     *
     * @param id      the quarantine record ID
     * @param request the action request body
     * @return 200 OK with the updated {@link QuarantinedFileDTO}
     */
    @PatchMapping("/quarantine/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN')")
    public ResponseEntity<QuarantinedFileDTO> applyQuarantineAction(
            @PathVariable("id") Long id,
            @RequestBody QuarantineActionRequest request) {

        final String ctx = CLASSNAME + ".applyQuarantineAction";
        log.debug("{}: id={}, action={}", ctx, id, request.getAction());

        QuarantinedFileDTO result = haEdrQuarantineService.applyAction(id, request);
        return ResponseEntity.ok(result);
    }

    /**
     * POST /api/ha-edr/quarantine/bulk
     *
     * <p>Applies a restore or delete action to multiple quarantined file records
     * in a single request. The {@code action} field in the request body must be
     * {@code "restore"} or {@code "delete"}.
     *
     * @param request the bulk action request body containing a list of IDs and the action
     * @return 200 OK with the list of updated {@link QuarantinedFileDTO}
     */
    @PostMapping("/quarantine/bulk")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN')")
    public ResponseEntity<List<QuarantinedFileDTO>> applyBulkQuarantineAction(
            @RequestBody QuarantineBulkRequest request) {

        final String ctx = CLASSNAME + ".applyBulkQuarantineAction";
        log.debug("{}: ids={}, action={}", ctx, request.getIds(), request.getAction());

        List<QuarantinedFileDTO> result = haEdrQuarantineService.applyBulkAction(request);
        return ResponseEntity.ok(result);
    }

    /**
     * GET /api/ha-edr/isolation
     *
     * <p>Returns a paginated host-isolation inventory from
     * {@code hive_edr_isolation}, optionally filtered by status. Sorted by
     * {@code isolatedAt} descending. {@code size} is clamped to 200.
     *
     * <p>STAGING CANDIDATE — read only. Governed lift/release, cursor/freshness
     * semantics, and action history remain RESP-021 open gaps. Legacy
     * {@code /api/edr/isolation} is not adopted.
     *
     * @param status filter by status, e.g. {@code ACTIVE}, {@code LIFTED},
     *               {@code FAILED} (optional)
     * @param page   zero-based page index (default 0)
     * @param size   page size, clamped to max 200 (default 50)
     * @return 200 OK with a page of {@link IsolatedHostDTO}
     */
    @GetMapping("/isolation")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN')")
    public ResponseEntity<Page<IsolatedHostDTO>> listIsolatedHosts(
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "50") int size) {

        final String ctx = CLASSNAME + ".listIsolatedHosts";
        int clampedSize = Math.min(Math.max(size, 1), 200);
        log.debug("{}: status={}, page={}, size={}", ctx, status, page, clampedSize);

        Page<IsolatedHostDTO> result = haEdrIsolationService.listIsolatedHosts(status, page, clampedSize);
        return ResponseEntity.ok(result);
    }
}
