package com.hivearmor.web.rest.agent_manager;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.agents_manager.HostTemplateAssociationService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.agent_manager.ApplyResultDTO;
import com.hivearmor.service.dto.agent_manager.EffectivePolicyDTO;
import com.hivearmor.service.dto.agent_manager.HostTemplateAssociationDTO;
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
 * PT-3 — host→template association tables: ranked binding CRUD, the effective-policy resolver
 * preview, and the explicit Apply (re-resolve + re-push {@code APPLY_POLICY}).
 *
 * <p>Reads: Admin | SOC Manager | Analyst. Mutations + Apply: Admin | SOC Manager. Draft edits do
 * NOT ship — a push happens ONLY on {@code POST /{id}/apply}. Cross-tenant binding + push is
 * security-critical: all resolution + delivery is tenant-scoped and RLS fail-closed.
 *
 * <p>STAGING CANDIDATE — not PRODUCTION READY.
 */
@RestController
@RequestMapping("/api/host-template-associations")
public class HostTemplateAssociationResource {

    private static final String CLASSNAME = "HostTemplateAssociationResource";
    private static final String READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')";
    private static final String MUTATE_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER')";

    private final Logger log = LoggerFactory.getLogger(HostTemplateAssociationResource.class);
    private final HostTemplateAssociationService service;
    private final ApplicationEventService eventService;

    public HostTemplateAssociationResource(HostTemplateAssociationService service,
                                           ApplicationEventService eventService) {
        this.service = service;
        this.eventService = eventService;
    }

    @GetMapping
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<List<HostTemplateAssociationDTO>> list() {
        final String ctx = CLASSNAME + ".list";
        try {
            return ResponseEntity.ok(service.listVisible());
        } catch (Exception e) {
            return error(ctx, e);
        }
    }

    @GetMapping("/{id}")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<HostTemplateAssociationDTO> get(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".get";
        try {
            return service.getById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            return error(ctx, e);
        }
    }

    @PostMapping
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<HostTemplateAssociationDTO> create(@RequestBody HostTemplateAssociationDTO dto) {
        final String ctx = CLASSNAME + ".create";
        try {
            String user = SecurityContextHolder.getContext().getAuthentication().getName();
            return ResponseEntity.status(HttpStatus.CREATED).body(service.create(dto, user));
        } catch (IllegalArgumentException e) {
            log.warn(ctx + ": " + e.getMessage());
            return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, ctx + ": " + e.getMessage());
        } catch (org.springframework.security.access.AccessDeniedException e) {
            log.warn(ctx + ": " + e.getMessage());
            return ResponseUtil.buildErrorResponse(HttpStatus.FORBIDDEN, ctx + ": " + e.getMessage());
        } catch (Exception e) {
            return error(ctx, e);
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<HostTemplateAssociationDTO> update(@PathVariable Long id,
                                                             @RequestBody HostTemplateAssociationDTO dto) {
        final String ctx = CLASSNAME + ".update";
        try {
            return ResponseEntity.ok(service.update(id, dto));
        } catch (IllegalArgumentException e) {
            log.warn(ctx + ": " + e.getMessage());
            return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, ctx + ": " + e.getMessage());
        } catch (jakarta.persistence.EntityNotFoundException e) {
            return ResponseEntity.notFound().build();
        } catch (org.springframework.security.access.AccessDeniedException e) {
            log.warn(ctx + ": " + e.getMessage());
            return ResponseUtil.buildErrorResponse(HttpStatus.FORBIDDEN, ctx + ": " + e.getMessage());
        } catch (Exception e) {
            return error(ctx, e);
        }
    }

    @DeleteMapping("/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".delete";
        try {
            service.delete(id);
            return ResponseEntity.noContent().build();
        } catch (jakarta.persistence.EntityNotFoundException e) {
            return ResponseEntity.notFound().build();
        } catch (org.springframework.security.access.AccessDeniedException e) {
            log.warn(ctx + ": " + e.getMessage());
            return ResponseUtil.buildErrorResponse(HttpStatus.FORBIDDEN, ctx + ": " + e.getMessage());
        } catch (Exception e) {
            return error(ctx, e);
        }
    }

    /**
     * Per-host effective-policy PREVIEW: which row wins for {@code host} and the resolved (merged)
     * sections. Read-only — does NOT push. {@code host} is the agent connector id.
     */
    @GetMapping("/resolve/{host}")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<EffectivePolicyDTO> resolve(@PathVariable String host) {
        final String ctx = CLASSNAME + ".resolve";
        try {
            return ResponseEntity.ok(service.effectiveForHost(host));
        } catch (Exception e) {
            return error(ctx, e);
        }
    }

    /**
     * Explicit APPLY: re-resolve every host affected by this table and re-push {@code APPLY_POLICY}.
     * This is the ONLY path that ships a change; draft edits before Apply never reach an agent.
     * Returns the per-host delivery/drift result. 202 Accepted (pushes are dispatched async).
     */
    @PostMapping("/{id}/apply")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<ApplyResultDTO> apply(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".apply";
        try {
            return ResponseEntity.accepted().body(service.apply(id));
        } catch (jakarta.persistence.EntityNotFoundException e) {
            return ResponseEntity.notFound().build();
        } catch (org.springframework.security.access.AccessDeniedException e) {
            log.warn(ctx + ": " + e.getMessage());
            return ResponseUtil.buildErrorResponse(HttpStatus.FORBIDDEN, ctx + ": " + e.getMessage());
        } catch (IllegalArgumentException e) {
            log.warn(ctx + ": " + e.getMessage());
            return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, ctx + ": " + e.getMessage());
        } catch (Exception e) {
            return error(ctx, e);
        }
    }

    private <T> ResponseEntity<T> error(String ctx, Exception e) {
        String msg = ctx + ": " + e.getMessage();
        log.error(msg);
        eventService.createEvent(msg, ApplicationEventType.ERROR);
        return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
    }
}
