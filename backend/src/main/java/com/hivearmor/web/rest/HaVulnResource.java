package com.hivearmor.web.rest;

import com.hivearmor.service.dto.vuln.VulnFindingDTO;
import com.hivearmor.service.dto.vuln.VulnRemediationConnectorDTO;
import com.hivearmor.service.dto.vuln.VulnRemediationDTO;
import com.hivearmor.service.dto.vuln.VulnSummaryDTO;
import com.hivearmor.service.telemetry.HaVulnService;
import com.hivearmor.service.telemetry.TelemetryQueryException;
import com.hivearmor.service.telemetry.TelemetrySlice;
import com.hivearmor.service.telemetry.VulnRemediationCatalog;
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
@RequestMapping("/api/ha-vuln")
public class HaVulnResource {

    private static final Logger log = LoggerFactory.getLogger(HaVulnResource.class);
    private static final String CLASSNAME = "HaVulnResource";
    private static final String AUTH = "hasAnyAuthority('ROLE_ANALYST', 'ROLE_ADMIN', 'ROLE_SOC_MANAGER')";

    private final HaVulnService vulnService;

    public HaVulnResource(HaVulnService vulnService) {
        this.vulnService = vulnService;
    }

    @GetMapping("/findings")
    @PreAuthorize(AUTH)
    public ResponseEntity<List<VulnFindingDTO>> getFindings(
            @RequestParam(value = "agentId", required = false) String agentId,
            @RequestParam(value = "severity", required = false) String severity,
            @RequestParam(value = "isKev", required = false) Boolean isKev,
            @RequestParam(value = "cve", required = false) String cve,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "25") int size,
            @RequestParam(value = "cursor", required = false) String cursor) {

        log.debug("{}.getFindings: agentId={} severity={} page={} size={}", CLASSNAME, agentId, severity, page, size);
        TelemetrySlice<VulnFindingDTO> result =
            vulnService.findAll(agentId, severity, isKev, cve, from, to, page, size, cursor);
        return ResponseEntity.ok().headers(sliceHeaders(result)).body(result.items());
    }

    @GetMapping("/findings/{findingId:\\d+}")
    @PreAuthorize(AUTH)
    public ResponseEntity<VulnFindingDTO> getFinding(@PathVariable long findingId) {
        return ResponseEntity.ok(vulnService.findById(findingId));
    }

    @GetMapping("/findings/{findingId:\\d+}/remediation")
    @PreAuthorize(AUTH)
    public ResponseEntity<VulnRemediationDTO> getRemediation(@PathVariable long findingId) {
        return ResponseEntity.ok(vulnService.remediationFor(findingId));
    }

    @GetMapping("/remediation-connectors")
    @PreAuthorize(AUTH)
    public ResponseEntity<List<VulnRemediationConnectorDTO>> getRemediationConnectors() {
        return ResponseEntity.ok(VulnRemediationCatalog.connectors());
    }

    @PostMapping("/findings/{findingId:\\d+}/remediation/execute")
    @PreAuthorize(AUTH)
    public ResponseEntity<Void> executeRemediation(@PathVariable long findingId) {
        vulnService.findById(findingId);
        throw new TelemetryQueryException(
            "VUL_REMEDIATION_UNAVAILABLE",
            "Governed remediation execute is not configured; HiveArmor will not invent a patch job");
    }

    @GetMapping("/findings/summary")
    @PreAuthorize(AUTH)
    public ResponseEntity<VulnSummaryDTO> getSummary(
            @RequestParam(value = "agentId", required = false) String agentId,
            @RequestParam(value = "severity", required = false) String severity,
            @RequestParam(value = "isKev", required = false) Boolean isKev,
            @RequestParam(value = "cve", required = false) String cve,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to) {
        return ResponseEntity.ok(vulnService.buildSummary(agentId, severity, isKev, cve, from, to));
    }

    @GetMapping("/findings/agent/{agentId}")
    @PreAuthorize(AUTH)
    public ResponseEntity<List<VulnFindingDTO>> getFindingsByAgent(
            @PathVariable String agentId,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "50") int size,
            @RequestParam(value = "cursor", required = false) String cursor) {
        TelemetrySlice<VulnFindingDTO> result =
            vulnService.findAll(agentId, null, null, null, null, null, page, size, cursor);
        return ResponseEntity.ok().headers(sliceHeaders(result)).body(result.items());
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
