package com.hivearmor.web.rest.agent_manager;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.agent_manager.AgentGrpcService;
import com.hivearmor.service.dto.agent_manager.EnrollmentTokenCreateDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentTokenCreatedDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentTokenDTO;
import com.hivearmor.service.dto.agent_manager.AgentCredentialDTO;
import com.hivearmor.service.dto.agent_manager.AgentCredentialChangeDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentAuditEventDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentAuditExportDTO;
import com.hivearmor.service.dto.agent_manager.EnrollmentAuditPageDTO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class HaAgentEnrollmentResourceTest {

    private final AgentGrpcService grpc = mock(AgentGrpcService.class);
    private final HaAgentEnrollmentResource resource = new HaAgentEnrollmentResource(grpc);
    private final UserDetails caller = User.withUsername("soc-manager").password("unused").authorities("ROLE_SOC_MANAGER").build();

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void createUsesOnlyAuthorizedTenantContextAndReturnsLocation() {
        TenantContext.set(42L, "tenant-42");
        EnrollmentTokenCreateDTO request = new EnrollmentTokenCreateDTO("pilot-linux", "linux", Instant.now().plusSeconds(600), 1);
        EnrollmentTokenDTO token = new EnrollmentTokenDTO("token-id", 42L, "pilot-linux", "linux",
            request.expiresAt(), 1, 0, Instant.now(), "soc-manager", null, null, "", "", 1, "active");
        when(grpc.createEnrollmentToken(42L, request, "soc-manager"))
            .thenReturn(new EnrollmentTokenCreatedDTO(token, "one-time-secret"));

        ResponseEntity<EnrollmentTokenCreatedDTO> response = resource.create(
            request, caller, UriComponentsBuilder.fromPath(""));

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(response.getHeaders().getLocation()).hasToString("/api/ha-agent-enrollments/token-id");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().token()).isEqualTo("one-time-secret");
        verify(grpc).createEnrollmentToken(42L, request, "soc-manager");
    }

    @Test
    void createFailsClosedWithoutTenantSelection() {
        EnrollmentTokenCreateDTO request = new EnrollmentTokenCreateDTO("pilot-linux", "linux", Instant.now().plusSeconds(600), 1);

        assertThatThrownBy(() -> resource.create(request, caller, UriComponentsBuilder.fromPath("")))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("Select an authorized tenant");
    }

    @Test
    void missingTenantSelectionIsRenderedAsProblemDetailBadRequest() throws Exception {
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(resource)
            .setControllerAdvice(new HaAgentEnrollmentExceptionHandler())
            .build();

        mockMvc.perform(get("/api/ha-agent-enrollments"))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.title").value("Agent enrollment request rejected"))
            .andExpect(jsonPath("$.detail").value(
                "Select an authorized tenant before managing enrollment credentials"));
    }

    @Test
    void resourceRequiresAdministrativeAuthority() {
        PreAuthorize authorization = HaAgentEnrollmentResource.class.getAnnotation(PreAuthorize.class);

        assertThat(authorization).isNotNull();
        assertThat(authorization.value()).contains("ROLE_ADMIN", "ROLE_SOC_MANAGER");
    }

    @Test
    void oneTimeSecretsAreRedactedFromDiagnosticStrings() {
        EnrollmentTokenDTO token = new EnrollmentTokenDTO("token-id", 42L, "pilot-linux", "linux",
            Instant.now().plusSeconds(600), 1, 0, Instant.now(), "soc-manager", null, null, "", "", 1, "active");
        EnrollmentTokenCreatedDTO enrollment = new EnrollmentTokenCreatedDTO(token, "enrollment-secret-value");
        AgentCredentialDTO credential = new AgentCredentialDTO(7, "agent-uuid", 2, "agent-secret-value", null);

        assertThat(enrollment.toString()).contains("[REDACTED]").doesNotContain("enrollment-secret-value");
        assertThat(credential.toString()).contains("[REDACTED]").doesNotContain("agent-secret-value");
    }

    @Test
    void listAuditUsesTenantScopeAndReturnsExactTotal() {
        TenantContext.set(42L, "tenant-42");
        EnrollmentAuditEventDTO event = new EnrollmentAuditEventDTO(
            "audit-id", 42L, "enrollment.token.revoked", "soc-manager", "lost bootstrap material",
            "28b6bf27-963f-4b3c-b1bb-1abc519296f1", 0, "", "pilot-linux", "linux", 0, 2, Instant.now());
        when(grpc.listEnrollmentAuditEvents(42L, 0, 25, event.tokenId(), null, event.eventType()))
            .thenReturn(new EnrollmentAuditPageDTO(List.of(event), 1));

        ResponseEntity<List<EnrollmentAuditEventDTO>> response = resource.listAudit(
            0, 25, event.tokenId(), null, event.eventType());

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isEqualTo("1");
        assertThat(response.getBody()).containsExactly(event);
        verify(grpc).listEnrollmentAuditEvents(42L, 0, 25, event.tokenId(), null, event.eventType());
    }

    @Test
    void exportAuditReturnsNdjsonWithoutSecretFieldNames() {
        TenantContext.set(42L, "tenant-42");
        EnrollmentAuditEventDTO event = new EnrollmentAuditEventDTO(
            "audit-id", 42L, "enrollment.token.revoked", "soc-manager", "lost bootstrap material",
            "28b6bf27-963f-4b3c-b1bb-1abc519296f1", 0, "", "pilot-linux", "linux", 0, 2, Instant.now());
        when(grpc.exportEnrollmentAuditEvents(42L, null, null, null))
            .thenReturn(new EnrollmentAuditExportDTO(List.of(event), 1, false));

        ResponseEntity<byte[]> response = resource.exportAudit(null, null, null, caller);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isEqualTo("1");
        assertThat(response.getHeaders().getFirst("X-Export-Row-Count")).isEqualTo("1");
        assertThat(response.getHeaders().getFirst("X-Export-Truncated")).isEqualTo("false");
        assertThat(response.getHeaders().getFirst("X-Audit-Source-Policy")).isEqualTo("append-only");
        String body = new String(response.getBody());
        assertThat(body).contains("enrollment.token.revoked");
        assertThat(body).doesNotContain("tokenHash");
        assertThat(body).doesNotContain("credentialHash");
        assertThat(body).doesNotContain("ipAddress");
        assertThat(body).doesNotContain("hostname");
        verify(grpc).exportEnrollmentAuditEvents(42L, null, null, null);
    }

    @Test
    void credentialRevocationForwardsAuthenticatedActorAndReason() {
        TenantContext.set(42L, "tenant-42");
        AgentCredentialChangeDTO request = new AgentCredentialChangeDTO("device reported lost");
        AgentCredentialDTO result = new AgentCredentialDTO(7, "agent-uuid", 3, "", Instant.now());
        when(grpc.revokeAgentCredential(42L, 7, "soc-manager", request.reason())).thenReturn(result);

        ResponseEntity<AgentCredentialDTO> response = resource.revokeCredential(7, request, caller);

        assertThat(response.getBody()).isEqualTo(result);
        verify(grpc).revokeAgentCredential(42L, 7, "soc-manager", request.reason());
    }
}
