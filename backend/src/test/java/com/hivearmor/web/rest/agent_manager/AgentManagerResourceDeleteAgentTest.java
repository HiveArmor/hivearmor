package com.hivearmor.web.rest.agent_manager;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.agent_manager.AgentGrpcService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.incident_response.UtmIncidentVariableService;
import com.hivearmor.web.rest.errors.AgentNotfoundException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Behavioral tests for {@link AgentManagerResource#deleteAgent(String)} (SPEC-07 W6 6.2).
 *
 * Tenant scoping itself lives in {@link AgentGrpcService#deleteAgent(String)} (already covered);
 * these tests fix the RESOURCE-layer contract: correct HTTP mapping (204 / 400 / 403 / 404 / 500)
 * and that the attempt AND success are both audited, without leaking cross-tenant existence.
 *
 * The "no tenant" case is gated UP FRONT via {@link TenantContext} — the service resolves the host
 * before its own tenant guard, so a missing tenant would otherwise wrap into a misleading 500. Each
 * test therefore sets/clears the real {@link TenantContext} rather than relying on a mocked throw.
 */
class AgentManagerResourceDeleteAgentTest {

    private AgentGrpcService agentGrpcService;
    private UtmIncidentVariableService incidentVariableService;
    private ApplicationEventService eventService;
    private AgentManagerResource resource;

    @BeforeEach
    void setUp() {
        agentGrpcService = mock(AgentGrpcService.class);
        incidentVariableService = mock(UtmIncidentVariableService.class);
        eventService = mock(ApplicationEventService.class);
        resource = new AgentManagerResource(agentGrpcService, incidentVariableService, eventService);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void deleteAgent_success_returns204_andAuditsAttemptAndSuccess() {
        TenantContext.set(7L, null);
        doNothing().when(agentGrpcService).deleteAgent(eq("web-01"));

        ResponseEntity<Void> response = resource.deleteAgent("web-01");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(agentGrpcService, times(1)).deleteAgent("web-01");
        verify(eventService).createEvent(any(), eq(ApplicationEventType.AGENT_DELETE_ATTEMPT));
        verify(eventService).createEvent(any(), eq(ApplicationEventType.AGENT_DELETE_SUCCESS));
    }

    @Test
    void deleteAgent_crossTenantOrMissing_returns404_withNoSuccessAudit() {
        TenantContext.set(7L, null);
        doThrow(new AgentNotfoundException()).when(agentGrpcService).deleteAgent(eq("other-tenant-host"));

        ResponseEntity<Void> response = resource.deleteAgent("other-tenant-host");

        // 404 with no body — a host in another tenant is indistinguishable from a missing one.
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).isNull();
        // The attempt is still recorded; success is NOT (removal did not happen).
        verify(eventService).createEvent(any(), eq(ApplicationEventType.AGENT_DELETE_ATTEMPT));
        verify(eventService, times(0)).createEvent(any(), eq(ApplicationEventType.AGENT_DELETE_SUCCESS));
    }

    @Test
    void deleteAgent_msspNoTenantSelected_returns400_beforeAnyServiceCall() {
        // MSSP mode (a prefix is set) with NO resolved client id → the up-front gate rejects with
        // 400 and never calls the service, never audits an attempt (nothing was attempted).
        TenantContext.set("mssp-prefix"); // sets prefix, clears clientId → isMssp() && getClientId()==null
        ResponseEntity<Void> response = resource.deleteAgent("web-01");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(agentGrpcService);
        verify(eventService, times(0)).createEvent(any(), eq(ApplicationEventType.AGENT_DELETE_ATTEMPT));
    }

    @Test
    void deleteAgent_singleTenantNoClientId_proceeds() {
        // Single-tenant (non-MSSP) deployment: getClientId() is legitimately null and there is no
        // partitioning. The removal must NOT be 400'd — the up-front gate only guards MSSP mode.
        TenantContext.clear(); // no prefix, no clientId → isMssp()==false
        doNothing().when(agentGrpcService).deleteAgent(eq("web-01"));

        ResponseEntity<Void> response = resource.deleteAgent("web-01");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(agentGrpcService, times(1)).deleteAgent("web-01");
        verify(eventService).createEvent(any(), eq(ApplicationEventType.AGENT_DELETE_SUCCESS));
    }

    @Test
    void deleteAgent_tenantScopeDenied_returns403() {
        TenantContext.set(7L, null);
        doThrow(new AccessDeniedException("no tenant scope"))
            .when(agentGrpcService).deleteAgent(eq("web-01"));

        ResponseEntity<Void> response = resource.deleteAgent("web-01");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(eventService, times(0)).createEvent(any(), eq(ApplicationEventType.AGENT_DELETE_SUCCESS));
    }

    @Test
    void deleteAgent_backendOutage_returns500_andAuditsError() {
        TenantContext.set(7L, null);
        doThrow(new RuntimeException("agent manager is not available"))
            .when(agentGrpcService).deleteAgent(eq("web-01"));

        ResponseEntity<Void> response = resource.deleteAgent("web-01");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        verify(eventService).createEvent(any(), eq(ApplicationEventType.ERROR));
        verify(eventService, times(0)).createEvent(any(), eq(ApplicationEventType.AGENT_DELETE_SUCCESS));
    }
}
