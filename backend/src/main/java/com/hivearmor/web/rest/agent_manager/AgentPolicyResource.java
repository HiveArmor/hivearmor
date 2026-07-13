package com.hivearmor.web.rest.agent_manager;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.agents_manager.UtmAgentPolicyService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.agent_manager.*;
import com.hivearmor.util.ResponseUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/agent-policies")
public class AgentPolicyResource {

    private static final String CLASSNAME = "AgentPolicyResource";
    private final Logger log = LoggerFactory.getLogger(AgentPolicyResource.class);
    private final UtmAgentPolicyService policyService;
    private final ApplicationEventService eventService;

    public AgentPolicyResource(UtmAgentPolicyService policyService, ApplicationEventService eventService) {
        this.policyService = policyService;
        this.eventService = eventService;
    }

    @GetMapping
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
    public ResponseEntity<AgentPolicyDTO> createPolicy(@RequestBody AgentPolicyDTO dto) {
        final String ctx = CLASSNAME + ".createPolicy";
        try {
            String user = SecurityContextHolder.getContext().getAuthentication().getName();
            return ResponseEntity.status(HttpStatus.CREATED).body(policyService.create(dto, user));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<AgentPolicyDTO> updatePolicy(@PathVariable Long id, @RequestBody AgentPolicyDTO dto) {
        final String ctx = CLASSNAME + ".updatePolicy";
        try {
            return ResponseEntity.ok(policyService.update(id, dto));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/{id}")
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

    @PostMapping("/report-state")
    public ResponseEntity<Void> reportState(@RequestBody Map<String, Object> body) {
        final String ctx = CLASSNAME + ".reportState";
        try {
            String agentId = (String) body.get("agentId");
            Long policyId = Long.valueOf(body.get("policyId").toString());
            Integer appliedVersion = body.containsKey("appliedVersion") ? Integer.valueOf(body.get("appliedVersion").toString()) : null;
            String state = (String) body.get("state");
            String driftDetails = (String) body.get("driftDetails");
            policyService.updatePolicyState(agentId, policyId, appliedVersion, state, driftDetails);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
