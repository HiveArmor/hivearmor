package com.hivearmor.service.inputs;

/**
 * Typed result surfaced by {@link HaDataSourceGrpcAdapter#health(HaDataSource)}.
 *
 * <p>Wraps the raw {@link com.hivearmor.service.grpc.Status} proto enum into a
 * plain value object so the rest of the aggregation layer is not coupled to the
 * generated proto classes.
 *
 * @param agentStatus  String representation of the agent status
 *                     (e.g. "ONLINE", "OFFLINE", "UNKNOWN").
 * @param agentCount   Number of agents reported by the agent-manager for this source;
 *                     {@code 0} when the gRPC call returns an empty list.
 * @param lastSeenAt   ISO-8601 timestamp of the most recently seen agent, or
 *                     {@code null} if no agents have checked in.
 */
public record AgentHealth(
        String agentStatus,
        int agentCount,
        String lastSeenAt
) {}
