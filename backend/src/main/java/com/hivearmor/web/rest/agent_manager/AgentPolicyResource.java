package com.hivearmor.web.rest.agent_manager;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.security.telemetry.TelemetryAgentIdentityFilter;
import com.hivearmor.service.agents_manager.UtmAgentPolicyService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.agent_manager.*;
import com.hivearmor.util.ResponseUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

/**
 * Agent-manager policy CRUD, push, and state reads.
 *
 * <p>Reads: Admin | SOC Manager | Analyst. Mutations: Admin | SOC Manager.
 * Agent device identity ({@code X-HiveArmor-Agent-Id} + {@code X-Agent-Key}) may
 * {@code GET /{id}} and {@code POST /report-state} (BE-POL-01 ACK).
 * STAGING CANDIDATE — not PRODUCTION READY.
 */
@RestController
@RequestMapping("/api/agent-policies")
public class AgentPolicyResource {

    private static final String CLASSNAME = "AgentPolicyResource";
    private static final String READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')";
    private static final String MUTATE_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER')";
    /** Operator JWT or enrolled agent device ({@code ROLE_AGENT_DEVICE}). */
    private static final String AGENT_FETCH_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_AGENT_DEVICE')";
    private static final String REPORT_STATE_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_AGENT_DEVICE')";

    private final Logger log = LoggerFactory.getLogger(AgentPolicyResource.class);
    private final UtmAgentPolicyService policyService;
    private final ApplicationEventService eventService;

    public AgentPolicyResource(UtmAgentPolicyService policyService, ApplicationEventService eventService) {
        this.policyService = policyService;
        this.eventService = eventService;
    }

    @GetMapping
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<List<AgentPolicyDTO>> listPolicies() {
        final String ctx = CLASSNAME + ".listPolicies";
        try {
            return ResponseEntity.ok(policyService.listAll());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/{id}")
    @PreAuthorize(AGENT_FETCH_AUTH)
    public ResponseEntity<AgentPolicyDTO> getPolicy(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getPolicy";
        try {
            return policyService.getById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<AgentPolicyDTO> createPolicy(@RequestBody AgentPolicyDTO dto) {
        final String ctx = CLASSNAME + ".createPolicy";
        try {
            String user = SecurityContextHolder.getContext().getAuthentication().getName();
            return ResponseEntity.status(HttpStatus.CREATED).body(policyService.create(dto, user));
        } catch (IllegalArgumentException e) {
            String msg = ctx + ": " + e.getMessage();
            log.warn(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<AgentPolicyDTO> updatePolicy(@PathVariable Long id, @RequestBody AgentPolicyDTO dto) {
        final String ctx = CLASSNAME + ".updatePolicy";
        try {
            return ResponseEntity.ok(policyService.update(id, dto));
        } catch (IllegalArgumentException e) {
            String msg = ctx + ": " + e.getMessage();
            log.warn(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> deletePolicy(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".deletePolicy";
        try {
            policyService.delete(id);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/{id}/assign-group/{groupId}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> assignGroup(@PathVariable Long id, @PathVariable Long groupId) {
        final String ctx = CLASSNAME + ".assignGroup";
        try {
            policyService.assignGroup(id, groupId);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/{id}/unassign-group/{groupId}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> unassignGroup(@PathVariable Long id, @PathVariable Long groupId) {
        final String ctx = CLASSNAME + ".unassignGroup";
        try {
            policyService.unassignGroup(id, groupId);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/{id}/push/{groupId}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> pushToGroup(@PathVariable Long id, @PathVariable Long groupId) {
        final String ctx = CLASSNAME + ".pushToGroup";
        try {
            policyService.pushPolicyToGroup(id, groupId);
            return ResponseEntity.accepted().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/{id}/push-log")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<List<PolicyPushLogDTO>> getPushLog(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getPushLog";
        try {
            return ResponseEntity.ok(policyService.getPushLog(id));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/{id}/states")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<List<AgentPolicyStateDTO>> getPolicyStates(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getPolicyStates";
        try {
            return ResponseEntity.ok(policyService.getPolicyStates(id));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /**
     * Agent ACK path. Prefer enrolled agent headers; Admin|SOC Manager JWT also allowed.
     * When device-authenticated, {@code agentId} is bound to the verified connector id
     * (body spoofing ignored). Never logs agent keys.
     */
    @PostMapping("/report-state")
    @PreAuthorize(REPORT_STATE_AUTH)
    public ResponseEntity<Void> reportState(@RequestBody Map<String, Object> body,
                                            HttpServletRequest request) {
        final String ctx = CLASSNAME + ".reportState";
        try {
            Object attr = request.getAttribute(TelemetryAgentIdentityFilter.ATTR_AGENT_CONNECTOR_ID);
            String agentId;
            if (attr instanceof Integer connectorId) {
                agentId = String.valueOf(connectorId);
            } else {
                agentId = body.get("agentId") != null ? body.get("agentId").toString() : null;
            }
            if (agentId == null || agentId.isBlank()) {
                return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, ctx + ": agentId required");
            }
            if (body.get("policyId") == null) {
                return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, ctx + ": policyId required");
            }
            Long policyId = Long.valueOf(body.get("policyId").toString());
            Integer appliedVersion = body.containsKey("appliedVersion") && body.get("appliedVersion") != null
                ? Integer.valueOf(body.get("appliedVersion").toString())
                : null;
            String state = body.get("state") != null ? body.get("state").toString() : null;
            String driftDetails = body.get("driftDetails") != null ? body.get("driftDetails").toString() : null;
            policyService.updatePolicyState(agentId, policyId, appliedVersion, state, driftDetails);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            String msg = ctx + ": " + e.getMessage();
            log.warn(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
