package com.hivearmor.web.rest.threat_intel;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.threat_intel.IocResultDTO;
import com.hivearmor.service.dto.threat_intel.ThreatFeedDTO;
import com.hivearmor.service.threat_intel.ThreatIntelService;
import com.hivearmor.util.ResponseUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/threat-intel")
public class ThreatIntelResource {

    private static final String CLASSNAME = "ThreatIntelResource";
    private final Logger log = LoggerFactory.getLogger(ThreatIntelResource.class);
    private final ThreatIntelService threatIntelService;
    private final ApplicationEventService eventService;

    public ThreatIntelResource(ThreatIntelService threatIntelService, ApplicationEventService eventService) {
        this.threatIntelService = threatIntelService;
        this.eventService = eventService;
    }

    /**
     * GET /api/v1/threat-intel/ioc?value={value}
     * Look up an IOC value against stored threat feeds.
     */
    @GetMapping("/ioc")
    public ResponseEntity<IocResultDTO> lookupIoc(@RequestParam("value") String value) {
        final String ctx = CLASSNAME + ".lookupIoc";
        try {
            Optional<IocResultDTO> result = threatIntelService.lookupIoc(value);
            return result
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /**
     * GET /api/v1/threat-intel/feeds
     * List all configured threat feeds.
     */
    @GetMapping("/feeds")
    public ResponseEntity<List<ThreatFeedDTO>> listFeeds() {
        final String ctx = CLASSNAME + ".listFeeds";
        try {
            return ResponseEntity.ok(threatIntelService.listFeeds());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /**
     * PUT /api/v1/threat-intel/feeds/{id}
     * Enable or disable a threat feed.
     * Body: { "enabled": true|false }
     */
    @PutMapping("/feeds/{id}")
    public ResponseEntity<ThreatFeedDTO> updateFeed(
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {
        final String ctx = CLASSNAME + ".updateFeed";
        try {
            boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
            ThreatFeedDTO updated = threatIntelService.toggleFeed(id, enabled);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /**
     * POST /api/v1/threat-intel/feeds/{id}/sync
     * Trigger a sync for a specific threat feed.
     */
    @PostMapping("/feeds/{id}/sync")
    public ResponseEntity<ThreatFeedDTO> syncFeed(@PathVariable String id) {
        final String ctx = CLASSNAME + ".syncFeed";
        try {
            ThreatFeedDTO updated = threatIntelService.syncFeed(id);
            return ResponseEntity.ok(updated);
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
