package com.hivearmor.web.rest.mssp;

import com.hivearmor.service.mssp.MsspAggregateReportService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * REST controller that exposes the MSSP aggregate XLSX report endpoint.
 *
 * <h3>Endpoint</h3>
 * <pre>
 *   GET /api/ha-mssp/reports/aggregate
 * </pre>
 *
 * <h3>Access control</h3>
 * Gated by {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")} — only callers whose
 * JWT includes the {@code MSSP_ADMIN} authority may invoke it. Spring Security returns
 * {@code 403} for under-privileged JWTs and {@code 401} for requests without an
 * {@code Authorization} header (Requirements 11.5, 11.6, 11.7).
 *
 * <h3>Response headers</h3>
 * <ul>
 *   <li>{@code Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet}</li>
 *   <li>{@code Content-Disposition: attachment; filename="hivearmor-mssp-aggregate-YYYY-MM-DD.xlsx"}
 *       where the date is the current UTC calendar date (Requirement 11.3, 11.4).</li>
 * </ul>
 *
 * <h3>Error handling</h3>
 * Any exception thrown by {@link MsspAggregateReportService#buildAggregateWorkbook()} is
 * mapped by the global {@code @ControllerAdvice} to HTTP {@code 500} with an empty body —
 * never a partial workbook (Requirement 11.8).
 *
 * <p>Sprint 24 — S24-T03 task 3.3.
 */
@RestController
@RequestMapping("/api/ha-mssp")
public class MsspAggregateReportController {

    private static final String XLSX_CONTENT_TYPE =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static final DateTimeFormatter FILE_DATE =
            DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneOffset.UTC);

    private final MsspAggregateReportService msspAggregateReportService;
    private final Clock clock;

    public MsspAggregateReportController(
            MsspAggregateReportService msspAggregateReportService,
            Clock clock) {
        this.msspAggregateReportService = msspAggregateReportService;
        this.clock = clock;
    }

    /**
     * Returns the MSSP aggregate XLSX workbook.
     *
     * <p>The filename in the {@code Content-Disposition} header uses the current UTC
     * calendar date so that repeated downloads within the same UTC day produce the
     * same filename (deterministic under test via {@link Clock} injection).
     *
     * @return {@code 200 OK} with the XLSX bytes and correct response headers
     */
    @GetMapping("/reports/aggregate")
    @PreAuthorize("hasAuthority('MSSP_ADMIN')")
    public ResponseEntity<byte[]> aggregate() {
        byte[] workbook = msspAggregateReportService.buildAggregateWorkbook();
        String filename = "hivearmor-mssp-aggregate-" + FILE_DATE.format(clock.instant()) + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, XLSX_CONTENT_TYPE)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .body(workbook);
    }
}
