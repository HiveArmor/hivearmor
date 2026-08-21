package com.hivearmor.service.rulegen.dto;

import com.hivearmor.domain.rulegen.HaAlertSignal;
import java.time.Instant;

/**
 * Projection record used by {@code HaAlertSignalRepository.findSignalGroupsWithMinCount}.
 *
 * <p>The constructor parameter order must match the JPQL {@code SELECT new} column order
 * exactly: {@code (dataType, signalType, count, firstSeen, lastSeen)}.
 *
 * <p>Called from the JPQL query with {@code COUNT(s)} (long), {@code MIN(s.recordedAt)}
 * and {@code MAX(s.recordedAt)} (Instant).
 */
public record SignalGroup(
    String dataType,
    HaAlertSignal.SignalType signalType,
    long count,
    Instant firstSeen,
    Instant lastSeen
) {}
