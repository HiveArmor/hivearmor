package com.hivearmor.repository.rulegen;

import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.service.rulegen.dto.SignalGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for {@link HaAlertSignal}.
 *
 * <p>Provides the idempotent-signal lookup ({@link #findByAlertIdAndSignalType}) and an
 * aggregate query ({@link #findSignalGroupsWithMinCount}) used by the rule generation
 * service to identify signal groups that have accumulated enough analyst feedback.
 */
@Repository
public interface HaAlertSignalRepository extends JpaRepository<HaAlertSignal, Long> {

    /**
     * Finds an existing signal row for the given alert and signal type combination.
     * Used for idempotency checks before inserting a new signal.
     *
     * @param alertId    the alert identifier
     * @param signalType the signal type (TRUE_POSITIVE or FALSE_POSITIVE)
     * @return the existing signal if present
     */
    Optional<HaAlertSignal> findByAlertIdAndSignalType(String alertId,
                                                       HaAlertSignal.SignalType signalType);

    /**
     * Groups signals by (dataType, signalType) and returns aggregate rows where the
     * count meets or exceeds the given minimum threshold. Results are ordered by count
     * descending so the most common signal groups appear first.
     *
     * <p>The projection maps to {@link SignalGroup} whose constructor parameter order
     * matches the SELECT clause exactly.
     *
     * @param minCount minimum number of signals required for a group to be included
     * @return list of signal groups meeting the threshold, ordered by count descending
     */
    @Query("""
        SELECT new com.hivearmor.service.rulegen.dto.SignalGroup(
            s.dataType, s.signalType, COUNT(s), MIN(s.recordedAt), MAX(s.recordedAt))
        FROM HaAlertSignal s
        GROUP BY s.dataType, s.signalType
        HAVING COUNT(s) >= :minCount
        ORDER BY COUNT(s) DESC
    """)
    List<SignalGroup> findSignalGroupsWithMinCount(@Param("minCount") long minCount);
}
