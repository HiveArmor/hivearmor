package com.hivearmor.service.inputs;

import com.hivearmor.service.grpc.AgentServiceGrpc;
import com.hivearmor.service.grpc.ListAgentsResponse;
import com.hivearmor.service.grpc.ListRequest;
import com.hivearmor.service.grpc.Agent;
import io.grpc.ManagedChannel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;

/**
 * Adapter that wraps the existing agent-manager gRPC client to retrieve
 * per-source health information.
 *
 * <p>Queries the agent-manager for all agents matching the given data source
 * and returns a typed {@link AgentHealth} result. Callers are responsible for
 * surrounding calls to {@link #health(HaDataSource)} in a try/catch block —
 * this adapter surfaces exceptions rather than swallowing them so the
 * {@code HaDataSourceService} aggregation layer can mark individual records as
 * {@code unreachable} without hiding the root cause in logs.
 *
 * <p>Requirements: 8.2
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HaDataSourceGrpcAdapter {

    private static final String CLASSNAME = "HaDataSourceGrpcAdapter";

    /**
     * Spring-managed {@link ManagedChannel} bean wired in
     * {@code com.hivearmor.config.GrpcConfiguration}.
     */
    private final ManagedChannel grpcManagedChannel;

    /**
     * Queries the agent-manager for health information about the given data source.
     *
     * <p>Uses a broad {@code listAgents} call filtered by the source identifier so
     * that each data source gets an independent health snapshot. The blocking stub
     * is created per-call to avoid holding a stub reference across channel state
     * changes.
     *
     * <p>Any {@link io.grpc.StatusRuntimeException} or other runtime failure is
     * propagated to the caller. The {@code HaDataSourceService} wraps each call
     * in a try/catch and marks the record's {@code grpcStatus} as
     * {@code unreachable} on exception (Req 8.3).
     *
     * @param src The data source whose health is being queried.
     * @return A typed {@link AgentHealth} describing the agent-manager view of the source.
     * @throws Exception if the gRPC call fails (caller is expected to catch this).
     */
    public AgentHealth health(HaDataSource src) throws Exception {
        final String ctx = CLASSNAME + ".health";
        log.debug("{}: querying agent health for source id={}", ctx, src.id());

        AgentServiceGrpc.AgentServiceBlockingStub stub =
                AgentServiceGrpc.newBlockingStub(grpcManagedChannel);

        // Filter agents by the source identifier so we scope the query to this source.
        // The search query follows the existing AgentGrpcService convention.
        ListRequest request = ListRequest.newBuilder()
                .setPageNumber(1)
                .setPageSize(1000)
                .setSearchQuery("source.Is=" + src.id())
                .setSortBy("")
                .build();

        ListAgentsResponse response = stub.listAgents(request);
        List<Agent> agents = response.getRowsList();

        if (agents.isEmpty()) {
            log.debug("{}: no agents found for source id={}", ctx, src.id());
            return new AgentHealth("UNKNOWN", 0, null);
        }

        // Derive an overall status: ONLINE if any agent is online, else OFFLINE, else UNKNOWN.
        boolean anyOnline = agents.stream()
                .anyMatch(a -> a.getStatus() == com.hivearmor.service.grpc.Status.ONLINE);
        boolean anyOffline = agents.stream()
                .anyMatch(a -> a.getStatus() == com.hivearmor.service.grpc.Status.OFFLINE);

        String overallStatus;
        if (anyOnline) {
            overallStatus = "ONLINE";
        } else if (anyOffline) {
            overallStatus = "OFFLINE";
        } else {
            overallStatus = "UNKNOWN";
        }

        // Most recently seen agent timestamp (ISO-8601 string from proto).
        String lastSeenAt = agents.stream()
                .map(Agent::getLastSeen)
                .filter(s -> s != null && !s.isBlank())
                .max(Comparator.naturalOrder())
                .orElse(null);

        log.debug("{}: source id={} → status={}, agentCount={}", ctx, src.id(), overallStatus, agents.size());
        return new AgentHealth(overallStatus, agents.size(), lastSeenAt);
    }
}
