package com.hivearmor.web.rest.incident_response;

import com.hivearmor.service.agent_manager.AgentGrpcService;
import com.hivearmor.service.dto.agent_manager.AgentDTO;
import com.hivearmor.service.dto.agent_manager.AgentStatusEnum;
import com.hivearmor.service.incident_response.UtmIncidentVariableService;
import com.hivearmor.service.incident_response.grpc_impl.IncidentResponseCommandService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.listener.AuditApplicationEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Session T06 — WebSocket command channel audit event tests.
 *
 * <p>Covers the security contract of the HiveArmor incident response WebSocket handler:
 * <ul>
 *   <li>an unauthenticated caller (no valid handshake token, so
 *       {@code SecurityUtils.getCurrentUserLogin()} resolves empty) never causes an
 *       {@link AuditApplicationEvent} to be published — the true handshake rejection
 *       lives in {@code WebsocketConfiguration}, and this handler-level contract is
 *       the last line of defence;</li>
 *   <li>an authenticated caller proceeds past the authentication guard and reaches
 *       the agent lookup path;</li>
 *   <li>a dispatched command against an online agent publishes exactly one
 *       {@code AGENT_COMMAND_SENT} audit event whose {@code principal} is the
 *       authenticated login and whose {@code data} map contains exactly the
 *       {@code hostname} and {@code command} keys.</li>
 * </ul>
 *
 * <p>Validates: Requirements 6.9, 6.11, 6.12, 0.1.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WebSocketSecurityTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Mock
    private IncidentResponseCommandService incidentResponseCommandService;

    @Mock
    private AgentGrpcService agentGrpcService;

    @Mock
    private UtmIncidentVariableService utmIncidentVariableService;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private UTMIncidentCommandWebsocket websocket;

    @BeforeEach
    void resetSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void wsUpgradeWithoutToken_isRejected() {
        // Given: no authenticated principal on the SecurityContextHolder. This models
        // an upgrade attempt that either lacks the access_token query parameter or
        // supplied a token that TokenProvider.validateToken rejected — in either
        // case the handshake interceptor in WebsocketConfiguration would have
        // rejected the connection before any STOMP frame reached processCommand.
        // At the handler level the equivalent contract is: an empty principal must
        // never result in an AGENT_COMMAND_SENT audit event.
        SecurityContextHolder.clearContext();

        String payload = "{\"command\":\"ls\",\"originType\":\"MANUAL\","
            + "\"originId\":\"1\",\"reason\":\"test\",\"shell\":\"BASH\"}";

        // When: processCommand is invoked without a valid principal.
        websocket.processCommand(payload, "myhost");

        // Then: no audit event is published and no agent lookup is attempted.
        verify(eventPublisher, never()).publishEvent(any(AuditApplicationEvent.class));
        verify(agentGrpcService, never()).getAgentByHostname(anyString());
    }

    @Test
    void wsUpgradeWithValidToken_succeeds() {
        // Given: an authenticated principal representing a caller that presented a
        // valid handshake token. SecurityUtils.getCurrentUserLogin() will resolve to
        // "admin" because the principal is a String.
        Authentication auth = new UsernamePasswordAuthenticationToken(
            "admin", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        SecurityContextHolder.getContext().setAuthentication(auth);

        String payload = "{\"command\":\"ls\",\"originType\":\"MANUAL\","
            + "\"originId\":\"1\",\"reason\":\"test\",\"shell\":\"BASH\"}";

        // When: processCommand is invoked with a valid principal.
        websocket.processCommand(payload, "myhost");

        // Then: the authenticated flow proceeded past the login guard and reached
        // the agent lookup — proving the request was not rejected up front.
        verify(agentGrpcService, times(1)).getAgentByHostname("myhost");
    }

    @Test
    void processCommand_publishesAuditEvent() {
        // Given: an authenticated "admin" caller and an online agent for host "h1".
        Authentication auth = new UsernamePasswordAuthenticationToken(
            "admin", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        SecurityContextHolder.getContext().setAuthentication(auth);

        AgentDTO onlineAgent = mock(AgentDTO.class);
        when(onlineAgent.getStatus()).thenReturn(AgentStatusEnum.ONLINE);
        when(onlineAgent.getId()).thenReturn(42);
        when(agentGrpcService.getAgentByHostname("h1")).thenReturn(onlineAgent);

        String payload = "{\"command\":\"kill 1234\",\"originType\":\"MANUAL\","
            + "\"originId\":\"1\",\"reason\":\"iso\",\"shell\":\"BASH\"}";

        // When: processCommand is invoked for the online agent.
        websocket.processCommand(payload, "h1");

        // Then: exactly one AuditApplicationEvent is published with the expected
        // type, principal, and a two-key data map (hostname + command only).
        ArgumentCaptor<AuditApplicationEvent> captor =
            ArgumentCaptor.forClass(AuditApplicationEvent.class);
        verify(eventPublisher, times(1)).publishEvent(captor.capture());

        AuditEvent published = captor.getValue().getAuditEvent();
        assertEquals("AGENT_COMMAND_SENT", published.getType(),
            "audit event type must be AGENT_COMMAND_SENT");
        assertEquals("admin", published.getPrincipal(),
            "audit event principal must equal the authenticated login");

        Map<String, Object> data = published.getData();
        assertEquals(2, data.size(),
            "audit event data map must contain exactly two keys (hostname, command)");
        assertEquals("h1", data.get("hostname"),
            "audit event data.hostname must equal the processCommand hostname parameter");
        assertEquals("kill 1234", data.get("command"),
            "audit event data.command must equal commandVM.getCommand(), not the raw JSON frame");
    }
}
