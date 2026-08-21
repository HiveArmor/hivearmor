package com.hivearmor.web.rest;

import com.hivearmor.service.dto.sca.CisPackCatalogDTO;
import com.hivearmor.service.dto.sca.ScaResultDTO;
import com.hivearmor.service.dto.sca.ScaSummaryDTO;
import com.hivearmor.service.telemetry.HaCisService;
import com.hivearmor.service.telemetry.TelemetryQueryException;
import com.hivearmor.service.telemetry.TelemetrySlice;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ha-cis")
public class HaCisResource {

    private static final Logger log = LoggerFactory.getLogger(HaCisResource.class);
    private static final String CLASSNAME = "HaCisResource";
    private static final String AUTH = "hasAnyAuthority('ROLE_ANALYST', 'ROLE_ADMIN', 'ROLE_SOC_MANAGER')";

    private final HaCisService cisService;

    public HaCisResource(HaCisService cisService) {
        this.cisService = cisService;
    }

    @GetMapping("/results")
    @PreAuthorize(AUTH)
    public ResponseEntity<List<ScaResultDTO>> getResults(
            @RequestParam(value = "agentId", required = false) String agentId,
            @RequestParam(value = "checkId", required = false) String checkId,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "level", required = false) String level,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "50") int size,
            @RequestParam(value = "cursor", required = false) String cursor) {
        log.debug("{}.getResults: agentId={} checkId={} status={}", CLASSNAME, agentId, checkId, status);
        TelemetrySlice<ScaResultDTO> result =
            cisService.findResults(agentId, checkId, status, level, page, size, cursor);
        return ResponseEntity.ok().headers(sliceHeaders(result)).body(result.items());
    }

    @GetMapping("/results/{resultId:\\d+}")
    @PreAuthorize(AUTH)
    public ResponseEntity<ScaResultDTO> getResult(@PathVariable long resultId) {
        return ResponseEntity.ok(cisService.findById(resultId));
    }

    @GetMapping("/results/summary")
    @PreAuthorize(AUTH)
    public ResponseEntity<List<ScaSummaryDTO>> getSummary(
            @RequestParam(value = "agentId", required = false) String agentId) {
        return ResponseEntity.ok(cisService.buildSummary(agentId));
    }

    @GetMapping("/results/agent/{agentId}")
    @PreAuthorize(AUTH)
    public ResponseEntity<List<ScaResultDTO>> getResultsByAgent(
            @PathVariable String agentId,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "100") int size,
            @RequestParam(value = "cursor", required = false) String cursor) {
        TelemetrySlice<ScaResultDTO> result =
            cisService.findResults(agentId, null, null, null, page, size, cursor);
        return ResponseEntity.ok().headers(sliceHeaders(result)).body(result.items());
    }

    @GetMapping("/catalog")
    @PreAuthorize(AUTH)
    public ResponseEntity<List<CisPackCatalogDTO>> getCatalog() {
        return ResponseEntity.ok(cisService.listObservedCatalog());
    }

    @PostMapping("/actions/preview")
    @PreAuthorize(AUTH)
    public ResponseEntity<Void> previewAction() {
        throw new TelemetryQueryException(
            "CIS_MUTATION_UNAVAILABLE",
            "Governed CIS configuration change is not configured; HiveArmor will not invent a mutation");
    }

    @PostMapping("/actions")
    @PreAuthorize(AUTH)
    public ResponseEntity<Void> executeAction() {
        throw new TelemetryQueryException(
            "CIS_MUTATION_UNAVAILABLE",
            "Governed CIS configuration execute is not configured; HiveArmor will not invent a mutation");
    }

    private HttpHeaders sliceHeaders(TelemetrySlice<?> result) {
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Total-Count", String.valueOf(result.total()));
        headers.add("X-Has-More", String.valueOf(result.hasMore()));
        if (result.nextCursor() != null) {
            headers.add("X-Next-Cursor", result.nextCursor());
        }
        return headers;
    }
}
