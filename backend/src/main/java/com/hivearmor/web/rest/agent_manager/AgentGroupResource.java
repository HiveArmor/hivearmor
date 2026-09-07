package com.hivearmor.web.rest.agent_manager;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.agents_manager.UtmAgentGroupService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.agent_manager.AgentGroupDTO;
import com.hivearmor.util.ResponseUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Agent groups CRUD and membership.
 *
 * <p>List/get: Admin | SOC Manager (FE-POL-01 residual — SOC Manager can pick groups for policy assign).
 * Mutations: Admin only. STAGING CANDIDATE — not PRODUCTION READY.
 */
@RestController
@RequestMapping("/api/agent-groups")
public class AgentGroupResource {

    private static final String CLASSNAME = "AgentGroupResource";
    private static final String READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER')";
    private static final String MUTATE_AUTH =
        "hasAuthority('ROLE_ADMIN')";

    private final Logger log = LoggerFactory.getLogger(AgentGroupResource.class);
    private final UtmAgentGroupService groupService;
    private final ApplicationEventService eventService;

    public AgentGroupResource(UtmAgentGroupService groupService, ApplicationEventService eventService) {
        this.groupService = groupService;
        this.eventService = eventService;
    }

    @GetMapping
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<List<AgentGroupDTO>> listGroups() {
        final String ctx = CLASSNAME + ".listGroups";
        try {
            return ResponseEntity.ok(groupService.listAll());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/{id}")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<AgentGroupDTO> getGroup(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getGroup";
        try {
            return groupService.getById(id)
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
    public ResponseEntity<AgentGroupDTO> createGroup(@RequestBody AgentGroupDTO dto) {
        final String ctx = CLASSNAME + ".createGroup";
        try {
            String user = SecurityContextHolder.getContext().getAuthentication().getName();
            return ResponseEntity.status(HttpStatus.CREATED).body(groupService.create(dto, user));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<AgentGroupDTO> updateGroup(@PathVariable Long id, @RequestBody AgentGroupDTO dto) {
        final String ctx = CLASSNAME + ".updateGroup";
        try {
            return ResponseEntity.ok(groupService.update(id, dto));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> deleteGroup(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".deleteGroup";
        try {
            groupService.delete(id);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/{id}/members/{agentId}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> addMember(@PathVariable Long id, @PathVariable Integer agentId) {
        final String ctx = CLASSNAME + ".addMember";
        try {
            groupService.addMember(id, agentId);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/{id}/members/{agentId}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> removeMember(@PathVariable Long id, @PathVariable Integer agentId) {
        final String ctx = CLASSNAME + ".removeMember";
        try {
            groupService.removeMember(id, agentId);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/{id}/members")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> setMembers(@PathVariable Long id, @RequestBody List<Integer> agentIds) {
        final String ctx = CLASSNAME + ".setMembers";
        try {
            List<Integer> current = groupService.getMembers(id);
            for (Integer existing : current) {
                if (!agentIds.contains(existing)) groupService.removeMember(id, existing);
            }
            for (Integer desired : agentIds) {
                groupService.addMember(id, desired);
            }
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
