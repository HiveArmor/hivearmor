package com.hivearmor.web.rest.edr;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.edr.*;
import com.hivearmor.service.edr.EdrService;
import com.hivearmor.util.ResponseUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/edr")
public class EdrResource {

    private static final String CLASSNAME = "EdrResource";
    private final Logger log = LoggerFactory.getLogger(EdrResource.class);
    private final EdrService edrService;
    private final ApplicationEventService eventService;

    public EdrResource(EdrService edrService, ApplicationEventService eventService) {
        this.edrService = edrService;
        this.eventService = eventService;
    }

    // ---- Rules ----

    @GetMapping("/rules")
    public ResponseEntity<List<EdrRuleDTO>> listRules() {
        final String ctx = CLASSNAME + ".listRules";
        try {
            return ResponseEntity.ok(edrService.listRules());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/rules/{id}")
    public ResponseEntity<EdrRuleDTO> getRule(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getRule";
        try {
            return edrService.getRule(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/rules")
    public ResponseEntity<EdrRuleDTO> createRule(@RequestBody EdrRuleDTO dto) {
        final String ctx = CLASSNAME + ".createRule";
        try {
            String user = currentUser();
            return ResponseEntity.status(HttpStatus.CREATED).body(edrService.createRule(dto, user));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/rules/{id}")
    public ResponseEntity<EdrRuleDTO> updateRule(@PathVariable Long id, @RequestBody EdrRuleDTO dto) {
        final String ctx = CLASSNAME + ".updateRule";
        try {
            return ResponseEntity.ok(edrService.updateRule(id, dto));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/rules/{id}")
    public ResponseEntity<Void> deleteRule(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".deleteRule";
        try {
            edrService.deleteRule(id);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ---- Events ----

    @GetMapping("/events")
    public ResponseEntity<List<EdrEventDTO>> queryEvents(
            @RequestParam(required = false) String agentId,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        final String ctx = CLASSNAME + ".queryEvents";
        try {
            Instant fromInstant = from != null ? Instant.parse(from) : null;
            Instant toInstant = to != null ? Instant.parse(to) : null;
            Page<EdrEventDTO> result = edrService.queryEvents(agentId, eventType, severity, fromInstant, toInstant, page, size);
            HttpHeaders headers = new HttpHeaders();
            headers.add("X-Total-Count", String.valueOf(result.getTotalElements()));
            return ResponseEntity.ok().headers(headers).body(result.getContent());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/events/ingest")
    public ResponseEntity<EdrEventDTO> ingestEvent(@RequestBody EdrEventDTO dto) {
        final String ctx = CLASSNAME + ".ingestEvent";
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(edrService.ingestEvent(dto));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ---- Quarantine ----

    @GetMapping("/quarantine")
    public ResponseEntity<List<EdrQuarantineDTO>> listQuarantine(
            @RequestParam(required = false) String agentId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        final String ctx = CLASSNAME + ".listQuarantine";
        try {
            Page<EdrQuarantineDTO> result = edrService.listQuarantine(agentId, status, page, size);
            HttpHeaders headers = new HttpHeaders();
            headers.add("X-Total-Count", String.valueOf(result.getTotalElements()));
            return ResponseEntity.ok().headers(headers).body(result.getContent());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/quarantine")
    public ResponseEntity<EdrQuarantineDTO> quarantineFile(@RequestBody EdrQuarantineDTO dto) {
        final String ctx = CLASSNAME + ".quarantineFile";
        try {
            String user = currentUser();
            return ResponseEntity.status(HttpStatus.CREATED).body(edrService.quarantineFile(dto, user));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/quarantine/{id}/restore")
    public ResponseEntity<EdrQuarantineDTO> restoreFile(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".restoreFile";
        try {
            String user = currentUser();
            return ResponseEntity.ok(edrService.restoreFile(id, user));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ---- Isolation ----

    @GetMapping("/isolation")
    public ResponseEntity<List<EdrIsolationDTO>> listIsolations(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        final String ctx = CLASSNAME + ".listIsolations";
        try {
            Page<EdrIsolationDTO> result = edrService.listIsolations(status, page, size);
            HttpHeaders headers = new HttpHeaders();
            headers.add("X-Total-Count", String.valueOf(result.getTotalElements()));
            return ResponseEntity.ok().headers(headers).body(result.getContent());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/isolation")
    public ResponseEntity<EdrIsolationDTO> isolateAgent(@RequestBody EdrIsolationDTO dto) {
        final String ctx = CLASSNAME + ".isolateAgent";
        try {
            String user = currentUser();
            return ResponseEntity.status(HttpStatus.CREATED).body(edrService.isolateAgent(dto, user));
        } catch (IllegalStateException e) {
            return ResponseUtil.buildErrorResponse(HttpStatus.CONFLICT, e.getMessage());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/isolation/{id}/lift")
    public ResponseEntity<EdrIsolationDTO> liftIsolation(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".liftIsolation";
        try {
            String user = currentUser();
            return ResponseEntity.ok(edrService.liftIsolation(id, user));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ---- Response actions ----

    @PostMapping("/actions/kill-process")
    public ResponseEntity<Map<String, String>> killProcess(@RequestBody Map<String, Object> body) {
        final String ctx = CLASSNAME + ".killProcess";
        try {
            String agentId = (String) body.get("agentId");
            Integer pid = (Integer) body.get("pid");
            String processName = (String) body.getOrDefault("processName", "");
            String user = currentUser();
            String result = edrService.killProcess(agentId, pid, processName, user);
            return ResponseEntity.ok(Map.of("result", result));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    private String currentUser() {
        try {
            return SecurityContextHolder.getContext().getAuthentication().getName();
        } catch (Exception e) {
            return "system";
        }
    }
}
