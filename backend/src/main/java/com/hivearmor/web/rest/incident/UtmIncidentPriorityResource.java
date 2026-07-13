package com.hivearmor.web.rest.incident;

import com.hivearmor.domain.incident.UtmIncident;
import com.hivearmor.repository.incident.UtmIncidentRepository;
import com.hivearmor.service.incident.UtmIncidentSlaService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/ha-incidents")
@RequiredArgsConstructor
@Slf4j
public class UtmIncidentPriorityResource {

    private final UtmIncidentRepository incidentRepository;
    private final UtmIncidentSlaService slaService;

    /** PUT /api/ha-incidents/{id}/priority  body: { "priority": "P1" } */
    @PutMapping("/{id}/priority")
    public ResponseEntity<UtmIncident> setPriority(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        UtmIncident incident = incidentRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Incident not found: " + id));
        String priority = body.getOrDefault("priority", "P3");
        UtmIncident saved = slaService.applyPriority(incident, priority);
        return ResponseEntity.ok(saved);
    }

    /** GET /api/ha-incidents/sla-breached — list breached open incidents */
    @GetMapping("/sla-breached")
    public ResponseEntity<List<UtmIncident>> slaBreached() {
        List<UtmIncident> breached = incidentRepository
            .findBySlaBreachedFalseAndSlaDeadlineBefore(java.time.Instant.now());
        return ResponseEntity.ok(breached);
    }

    /** GET /api/ha-incidents/sla-stats — summary counts */
    @GetMapping("/sla-stats")
    public ResponseEntity<Map<String, Object>> slaStats() {
        long breachedCount = incidentRepository.countBySlaBreachedTrue();
        long total = incidentRepository.count();
        return ResponseEntity.ok(Map.of(
            "total", total,
            "breached", breachedCount,
            "compliant", total - breachedCount
        ));
    }
}
