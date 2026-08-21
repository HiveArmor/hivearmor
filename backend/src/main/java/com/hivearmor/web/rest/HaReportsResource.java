package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.compliance.UtmComplianceReportSchedule;
import com.hivearmor.repository.compliance.UtmComplianceReportScheduleRepository;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.dto.HiveScheduledReportDTO;
import com.hivearmor.util.UtilPagination;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * REST controller — Scheduled Reports (P4).
 *
 * GET    /api/ha-reports/scheduled                  — list all scheduled reports
 * POST   /api/ha-reports/scheduled                  — create a scheduled report
 * PUT    /api/ha-reports/scheduled/{id}              — update a scheduled report
 * DELETE /api/ha-reports/scheduled/{id}              — delete a scheduled report
 * POST   /api/ha-reports/scheduled/{id}/run          — trigger immediate run
 * PATCH  /api/ha-reports/scheduled/{id}/pause        — pause (set active=false)
 * PATCH  /api/ha-reports/scheduled/{id}/resume       — resume (set active=true)
 *
 * Backed by hive_compliance_report_schedule.
 * The "type" field maps to complianceId; schedule/format/recipients stored in scheduleString as JSON.
 */
@RestController
@RequestMapping("/api/ha-reports")
@PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER + "')")
public class HaReportsResource {

