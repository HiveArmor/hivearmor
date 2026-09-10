package com.hivearmor.service.agent_manager;

import com.hivearmor.service.dto.agent_manager.*;
import com.hivearmor.service.grpc.DeleteRequest;
import com.hivearmor.service.grpc.ListRequest;
import com.hivearmor.config.Constants;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.multitenancy.TenantScope;
import com.hivearmor.service.grpc.*;
import com.hivearmor.web.rest.errors.AgentNotfoundException;
import com.hivearmor.web.rest.vm.AgentRequestVM;
import io.grpc.*;
import io.grpc.Status;
import io.grpc.stub.MetadataUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import java.time.Instant;

@Service
public class AgentGrpcService {
    private static final String CLASSNAME = "AgentGrpcService";
    private final Logger log = LoggerFactory.getLogger(AgentService.class);

    private final AgentServiceGrpc.AgentServiceBlockingStub blockingStub;
    private final ManagedChannel grpcManagedChannel;

    public AgentGrpcService(ManagedChannel grpcManagedChannel) {
        this.grpcManagedChannel = grpcManagedChannel;
        this.blockingStub = AgentServiceGrpc.newBlockingStub(grpcManagedChannel);
    }

    public ListAgentsResponseDTO listAgents(ListRequest request) throws Exception {
        // P0A1-T04: the tenant must already be set on the request by the caller
        // (controllers via TenantScope.requireTenant()). The manager fail-closes
        // when tenant_id <= 0, so this method never widens scope on its own.
        return mapToListAgentsResponseDTO(blockingStub.listAgents(request));
    }

    /**
     * P0A1-T04 — convenience overload that stamps the authoritative tenant onto the
     * request before dispatch. Callers holding a resolved tenant should prefer this
     * so the tenant is set in exactly one place.
     */
    public ListAgentsResponseDTO listAgents(ListRequest request, long tenantId) throws Exception {
        ListRequest scoped = request.toBuilder().setTenantId(tenantId).build();
        return mapToListAgentsResponseDTO(blockingStub.listAgents(scoped));
    }

    /**
     * P0A1-T12 — response-action target guard. Verifies the target agent belongs to
     * the caller's authoritative tenant BEFORE any response command (kill / isolate /
     * quarantine / restore / lift) is dispatched to the agent-manager. A target in
     * another tenant does not resolve under the tenant-scoped lookup and is refused
     * with {@link AgentNotfoundException} (mapped to 404, no cross-tenant disclosure).
     * This is authorization only — command signing is a later batch.
     */
    public void requireAgentInCurrentTenant(String agentId) throws AgentNotfoundException {
        if (agentId == null || agentId.isBlank()) {
            throw new AgentNotfoundException();
        }
        try {
            ListRequest req = ListRequest.newBuilder()
                    .setPageNumber(1)
                    .setPageSize(1)
                    .setSearchQuery("id.Is=" + agentId.trim())
                    .setSortBy("")
                    .setTenantId(TenantScope.requireTenant())
                    .build();
            ListAgentsResponseDTO response = mapToListAgentsResponseDTO(blockingStub.listAgents(req));
            if (response.getAgents() == null || response.getAgents().isEmpty()) {
                com.hivearmor.multitenancy.TenantAudit.crossTenantDenied(
                    "requireAgentInCurrentTenant", "agent", agentId, "target-outside-tenant");
                throw new AgentNotfoundException();
            }
        } catch (AgentNotfoundException nf) {
            throw nf;
        } catch (Exception e) {
            // Fail closed: if the target cannot be positively confirmed within the
            // caller's tenant, do not allow the response action to proceed.
            com.hivearmor.multitenancy.TenantAudit.crossTenantDenied(
                "requireAgentInCurrentTenant", "agent", agentId, "confirm-failed");
            throw new AgentNotfoundException();
        }
    }

