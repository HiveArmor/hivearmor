package com.hivearmor.web.rest;

import com.hivearmor.service.compliance.PostureReportPackService;
import com.hivearmor.service.dto.posture.FleetCisPostureDTO;
import com.hivearmor.service.dto.posture.FleetPostureOverviewDTO;
import com.hivearmor.service.dto.posture.PostureTrendDTO;
import com.hivearmor.service.telemetry.HaPostureReportService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

/**
 * Cross-fleet compliance / posture reporting read surface (SPEC-PT-6). Aggregates the
 * REAL per-host PT-5 CIS/vuln results into fleet-wide posture, trend/drift and coverage
 * honesty — it owns no store. Tenant scoping is enforced inside
 * {@link HaPostureReportService} (fail-closed for an unresolved MSSP scope).
 *
 * <p>Read-only, distinct from the per-host {@code /api/ha-cis-scan} + {@code /api/ha-vuln}
 * surfaces (PT-5) and from {@code /api/ha-posture} (compliance-framework assurance).
 *
 * <p>Constructor injection only; no Lombok.
 */
@RestController
@RequestMapping("/api/ha-posture-report")
public class HaPostureReportResource {

    private static final Logger log = LoggerFactory.getLogger(HaPostureReportResource.class);
    private static final String CLASSNAME = "HaPostureReportResource";
    private static final String AUTH = "hasAnyAuthority('ROLE_ANALYST', 'ROLE_ADMIN', 'ROLE_SOC_MANAGER')";

    private final HaPostureReportService postureReportService;
    private final PostureReportPackService reportPackService;

    public HaPostureReportResource(HaPostureReportService postureReportService,
                                   PostureReportPackService reportPackService) {
        this.postureReportService = postureReportService;
        this.reportPackService = reportPackService;
    }

    /** Composite cross-fleet overview: CIS posture + vuln-by-severity + coverage honesty. */
    @GetMapping("/overview")
    @PreAuthorize(AUTH)
    public ResponseEntity<FleetPostureOverviewDTO> getOverview() {
        log.debug("{}.getOverview", CLASSNAME);
        return ResponseEntity.ok(postureReportService.overview());
    }

    /** Cross-fleet CIS benchmark posture: fleet rollup + per-host grid + not-covered count. */
    @GetMapping("/cis")
    @PreAuthorize(AUTH)
    public ResponseEntity<FleetCisPostureDTO> getFleetCis() {
        log.debug("{}.getFleetCis", CLASSNAME);
        return ResponseEntity.ok(postureReportService.fleetCis());
    }

    /** Posture-over-time: day-bucketed CIS pass-rate series + latest-vs-previous drift. */
    @GetMapping("/trend")
    @PreAuthorize(AUTH)
    public ResponseEntity<PostureTrendDTO> getTrend(
            @RequestParam(value = "days", defaultValue = "90") int days) {
        log.debug("{}.getTrend: days={}", CLASSNAME, days);
        return ResponseEntity.ok(postureReportService.trend(days));
    }

    // --- report-pack exports (SPEC-PT-6 §2) ---------------------------------

    /** Combined CIS + vulnerability posture report pack as a branded PDF download. */
    @GetMapping(value = "/export/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize(AUTH)
    public ResponseEntity<byte[]> exportPdf() {
        log.debug("{}.exportPdf", CLASSNAME);
        byte[] body = reportPackService.overviewPdf();
        return ResponseEntity.ok()
                .headers(attachment("fleet-posture-report", "pdf"))
                .contentType(MediaType.APPLICATION_PDF)
                .body(body);
    }

    /** CIS benchmark compliance summary (fleet rollup + per-host grid) as RFC-4180 CSV. */
    @GetMapping(value = "/export/cis.csv", produces = "text/csv")
    @PreAuthorize(AUTH)
    public ResponseEntity<byte[]> exportCisCsv() {
        log.debug("{}.exportCisCsv", CLASSNAME);
        return ResponseEntity.ok()
                .headers(attachment("fleet-cis-posture", "csv"))
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(reportPackService.cisCsv());
    }

    /** Vulnerability-exposure report (severity rollup + top CVEs) as RFC-4180 CSV. */
    @GetMapping(value = "/export/vuln.csv", produces = "text/csv")
    @PreAuthorize(AUTH)
    public ResponseEntity<byte[]> exportVulnCsv() {
        log.debug("{}.exportVulnCsv", CLASSNAME);
        return ResponseEntity.ok()
                .headers(attachment("fleet-vuln-exposure", "csv"))
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(reportPackService.vulnCsv());
    }

    private HttpHeaders attachment(String base, String ext) {
        HttpHeaders headers = new HttpHeaders();
        String filename = base + "-" + Instant.now().getEpochSecond() + "." + ext;
        headers.setContentDisposition(ContentDisposition.attachment().filename(filename).build());
        return headers;
    }
}
