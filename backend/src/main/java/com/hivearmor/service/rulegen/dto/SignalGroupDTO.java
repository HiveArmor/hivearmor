package com.hivearmor.service.rulegen.dto;

import java.time.Instant;

/**
 * DTO representing a single signal group in the signal summary response.
 *
 * <p>Maps from the {@link SignalGroup} projection record, converting the
 * enum-typed {@code signalType} to its string name for JSON serialization.
 */
public record SignalGroupDTO(
    String dataType,
    String signalType,
    long count,
    Instant firstSeen,
    Instant lastSeen
) {}
