package com.hivearmor.service.dto.inputs;

import java.time.Instant;
import java.util.List;

/**
 * Aggregated per-source data record returned by
 * {@code GET /api/ha-inputs/sources}.
 *
 * <p>Combines agent-manager gRPC health with OpenSearch ingest statistics
 * into a single response shape. Fields {@code grpcStatus} and
 * {@code opensearchStatus} are set to {@link HaDataSourceStatus#unreachable}
 * when the corresponding upstream adapter fails; the record is still included
 * in the response rather than propagating the exception.
 *
 * <p>Requirements: 8.6, 9.2
 *
 * @param id                Source identifier.
 * @param name              Human-readable name of the data source.
 * @param type              Data source type (e.g. "syslog", "agent").
 * @param grpcStatus        Result of the agent-manager gRPC health call.
 * @param opensearchStatus  Result of the OpenSearch stats call.
 * @param eps               Current events-per-second rate; {@code 0.0} on failure.
 * @param epsHistory        Rolling window of EPS samples; empty list on failure.
 * @param lastEventAt       Timestamp of the most recent indexed event; {@code null} on failure.
 * @param enabled           Whether the source is administratively enabled.
 */
public record HaDataSourceRecordDTO(
        String id,
        String name,
        String type,
        HaDataSourceStatus grpcStatus,
        HaDataSourceStatus opensearchStatus,
        double eps,
        List<Double> epsHistory,
        Instant lastEventAt,
        boolean enabled
) {}
