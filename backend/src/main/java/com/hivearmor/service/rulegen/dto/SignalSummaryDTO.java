package com.hivearmor.service.rulegen.dto;

import com.hivearmor.domain.rulegen.HaAlertSignal;

import java.util.List;

/**
 * Aggregated signal summary returned by the signal summary endpoint.
 *
 * <p>Contains per-group details and top-level totals for true-positive
 * and false-positive signal counts.
 */
public record SignalSummaryDTO(
    long minCount,
    long truePositiveTotal,
    long falsePositiveTotal,
    List<SignalGroupDTO> groups
) {

    /**
     * Builds a summary DTO from the raw {@link SignalGroup} projection rows.
     *
     * <p>Aggregates true-positive and false-positive totals across all groups
     * and maps each row to a {@link SignalGroupDTO}.
     *
     * @param rows the signal group projections from the repository query
     * @return a fully populated summary DTO
     */
    public static SignalSummaryDTO from(List<SignalGroup> rows) {
        long tpTotal = rows.stream()
            .filter(g -> g.signalType() == HaAlertSignal.SignalType.TRUE_POSITIVE)
            .mapToLong(SignalGroup::count)
            .sum();

        long fpTotal = rows.stream()
            .filter(g -> g.signalType() == HaAlertSignal.SignalType.FALSE_POSITIVE)
            .mapToLong(SignalGroup::count)
            .sum();

        long minCount = rows.stream()
            .mapToLong(SignalGroup::count)
            .min()
            .orElse(0L);

        List<SignalGroupDTO> groups = rows.stream()
            .map(g -> new SignalGroupDTO(
                g.dataType(),
                g.signalType().name(),
                g.count(),
                g.firstSeen(),
                g.lastSeen()
            ))
            .toList();

        return new SignalSummaryDTO(minCount, tpTotal, fpTotal, groups);
    }
}
