package com.hivearmor.web.rest.compliance;

import com.hivearmor.service.compliance.ComplianceEvidenceService;
import com.hivearmor.service.dto.compliance.ComplianceEvidenceDTO;
import com.hivearmor.web.rest.util.PaginationUtil;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;


import java.io.IOException;
import java.io.PrintWriter;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
@RequestMapping("/api/compliance/controls")
public class ComplianceEvidenceResource {

    private final ComplianceEvidenceService evidenceService;

    public ComplianceEvidenceResource(ComplianceEvidenceService evidenceService) {
        this.evidenceService = evidenceService;
    }

    @GetMapping("/{controlId}/evidence")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<ComplianceEvidenceDTO>> getControlEvidence(
            @PathVariable Long controlId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String mappingType,
            @RequestParam(defaultValue = "30") int days) {

        Page<ComplianceEvidenceDTO> result = evidenceService.getEvidenceForControl(
                controlId, mappingType, days, PageRequest.of(page, size));

        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(
                result, "/api/compliance/controls/" + controlId + "/evidence");

        return ResponseEntity.ok().headers(headers).body(result.getContent());
    }

    @GetMapping("/{controlId}/evidence/export")
    @PreAuthorize("hasRole('USER')")
    public void exportEvidence(
            @PathVariable Long controlId,
            @RequestParam(defaultValue = "csv") String format,
            @RequestParam(defaultValue = "30") int days,
            HttpServletResponse response) throws IOException {

        List<ComplianceEvidenceDTO> items = evidenceService.getAllEvidenceForControl(controlId, days);

        response.setContentType("text/csv");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"evidence-control-" + controlId + ".csv\"");

        try (PrintWriter writer = response.getWriter()) {
            writer.println("timestamp,eventId,mappingType,weight,eventSource,eventSummary");
            DateTimeFormatter fmt = DateTimeFormatter.ISO_INSTANT.withZone(ZoneOffset.UTC);
            for (ComplianceEvidenceDTO item : items) {
                writer.printf("%s,%s,%s,%s,%s,%s%n",
                        item.getTimestamp() != null ? fmt.format(item.getTimestamp()) : "",
                        csvEscape(item.getEventId()),
                        csvEscape(item.getMappingType()),
                        item.getWeight() != null ? item.getWeight().toPlainString() : "",
                        csvEscape(item.getEventSource()),
                        csvEscape(item.getEventSummary()));
            }
        }
    }

    private static String csvEscape(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