    public EnrollmentTokenCreatedDTO createEnrollmentToken(long tenantId, EnrollmentTokenCreateDTO request, String actor) {
        CreateEnrollmentTokenRequest grpcRequest = CreateEnrollmentTokenRequest.newBuilder()
            .setTenantId(tenantId)
            .setPolicyId(request.policyId())
            .setPlatform(request.platform().toLowerCase())
            .setExpiresAt(toTimestamp(request.expiresAt()))
            .setMaxUses(request.maxUses())
            .setCreatedBy(actor)
            .build();
        CreateEnrollmentTokenResponse response = blockingStub.createEnrollmentToken(grpcRequest);
        return new EnrollmentTokenCreatedDTO(toEnrollmentDTO(response.getEnrollment()), response.getToken());
    }

    public List<EnrollmentTokenDTO> listEnrollmentTokens(long tenantId, int page, int size) {
        ListEnrollmentTokensResponse response = blockingStub.listEnrollmentTokens(
            ListEnrollmentTokensRequest.newBuilder().setTenantId(tenantId).setPageNumber(page).setPageSize(size).build());
        return response.getRowsList().stream().map(this::toEnrollmentDTO).toList();
    }

    public int countEnrollmentTokens(long tenantId) {
        return blockingStub.listEnrollmentTokens(
            ListEnrollmentTokensRequest.newBuilder().setTenantId(tenantId).setPageNumber(0).setPageSize(1).build()).getTotal();
    }

    public EnrollmentTokenDTO revokeEnrollmentToken(long tenantId, String id, EnrollmentTokenRevokeDTO request, String actor) {
        EnrollmentToken response = blockingStub.revokeEnrollmentToken(RevokeEnrollmentTokenRequest.newBuilder()
            .setTenantId(tenantId).setId(id).setReason(request.reason()).setExpectedVersion(request.expectedVersion())
            .setRevokedBy(actor).build());
        return toEnrollmentDTO(response);
    }

    public AgentCredentialDTO rotateAgentCredential(long tenantId, long agentId, String actor, String reason) {
        return toAgentCredentialDTO(blockingStub.rotateAgentCredential(agentCredentialRequest(tenantId, agentId, actor, reason)));
    }

    public AgentCredentialDTO revokeAgentCredential(long tenantId, long agentId, String actor, String reason) {
        return toAgentCredentialDTO(blockingStub.revokeAgentCredential(agentCredentialRequest(tenantId, agentId, actor, reason)));
    }

    private AgentCredentialRequest agentCredentialRequest(long tenantId, long agentId, String actor, String reason) {
        if (agentId < 1 || agentId > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("agent id is outside the supported range");
        }
        return AgentCredentialRequest.newBuilder().setTenantId(tenantId).setAgentId((int) agentId)
            .setActor(actor).setReason(reason).build();
    }

    public EnrollmentAuditPageDTO listEnrollmentAuditEvents(
        long tenantId,
        int page,
        int size,
        String tokenId,
        String agentUuid,
        String eventType
    ) {
        ListEnrollmentAuditEventsRequest.Builder request = ListEnrollmentAuditEventsRequest.newBuilder()
            .setTenantId(tenantId).setPageNumber(page).setPageSize(size);
        if (tokenId != null) {
            request.setTokenId(tokenId);
        }
        if (agentUuid != null) {
            request.setAgentUuid(agentUuid);
        }
        if (eventType != null) {
            request.setEventType(eventType);
        }
        ListEnrollmentAuditEventsResponse response = blockingStub.listEnrollmentAuditEvents(request.build());
        return new EnrollmentAuditPageDTO(
            response.getRowsList().stream().map(this::toEnrollmentAuditDTO).toList(), response.getTotal());
    }

    public static final int MAX_ENROLLMENT_AUDIT_EXPORT_ROWS = 10_000;
    public static final int ENROLLMENT_AUDIT_EXPORT_PAGE_SIZE = 100;

