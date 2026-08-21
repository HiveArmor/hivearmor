package com.hivearmor.service.dto.inputs;

/**
 * Represents the reachability status of a data source's upstream adapter.
 *
 * <p>Used in {@link HaDataSourceRecordDTO} to surface per-source gRPC and
 * OpenSearch health independently. The value {@code unreachable} is set when
 * the adapter call throws an exception; it is never propagated up the stack.
 *
 * <p>Requirements: 8.3, 8.4, 9.3
 */
public enum HaDataSourceStatus {

    /**
     * The upstream adapter responded without error.
     */
    ok,

    /**
     * The upstream adapter threw an exception or was otherwise unavailable.
     * The aggregated record is still included in the response (Req 9.3).
     */
    unreachable
}
