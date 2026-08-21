package com.hivearmor.service.dto.ops;

import java.time.Instant;
import java.util.List;

/**
 * Measured pipeline capacity/lag signals for Admin operators.
 *
 * <p>No invented SLO pass/fail thresholds — values are reported as measured or
 * explicitly {@code null}/{@code not_reported}.</p>
 */
public record PipelineSignalsDTO(
    Instant recordedAt,
    String backendStatus,
    String opensearchStatus,
    Integer opensearchUnassignedShards,
    Long opensearchStoreBytes,
    Long postgresHivearmorBytes,
    List<ConsumerGroupLagDTO> consumerGroupLags,
    List<String> topics,
    String hostSamplePath,
    Instant hostSampleRecordedAt,
    String hostSampleStatus,
    List<SoakHistoryPointDTO> soakHistory,
    Double soakSpanHours,
    Integer soakSampleCount,
    List<String> limitations
) {
    public record ConsumerGroupLagDTO(String group, Long totalLag) {}

    /**
     * One host soak sample projection for Admin history (measured values only).
     */
    public record SoakHistoryPointDTO(
        Instant recordedAt,
        String opensearchStatus,
        Long opensearchStoreBytes,
        Long consumerLag,
        String sampleFile
    ) {}
}