    /**
     * Pages the existing bounded audit RPC. Does not delete or mutate source rows.
     */
    public EnrollmentAuditExportDTO exportEnrollmentAuditEvents(
        long tenantId,
        String tokenId,
        String agentUuid,
        String eventType
    ) {
        List<EnrollmentAuditEventDTO> rows = new ArrayList<>();
        EnrollmentAuditPageDTO page = listEnrollmentAuditEvents(
            tenantId, 0, ENROLLMENT_AUDIT_EXPORT_PAGE_SIZE, tokenId, agentUuid, eventType);
        long total = page.total();
        rows.addAll(page.rows());
        int pageNumber = 1;
        while (rows.size() < MAX_ENROLLMENT_AUDIT_EXPORT_ROWS && rows.size() < total) {
            EnrollmentAuditPageDTO next = listEnrollmentAuditEvents(
                tenantId, pageNumber, ENROLLMENT_AUDIT_EXPORT_PAGE_SIZE, tokenId, agentUuid, eventType);
            if (next.rows().isEmpty()) {
                break;
            }
            for (EnrollmentAuditEventDTO row : next.rows()) {
                if (rows.size() >= MAX_ENROLLMENT_AUDIT_EXPORT_ROWS) {
                    break;
                }
                rows.add(row);
            }
            pageNumber++;
        }
        boolean truncated = rows.size() < total;
        log.info("enrollment audit export tenant={} exported={} total={} truncated={}",
            tenantId, rows.size(), total, truncated);
        return new EnrollmentAuditExportDTO(List.copyOf(rows), total, truncated);
    }

    private EnrollmentTokenDTO toEnrollmentDTO(EnrollmentToken token) {
        return new EnrollmentTokenDTO(token.getId(), token.getTenantId(), token.getPolicyId(), token.getPlatform(),
            fromTimestamp(token.hasExpiresAt(), token.getExpiresAt()), token.getMaxUses(), token.getUseCount(),
            fromTimestamp(token.hasCreatedAt(), token.getCreatedAt()), token.getCreatedBy(),
            fromTimestamp(token.hasLastUsedAt(), token.getLastUsedAt()), fromTimestamp(token.hasRevokedAt(), token.getRevokedAt()),
            token.getRevokedBy(), token.getRevocationReason(), token.getVersion(), token.getStatus());
    }

    private AgentCredentialDTO toAgentCredentialDTO(AgentCredentialResponse response) {
        return new AgentCredentialDTO(response.getAgentId(), response.getAgentUuid(), response.getCredentialVersion(),
            response.getKey(), fromTimestamp(response.hasRevokedAt(), response.getRevokedAt()));
    }

    private EnrollmentAuditEventDTO toEnrollmentAuditDTO(EnrollmentAuditEvent event) {
        return new EnrollmentAuditEventDTO(
            event.getId(), event.getTenantId(), event.getEventType(), event.getActor(), event.getReason(),
            event.getTokenId(), Integer.toUnsignedLong(event.getAgentId()), event.getAgentUuid(), event.getPolicyId(),
            event.getPlatform(), Integer.toUnsignedLong(event.getCredentialVersion()), event.getEnrollmentVersion(),
            fromTimestamp(event.hasOccurredAt(), event.getOccurredAt()));
    }

    private com.google.protobuf.Timestamp toTimestamp(Instant value) {
        return com.google.protobuf.Timestamp.newBuilder().setSeconds(value.getEpochSecond()).setNanos(value.getNano()).build();
    }

    private Instant fromTimestamp(boolean present, com.google.protobuf.Timestamp value) {
        return present ? Instant.ofEpochSecond(value.getSeconds(), value.getNanos()) : null;
    }

    public ListAgentsCommandsResponseDTO listAgentCommands(ListRequest request) throws Exception {
        return mapToListAgentsCommandsResponseDTO(blockingStub.listAgentCommands(request));
    }

    /** P0A1-T07 — stamps the authoritative tenant before dispatching the command read. */
    public ListAgentsCommandsResponseDTO listAgentCommands(ListRequest request, long tenantId) throws Exception {
        return mapToListAgentsCommandsResponseDTO(
            blockingStub.listAgentCommands(request.toBuilder().setTenantId(tenantId).build()));
    }

    public ListAgentsResponseDTO listAgentWithCommands(ListRequest request) throws Exception {
        return mapToListAgentsResponseDTO(blockingStub.listAgents(request));
    }

