package com.hivearmor.web.rest.compliance;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.compliance.UtmComplianceReportExport;
import com.hivearmor.domain.compliance.UtmComplianceReportSchedule;
import com.hivearmor.repository.compliance.UtmComplianceReportScheduleRepository;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.compliance.ComplianceReportExportService;
import com.hivearmor.util.ResponseUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Bridge controller that serves the frontend's expected URL paths.
 *
 * GET  /api/ha-compliance-report-config    → list generated compliance reports
 * POST /api/ha-compliance-report-config    → create (generate) a new report
 * DELETE /api/ha-compliance-report-config/{id} → delete a report
 * GET  /api/ha-compliance-report-config/{id}/export → stream PDF
 *
 * GET  /api/ha-compliance-schedule → list scheduled reports (bridges to existing schedule data)
 */
@RestController
@RequestMapping("/api")
public class ComplianceReportExportResource {

    private static final String CLASSNAME = "ComplianceReportExportResource";
    private final Logger log = LoggerFactory.getLogger(ComplianceReportExportResource.class);

    private final ComplianceReportExportService exportService;
    private final UtmComplianceReportScheduleRepository scheduleRepo;
    private final ApplicationEventService eventService;

    public ComplianceReportExportResource(
        ComplianceReportExportService exportService,
        UtmComplianceReportScheduleRepository scheduleRepo,
        ApplicationEventService eventService
    ) {
        this.exportService = exportService;
        this.scheduleRepo = scheduleRepo;
        this.eventService = eventService;
    }

    /** List generated reports (paged). */
    @GetMapping("/ha-compliance-report-config")
    public ResponseEntity<List<UtmComplianceReportExport>> listReports(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size
    ) {
        final String ctx = CLASSNAME + ".listReports";
        try {
            return ResponseEntity.ok(exportService.list(page, size));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /** Create / kick off a new compliance report. */
    @PostMapping("/ha-compliance-report-config")
    public ResponseEntity<UtmComplianceReportExport> createReport(@RequestBody Map<String, Object> body) {
        final String ctx = CLASSNAME + ".createReport";
        try {
            String reportName = (String) body.getOrDefault("reportName", "Compliance Report");
            String standard   = (String) body.getOrDefault("standard", "Unknown");
            String createdBy  = currentUser();
            UtmComplianceReportExport record = exportService.create(reportName, standard, createdBy);
            return ResponseEntity.status(HttpStatus.CREATED).body(record);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /** Delete a report record. */
    @DeleteMapping("/ha-compliance-report-config/{id}")
    public ResponseEntity<Void> deleteReport(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".deleteReport";
        try {
            exportService.delete(id);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /** Stream a generated PDF for the given report. */
    @GetMapping(value = "/ha-compliance-report-config/{id}/export", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> exportPdf(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".exportPdf";
        try {
            Optional<byte[]> pdfOpt = exportService.generatePdf(id);
            if (pdfOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            byte[] bytes = pdfOpt.get();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment", "compliance-report-" + id + ".pdf");
            headers.setContentLength(bytes.length);
            return ResponseEntity.ok().headers(headers).body(bytes);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Bridge: frontend calls /api/ha-compliance-schedule but the real data lives
     * at /api/compliance-report-schedules-by-user. Return the same schedule data
     * shaped to match the frontend ScheduledReport interface.
     */
    @GetMapping("/ha-compliance-schedule")
    public ResponseEntity<List<Map<String, Object>>> listSchedules(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size
    ) {
        final String ctx = CLASSNAME + ".listSchedules";
        try {
            List<UtmComplianceReportSchedule> schedules = scheduleRepo.findAll(PageRequest.of(page, size)).getContent();
            List<Map<String, Object>> result = schedules.stream()
                .map(s -> {
                    String name = s.getCompliance() != null && s.getCompliance().getConfigReportName() != null
                        ? s.getCompliance().getConfigReportName()
                        : "Scheduled Report #" + s.getId();
                    return Map.<String, Object>of(
                        "id", s.getId(),
                        "name", name,
                        "frequency", s.getScheduleString() != null ? s.getScheduleString() : "—",
                        "nextRun", s.getLastExecutionTime() != null ? s.getLastExecutionTime().toString() : "",
                        "status", "Active"
                    );
                })
                .toList();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    private String currentUser() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }
}
