package com.hivearmor.web.rest;

import com.hivearmor.domain.uba.UtmUbaEntityRisk;
import com.hivearmor.repository.uba.UtmUbaEntityRiskRepository;
import com.hivearmor.service.HiveEntityService;
import com.hivearmor.service.dto.HiveEntityAlertDTO;
import com.hivearmor.service.dto.HiveEntityDTO;
import com.hivearmor.service.dto.HiveEntityDetailDTO;
import com.hivearmor.service.dto.HiveEntityEventDTO;
import com.hivearmor.util.UtilPagination;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST controller — Entity List and Entity Profile pages (INV-05).
 * Legacy UBA-backed entity endpoints. New Entity Intelligence endpoints are in
 * {@link com.hivearmor.web.rest.entity.HaEntityResource}.
 *
 * GET  /api/ha-entities-legacy              — paged entity list, backed by hive_uba_entity_risk
 * GET  /api/ha-entities-legacy/{id}         — entity detail with enrichment
 * GET  /api/ha-entities-legacy/{id}/alerts  — recent alerts for this entity (OpenSearch)
 * GET  /api/ha-entities-legacy/{id}/events  — raw log events for this entity (OpenSearch)
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")
public class HaEntitiesResource {

    private static final Logger log = LoggerFactory.getLogger(HaEntitiesResource.class);

    private final HiveEntityService entityService;
    private final UtmUbaEntityRiskRepository entityRiskRepo;

    public HaEntitiesResource(HiveEntityService entityService,
                               UtmUbaEntityRiskRepository entityRiskRepo) {
        this.entityService = entityService;
        this.entityRiskRepo = entityRiskRepo;
    }

    /**
     * GET /api/ha-entities-legacy?type=host&page=0&size=50
     */
    @GetMapping("/ha-entities-legacy")
    public ResponseEntity<List<HiveEntityDTO>> listEntities(
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size) {
        log.debug("GET /api/ha-entities type={} page={} size={}", type, page, size);

        Page<UtmUbaEntityRisk> raw = entityService.listEntities(type, page, size);
        List<HiveEntityDTO> dtos = raw.stream()
            .map(entityService::toEntityDTO)
            .toList();

        HttpHeaders headers = UtilPagination.generatePaginationHttpHeaders(
            raw.getTotalElements(), page, size, "/api/ha-entities");

        return ResponseEntity.ok().headers(headers).body(dtos);
    }

    /**
     * GET /api/ha-entities-legacy/{id}
     */
    @GetMapping("/ha-entities-legacy/{id}")
    public ResponseEntity<HiveEntityDetailDTO> getEntity(@PathVariable("id") String id) {
        log.debug("GET /api/ha-entities/{}", id);
        return entityService.getEntityDetail(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * GET /api/ha-entities-legacy/{id}/alerts?type=host&size=50
     */
    @GetMapping("/ha-entities-legacy/{id}/alerts")
    public ResponseEntity<List<HiveEntityAlertDTO>> getEntityAlerts(
            @PathVariable("id") String id,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "50") int size) {
        log.debug("GET /api/ha-entities/{}/alerts type={}", id, type);
        List<HiveEntityAlertDTO> alerts = entityService.getEntityAlerts(id, type, size);
        return ResponseEntity.ok(alerts);
    }

    /**
     * GET /api/ha-entities-legacy/{id}/events?type=host&size=100
     */
    @GetMapping("/ha-entities-legacy/{id}/events")
    public ResponseEntity<List<HiveEntityEventDTO>> getEntityEvents(
            @PathVariable("id") String id,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "100") int size) {
        log.debug("GET /api/ha-entities/{}/events type={}", id, type);
        List<HiveEntityEventDTO> events = entityService.getEntityEvents(id, type, size);
        return ResponseEntity.ok(events);
    }

    /**
     * GET /api/ha-entities-legacy/{id}/risk
     * Returns risk detail for an entity — used by the posture service (IdentityRiskDetailDTO shape).
     * Fields: riskScore, riskDrivers (from factorsJson), riskTrend, topAlertCategories, lastCalculated
     */
    @GetMapping("/ha-entities-legacy/{id}/risk")
    public ResponseEntity<Map<String, Object>> getEntityRisk(@PathVariable("id") String id) {
        log.debug("GET /api/ha-entities/{}/risk", id);
        return entityRiskRepo.findFirstByEntityId(id).map(e -> {
            Map<String, Object> risk = new java.util.LinkedHashMap<>();
            risk.put("id", e.getEntityId());
            risk.put("riskScore", e.getRiskScore());
            risk.put("riskDrivers", List.of());   // factorsJson parsed if needed
            risk.put("riskTrend", deriveTrend(e.getRiskScore(), e.getPrevRiskScore()));
            risk.put("topAlertCategories", List.of());
            risk.put("lastCalculated", e.getUpdatedAt() != null ? e.getUpdatedAt().toString() : null);
            return ResponseEntity.ok(risk);
        }).orElse(ResponseEntity.notFound().build());
    }

    private static String deriveTrend(Integer current, Integer previous) {
        if (current == null || previous == null) return "stable";
        int diff = current - previous;
        if (diff > 2)  return "increasing";
        if (diff < -2) return "decreasing";
        return "stable";
    }
}