    /** P0A1-T06 — stamps the authoritative tenant so both the agent rows and their
     *  attached commands are resolved within the caller's tenant. */
    public ListAgentsResponseDTO listAgentWithCommands(ListRequest request, long tenantId) throws Exception {
        return mapToListAgentsResponseDTO(
            blockingStub.listAgents(request.toBuilder().setTenantId(tenantId).build()));
    }


    public ListAgentsResponseDTO mapToListAgentsResponseDTO(ListAgentsResponse response) throws Exception {
        final String ctx = CLASSNAME + ".mapToListAgentsResponseDTO";
        try {
            ListAgentsResponseDTO dto = new ListAgentsResponseDTO();

            List<AgentDTO> agentDTOs = response.getRowsList().stream()
                    .map(this::protoToDTOAgent)
                    .collect(Collectors.toList());

            dto.setAgents(agentDTOs);
            dto.setTotal(response.getTotal());

            return dto;
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    public ListAgentsCommandsResponseDTO mapToListAgentsCommandsResponseDTO(ListAgentsCommandsResponse response) throws Exception {
        final String ctx = CLASSNAME + ".mapToListAgentsCommandsResponseDTO";
        try {
            ListAgentsCommandsResponseDTO dto = new ListAgentsCommandsResponseDTO();
            // Load agent list one time, will be used to search the agent that execute the command, by agent_id
            // P0A1-T04: scoped to the authoritative tenant so command→agent resolution
            // cannot see another tenant's agents.
            ListRequest req = ListRequest.newBuilder()
                    .setPageNumber(1)
                    .setPageSize(1000000)
                    .setSearchQuery("")
                    .setSortBy("")
                    .setTenantId(TenantScope.requireTenant())
                    .build();

            ListAgentsResponse agentResp = blockingStub.listAgents(req);
            List<Agent> agentList = agentResp.getRowsList();

            List<AgentCommandDTO> agentCommandDTOs = response.getRowsList().stream()
                    .map(ac -> {
                        try {
                            return this.protoToDTOAgentCommand(ac, agentList);
                        } catch (Exception e) {
                            throw new RuntimeException(e);
                        }
                    })
                    .collect(Collectors.toList());

            dto.setAgentCommands(agentCommandDTOs);
            dto.setTotal(response.getTotal());

            return dto;
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    public AgentCommandDTO protoToDTOAgentCommand(AgentCommand agentCommand, List<Agent> agentList) throws Exception {
        // Look for the agent with id = agentCommand.getAgentId() to get the agent that executed the command
        Optional<Agent> agent = agentList.stream().filter(a -> agentCommand.getAgentId() == a.getId()).findFirst();
        if (agentList.isEmpty() || agent.isEmpty()) {
            throw new AgentNotfoundException();
        }
        return new AgentCommandDTO(agentCommand, agent.get());
    }


    public AgentDTO protoToDTOAgent(Agent agent) {
        return new AgentDTO(agent);
    }


    public AgentDTO getAgentByHostname(String hostname) throws AgentNotfoundException {
        final String ctx = CLASSNAME + ".getAgentByHostname";
        try {
            ListRequest req = ListRequest.newBuilder()
                    .setPageNumber(1)
                    .setPageSize(1000000)
                    .setSearchQuery("hostname.Is=" + hostname)
                    .setSortBy("")
                    .setTenantId(TenantScope.requireTenant())
                    .build();
            ListAgentsResponseDTO response = listAgents(req);
            List<AgentDTO> agentDTOList = response.getAgents();
            if (agentDTOList.isEmpty()) {
                throw new AgentNotfoundException();
            }

            return agentDTOList.get(0);
        } catch (AgentNotfoundException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    public AuthResponseDTO protoToDTOAuthResponse(AuthResponse auth) {
        return new AuthResponseDTO(auth);
    }

    public AuthResponseDTO updateAgentAttributes(AgentRequestVM agentRequestVM) throws Exception {
        final String ctx = CLASSNAME + ".updateAgentAttributes";
        try {
            AgentRequest req = agentRequestVM.getAgentRequest();

            // Validating the existence of the agent.
            String currentUser = SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new RuntimeException("No current user login"));
            AgentDTO agent = null;
            String hostname = agentRequestVM.getHostname();

            try {
                agent = getAgentByHostname(hostname);
                if (agent == null) {
                    String msg = String.format("%1$s: Agent %2$s could not be updated because no information was obtained from the agent", ctx, hostname);
                    log.error(msg);
                    throw new Exception(msg);
                }
            } catch (StatusRuntimeException e) {
                if (e.getStatus().getCode() == Status.Code.NOT_FOUND) {
                    String msg = String.format("%1$s: Agent %2$s could not be updated because was not found", ctx, hostname);
                    log.error(msg);
                    throw new Exception(msg);
                }
            }

            assert agent != null;
            Metadata customHeaders = getCustomHeaders(agent);

            Channel intercept = ClientInterceptors.intercept(grpcManagedChannel, MetadataUtils.newAttachHeadersInterceptor(customHeaders));
            AgentServiceGrpc.AgentServiceBlockingStub newStub = AgentServiceGrpc.newBlockingStub(intercept);
            AuthResponse authResponse = newStub.updateAgent(req);
            if (authResponse != null) {
                return protoToDTOAuthResponse(authResponse);
            } else {
                throw new Exception("The agent manager didn't respond to the request, probably is down !!!");
            }
        } catch (NullPointerException e) {
            throw new Exception("The agent manager didn't respond to the request, probably is down !!!");
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    @SuppressWarnings("ResultOfMethodCallIgnored")
    public void deleteAgent(String hostname) throws AgentNotfoundException {
        final String ctx = CLASSNAME + ".deleteAgent";
        try {
            String currentUser = SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new RuntimeException("No current user login"));
            AgentDTO agent = null;
            try {
                agent = getAgentByHostname(hostname);
                if (agent == null) {
                    log.error(String.format("%1$s: Agent %2$s could not be deleted because no information was obtained from the agent", ctx, hostname));
                    return;
                }
            } catch (StatusRuntimeException e) {
                if (e.getStatus().getCode() == Status.Code.NOT_FOUND) {
                    throw new AgentNotfoundException();
                }
            } catch (AgentNotfoundException e) {
                throw e;
            }

            Long tenantId = TenantContext.getClientId();
            if (tenantId == null || tenantId <= 0) {
                throw new IllegalArgumentException("select an authorized tenant before deleting an agent");
            }
            DeleteRequest request = DeleteRequest.newBuilder().setDeletedBy(currentUser)
                .setAgentId(agent.getId()).setTenantId(tenantId).build();
            blockingStub.deleteAgent(request);

        } catch (AgentNotfoundException e) {
            throw e;
        } catch (Exception e) {
            String msg = e.getLocalizedMessage();
            if(msg.contains("UNAVAILABLE")) {
                msg = ctx + ": Agent couldn't be deleted, agent manager is not available.";
            } else {
                msg = ctx + ": " + e.getMessage();
            }
            log.error(msg);
            throw new RuntimeException(msg);
        }
    }

    /**
     * Confirms a presented agent secret. The secret is never returned or logged.
     */
    public ConnectorIdentity verifyAgentIdentity(int connectorId, String presentedKey) {
        VerifyConnectorIdentityResponse response = blockingStub.verifyConnectorIdentity(
            VerifyConnectorIdentityRequest.newBuilder()
                .setConnectorId(connectorId)
                .setPresentedKey(presentedKey)
                .setConnectorType(ConnectorType.AGENT)
                .build());
        return new ConnectorIdentity(response.getId(), response.getUuid(), response.getTenantId());
    }

    public record ConnectorIdentity(int id, String uuid, long tenantId) {
    }

    private Metadata getCustomHeaders (AgentDTO agent) {
        Metadata customHeaders = new Metadata();
        customHeaders.put(Metadata.Key.of("key", Metadata.ASCII_STRING_MARSHALLER), agent.getAgentKey());
        customHeaders.put(Metadata.Key.of("id", Metadata.ASCII_STRING_MARSHALLER), String.valueOf(agent.getId()));
        return customHeaders;
    }
}
