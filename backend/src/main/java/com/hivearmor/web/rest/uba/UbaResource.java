package com.hivearmor.web.rest.uba;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.uba.UbaService;
import com.hivearmor.util.ResponseUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST controller for User/Entity Behavior Analytics.
 *
 * GET  /api/uba/summary          → KPI stats (counts by risk level, anomalies)
 * GET  /api/uba/entities         → paginated entity risk leaderboard
 * GET  /api/uba/anomalies        → paginated recent anomaly feed
 * GET  /api/uba/entities/{id}/anomalies → anomalies for a specific entity
 * PUT  /api/uba/entities/{id}/watchlist → toggle watchlist
 * PUT  /api/uba/anomalies/{id}/status  → update anomaly status
 */
@RestController
@RequestMapping("/api/uba")
public class UbaResource {

    private static final String CLASSNAME = "UbaResource";
    private final Logger log = LoggerFactory.getLogger(UbaResource.class);

    private final UbaService ubaService;
    private final ApplicationEventService eventService;

    public UbaResource(UbaService ubaService, ApplicationEventService eventService) {
        this.ubaService = ubaService;
        this.eventService = eventService;
    }

    @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> getSummary() {
        final String ctx = CLASSNAME + ".getSummary";
        try {
            return ResponseEntity.ok(ubaService.getSummary());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/entities")
    public ResponseEntity<Map<String, Object>> listEntities(
        @RequestParam(required = false) String entityType,
        @RequestParam(required = false) String riskLevel,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        final String ctx = CLASSNAME + ".listEntities";
        try {
            return ResponseEntity.ok(ubaService.listEntities(entityType, riskLevel, page, size));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/anomalies")
    public ResponseEntity<List<Map<String, Object>>> listAnomalies(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size
    ) {
        final String ctx = CLASSNAME + ".listAnomalies";
        try {
            return ResponseEntity.ok(ubaService.listAnomalies(page, size));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/entities/{entityId}/anomalies")
    public ResponseEntity<List<Map<String, Object>>> getEntityAnomalies(
        @PathVariable String entityId,
        @RequestParam(defaultValue = "user") String entityType
    ) {
        final String ctx = CLASSNAME + ".getEntityAnomalies";
        try {
            return ResponseEntity.ok(ubaService.getEntityAnomalies(entityId, entityType));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/entities/{id}/watchlist")
    public ResponseEntity<Map<String, Object>> setWatchlist(
        @PathVariable Long id,
        @RequestBody Map<String, Object> body
    ) {
        final String ctx = CLASSNAME + ".setWatchlist";
        try {
            boolean watchlisted = Boolean.TRUE.equals(body.get("watchlisted"));
            return ResponseEntity.ok(ubaService.setWatchlist(id, watchlisted));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/anomalies/{id}/status")
    public ResponseEntity<Map<String, Object>> updateAnomalyStatus(
        @PathVariable Long id,
        @RequestBody Map<String, Object> body
    ) {
        final String ctx = CLASSNAME + ".updateAnomalyStatus";
        try {
            String status = (String) body.getOrDefault("status", "open");
            return ResponseEntity.ok(ubaService.updateAnomalyStatus(id, status));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