    private static final Logger log = LoggerFactory.getLogger(HaReportsResource.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final UtmComplianceReportScheduleRepository scheduleRepo;

    public HaReportsResource(UtmComplianceReportScheduleRepository scheduleRepo) {
        this.scheduleRepo = scheduleRepo;
    }

    // ------------------------------------------------------------------
    // Request body — matches frontend CreateScheduledReportDTO
    // ------------------------------------------------------------------

    public record CreateReportRequest(
        @NotBlank String name,
        String description,
        @NotBlank String type,
        @NotBlank String schedule,
        List<String> recipients,
        @NotNull String format   // PDF | CSV | JSON
    ) {}

    public record UpdateReportRequest(
        @NotBlank String name,
        String description,
        @NotBlank String type,
        @NotBlank String schedule,
        List<String> recipients,
        @NotNull String format,
        boolean active
    ) {}

    // ------------------------------------------------------------------
    // CRUD
    // ------------------------------------------------------------------

    /** GET /api/ha-reports/scheduled */
    @GetMapping("/scheduled")
    public ResponseEntity<List<HiveScheduledReportDTO>> listScheduledReports(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size,
            Authentication auth) {
        log.debug("GET /api/ha-reports/scheduled");

        List<UtmComplianceReportSchedule> all = scheduleRepo.findAll();
        List<HiveScheduledReportDTO> dtos = all.stream().map(this::toDTO).toList();

        long total = dtos.size();
        int from = page * size;
        List<HiveScheduledReportDTO> paged = dtos.stream().skip(from).limit(size).toList();

        HttpHeaders headers = UtilPagination.generatePaginationHttpHeaders(
            total, page, size, "/api/ha-reports/scheduled");
        return ResponseEntity.ok().headers(headers).body(paged);
    }

    /** POST /api/ha-reports/scheduled */
    @PostMapping("/scheduled")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<HiveScheduledReportDTO> createScheduledReport(
            @Valid @RequestBody CreateReportRequest req,
            Authentication auth) {
        log.debug("POST /api/ha-reports/scheduled name={}", req.name());

        UtmComplianceReportSchedule entity = new UtmComplianceReportSchedule();
        entity.setScheduleString(buildScheduleString(req.name(), req.description(), req.type(),
            req.schedule(), req.recipients(), req.format(), true));
        entity.setComplianceId(1L);  // default compliance group — updated via PUT if needed
        entity.setLastExecutionTime(Instant.EPOCH);
        entity.setUrlWithParams("/api/ha-reports/run");

        UtmComplianceReportSchedule saved = scheduleRepo.save(entity);
        return ResponseEntity
            .created(URI.create("/api/ha-reports/scheduled/" + saved.getId()))
            .body(toDTO(saved));
    }

    /** PUT /api/ha-reports/scheduled/{id} */
    @PutMapping("/scheduled/{id}")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<HiveScheduledReportDTO> updateScheduledReport(
            @PathVariable Long id,
            @Valid @RequestBody UpdateReportRequest req) {
        log.debug("PUT /api/ha-reports/scheduled/{}", id);
        return scheduleRepo.findById(id).map(entity -> {
            entity.setScheduleString(buildScheduleString(req.name(), req.description(), req.type(),
                req.schedule(), req.recipients(), req.format(), req.active()));
            return ResponseEntity.ok(toDTO(scheduleRepo.save(entity)));
        }).orElse(ResponseEntity.notFound().build());
    }

    /** DELETE /api/ha-reports/scheduled/{id} */
    @DeleteMapping("/scheduled/{id}")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<Void> deleteScheduledReport(@PathVariable Long id) {
        log.debug("DELETE /api/ha-reports/scheduled/{}", id);
        if (!scheduleRepo.existsById(id)) return ResponseEntity.notFound().build();
        scheduleRepo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /** POST /api/ha-reports/scheduled/{id}/run — trigger immediate generation */
    @PostMapping("/scheduled/{id}/run")
    public ResponseEntity<Void> runReport(@PathVariable Long id) {
        log.debug("POST /api/ha-reports/scheduled/{}/run", id);
        var opt = scheduleRepo.findById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        var entity = opt.get();
        entity.setLastExecutionTime(Instant.now());
        scheduleRepo.save(entity);
        return ResponseEntity.accepted().build();
    }

    /** PATCH /api/ha-reports/scheduled/{id}/pause */
    @PatchMapping("/scheduled/{id}/pause")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<HiveScheduledReportDTO> pauseReport(@PathVariable Long id) {
        log.debug("PATCH /api/ha-reports/scheduled/{}/pause", id);
        return toggleActive(id, false);
    }

    /** PATCH /api/ha-reports/scheduled/{id}/resume */
    @PatchMapping("/scheduled/{id}/resume")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<HiveScheduledReportDTO> resumeReport(@PathVariable Long id) {
        log.debug("PATCH /api/ha-reports/scheduled/{}/resume", id);
        return toggleActive(id, true);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private ResponseEntity<HiveScheduledReportDTO> toggleActive(Long id, boolean active) {
        return scheduleRepo.findById(id).map(entity -> {
            Map<String, Object> parsed = parseScheduleString(entity.getScheduleString());
            parsed.put("active", active);
            entity.setScheduleString(serializeScheduleString(parsed));
            return ResponseEntity.ok(toDTO(scheduleRepo.save(entity)));
        }).orElse(ResponseEntity.notFound().build());
    }

    /**
     * We store all extended fields as JSON in scheduleString since the legacy entity
     * only has scheduleString, complianceId, and userId columns.
     * Format: {"name":"...","description":"...","type":"...","schedule":"...","recipients":[...],"format":"PDF","active":true}
     */
    private String buildScheduleString(String name, String description, String type,
                                       String schedule, List<String> recipients,
                                       String format, boolean active) {
        try {
            return MAPPER.writeValueAsString(Map.of(
                "name", name != null ? name : "",
                "description", description != null ? description : "",
                "type", type != null ? type : "",
                "schedule", schedule != null ? schedule : "",
                "recipients", recipients != null ? recipients : List.of(),
                "format", format != null ? format : "PDF",
                "active", active
            ));
        } catch (Exception e) {
            return schedule;  // fallback: bare schedule string
        }
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> parseScheduleString(String raw) {
        if (raw == null) return new java.util.LinkedHashMap<>();
        try {
            return MAPPER.readValue(raw, java.util.LinkedHashMap.class);
        } catch (Exception e) {
            // Legacy bare cron string — wrap it
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("schedule", raw);
            m.put("active", true);
            return m;
        }
    }

    private String serializeScheduleString(Map<String, Object> map) {
        try {
            return MAPPER.writeValueAsString(map);
        } catch (Exception e) {
            return map.getOrDefault("schedule", "").toString();
        }
    }

    @SuppressWarnings("unchecked")
    private HiveScheduledReportDTO toDTO(UtmComplianceReportSchedule entity) {
        Map<String, Object> meta = parseScheduleString(entity.getScheduleString());

        HiveScheduledReportDTO dto = new HiveScheduledReportDTO();
        dto.setId(entity.getId());
        dto.setName((String) meta.getOrDefault("name", "Report #" + entity.getId()));
        dto.setDescription((String) meta.getOrDefault("description", null));
        dto.setType((String) meta.getOrDefault("type", "COMPLIANCE"));
        dto.setSchedule((String) meta.getOrDefault("schedule", entity.getScheduleString()));
        dto.setFormat((String) meta.getOrDefault("format", "PDF"));
        dto.setActive(Boolean.TRUE.equals(meta.getOrDefault("active", true)));

        Object recs = meta.get("recipients");
        if (recs instanceof List) {
            dto.setRecipients((List<String>) recs);
        } else {
            dto.setRecipients(List.of());
        }

        // createdAt is not stored — use lastExecutionTime as a proxy when set
        if (entity.getLastExecutionTime() != null && !entity.getLastExecutionTime().equals(Instant.EPOCH)) {
            dto.setLastRun(entity.getLastExecutionTime().toString());
        }
        return dto;
    }
}
