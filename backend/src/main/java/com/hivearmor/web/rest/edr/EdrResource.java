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
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/edr")
public class EdrResource {

    private static final String CLASSNAME = "EdrResource";
    /** Inventory / event reads — match HaEdrResource breadth. */
    private static final String READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN', 'ROLE_SOC_MANAGER', 'ROLE_ANALYST', 'ROLE_USER')";
    /**
     * Containment and rule mutations — Admin / SOC Manager.
     * (HaEdr quarantine mutates also allow ROLE_ANALYST; legacy /api/edr stay stricter.)
     */
    private static final String MUTATE_AUTH =
        "hasAnyAuthority('ROLE_ADMIN', 'ROLE_SOC_MANAGER')";
    private final Logger log = LoggerFactory.getLogger(EdrResource.class);
    private final EdrService edrService;
    private final ApplicationEventService eventService;

    public EdrResource(EdrService edrService, ApplicationEventService eventService) {
        this.edrService = edrService;
        this.eventService = eventService;
    }

    // ---- Rules ----

    @GetMapping("/rules")
    @PreAuthorize(READ_AUTH)
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
    @PreAuthorize(READ_AUTH)
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
    @PreAuthorize(MUTATE_AUTH)
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
    @PreAuthorize(MUTATE_AUTH)
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
    @PreAuthorize(MUTATE_AUTH)
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
    @PreAuthorize(READ_AUTH)
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

    @Deprecated(since = "2026-08-11", forRemoval = true)
    @GetMapping("/quarantine")
    @PreAuthorize(READ_AUTH)
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

    @Deprecated(since = "2026-08-11", forRemoval = true)
    @PostMapping("/quarantine")
    @PreAuthorize(MUTATE_AUTH)
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

    @Deprecated(since = "2026-08-11", forRemoval = true)
    @PostMapping("/quarantine/{id}/restore")
    @PreAuthorize(MUTATE_AUTH)
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

    @Deprecated(since = "2026-08-11", forRemoval = true)
    @GetMapping("/isolation")
    @PreAuthorize(READ_AUTH)
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

    /**
     * SensorGrid isolate path: JWT + MUTATE_AUTH → EdrService → ProcessCommand(EDR_ISOLATE).
     * INTERNAL_KEY is applied only on the server-side gRPC client interceptor.
     */
    @Deprecated(since = "2026-08-11", forRemoval = true)
    @PostMapping("/isolation")
    @PreAuthorize(MUTATE_AUTH)
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

    @Deprecated(since = "2026-08-11", forRemoval = true)
    @PostMapping("/isolation/{id}/lift")
    @PreAuthorize(MUTATE_AUTH)
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
    // SensorGrid (frontend-v3) uses these JWT + @PreAuthorize mutates; the backend
    // then dispatches PanelService.ProcessCommand over gRPC with INTERNAL_KEY
    // (service identity only — never exposed to the browser). ROLE_* is enforced here.

    @PostMapping("/actions/kill-process")
    @PreAuthorize(MUTATE_AUTH)
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
