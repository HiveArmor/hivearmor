package com.hivearmor.web.rest.agent_manager;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.agent_manager.AgentGrpcService;
import com.hivearmor.service.dto.agent_manager.AgentCredentialChangeDTO;
import com.hivearmor.service.dto.agent_manager.AgentCredentialDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentAuditEventDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentAuditExportDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentAuditPageDTO;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.hivearmor.service.dto.agent_manager.EnrollmentTokenCreateDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentTokenCreatedDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentTokenDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentTokenRevokeDTO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/ha-agent-enrollments")
@PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.SOC_MANAGER + "')")
@Validated
public class HaAgentEnrollmentResource {

    private static final ObjectMapper AUDIT_NDJSON = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private final AgentGrpcService agentGrpcService;

    public HaAgentEnrollmentResource(AgentGrpcService agentGrpcService) {
        this.agentGrpcService = agentGrpcService;
    }

    @PostMapping
    public ResponseEntity<EnrollmentTokenCreatedDTO> create(
        @Valid @RequestBody EnrollmentTokenCreateDTO request,
        @AuthenticationPrincipal UserDetails caller,
        UriComponentsBuilder uriBuilder
    ) {
        long tenantId = requireTenant();
        EnrollmentTokenCreatedDTO created = agentGrpcService.createEnrollmentToken(tenantId, request, caller.getUsername());
        URI location = uriBuilder.path("/api/ha-agent-enrollments/{id}").build(created.enrollment().id());
        return ResponseEntity.created(location).body(created);
    }

    @GetMapping
    public ResponseEntity<List<EnrollmentTokenDTO>> list(
        @RequestParam(defaultValue = "0") @Min(0) int page,
        @RequestParam(defaultValue = "25") @Min(1) @Max(100) int size
    ) {
        long tenantId = requireTenant();
        List<EnrollmentTokenDTO> rows = agentGrpcService.listEnrollmentTokens(tenantId, page, size);
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Total-Count", Integer.toString(agentGrpcService.countEnrollmentTokens(tenantId)));
        return ResponseEntity.ok().headers(headers).body(rows);
    }

    @PostMapping("/{id}/revoke")
    public ResponseEntity<EnrollmentTokenDTO> revoke(
        @PathVariable String id,
        @Valid @RequestBody EnrollmentTokenRevokeDTO request,
        @AuthenticationPrincipal UserDetails caller
    ) {
        return ResponseEntity.ok(agentGrpcService.revokeEnrollmentToken(requireTenant(), id, request, caller.getUsername()));
    }

    @PostMapping("/agents/{agentId}/credential/rotate")
    public ResponseEntity<AgentCredentialDTO> rotateCredential(
        @PathVariable long agentId,
        @Valid @RequestBody AgentCredentialChangeDTO request,
        @AuthenticationPrincipal UserDetails caller
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(agentGrpcService.rotateAgentCredential(requireTenant(), agentId, caller.getUsername(), request.reason()));
    }

    @PostMapping("/agents/{agentId}/credential/revoke")
    public ResponseEntity<AgentCredentialDTO> revokeCredential(
        @PathVariable long agentId,
        @Valid @RequestBody AgentCredentialChangeDTO request,
        @AuthenticationPrincipal UserDetails caller
    ) {
        return ResponseEntity.ok(agentGrpcService.revokeAgentCredential(requireTenant(), agentId, caller.getUsername(), request.reason()));
    }

    @GetMapping("/audit")
    public ResponseEntity<List<EnrollmentAuditEventDTO>> listAudit(
        @RequestParam(defaultValue = "0") @Min(0) int page,
        @RequestParam(defaultValue = "25") @Min(1) @Max(100) int size,
        @RequestParam(required = false) @Size(max = 36) String tokenId,
        @RequestParam(required = false) @Size(max = 36) String agentUuid,
        @RequestParam(required = false) @Size(max = 64) String eventType
    ) {
        EnrollmentAuditPageDTO result = agentGrpcService.listEnrollmentAuditEvents(
            requireTenant(), page, size, tokenId, agentUuid, eventType);
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Total-Count", Long.toString(result.total()));
        return ResponseEntity.ok().headers(headers).body(result.rows());
    }

    /**
     * Safe NDJSON export of the same projection as GET /audit. Source rows stay append-only.
     */
    @GetMapping("/audit/export")
    public ResponseEntity<byte[]> exportAudit(
        @RequestParam(required = false) @Size(max = 36) String tokenId,
        @RequestParam(required = false) @Size(max = 36) String agentUuid,
        @RequestParam(required = false) @Size(max = 64) String eventType,
        @AuthenticationPrincipal UserDetails caller
    ) {
        long tenantId = requireTenant();
        EnrollmentAuditExportDTO exported = agentGrpcService.exportEnrollmentAuditEvents(
            tenantId, tokenId, agentUuid, eventType);
        StringBuilder body = new StringBuilder();
        try {
            for (EnrollmentAuditEventDTO row : exported.rows()) {
                body.append(AUDIT_NDJSON.writeValueAsString(row)).append('\n');
            }
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "could not serialize audit export");
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("application/x-ndjson"));
        headers.set(HttpHeaders.CONTENT_DISPOSITION,
            "attachment; filename=\"enrollment-audit-" + tenantId + "-" + Instant.now().getEpochSecond() + ".ndjson\"");
        headers.add("X-Total-Count", Long.toString(exported.total()));
        headers.add("X-Export-Row-Count", Integer.toString(exported.rows().size()));
        headers.add("X-Export-Truncated", Boolean.toString(exported.truncated()));
        headers.add("X-Audit-Source-Policy", "append-only");
        if (caller != null) {
            headers.add("X-Export-Actor", caller.getUsername());
        }
        return ResponseEntity.ok().headers(headers).body(body.toString().getBytes(StandardCharsets.UTF_8));
    }

    private long requireTenant() {
        Long tenantId = TenantContext.getClientId();
        if (tenantId == null || tenantId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Select an authorized tenant before managing enrollment credentials");
        }
        return tenantId;
    }
}
