package com.hivearmor.service.inputs;

import java.time.Instant;
import java.util.List;

/**
 * Typed ingest statistics result surfaced by
 * {@link HaDataSourceOpenSearchAdapter#statsFor(HaDataSource)}.
 *
 * <p>All numeric values are non-negative. {@code epsHistory} is a bounded rolling
 * window of recent EPS samples ordered oldest-first. {@code lastEventAt} is
 * {@code null} when no events have been indexed for this source.
 *
 * <p>Requirements: 8.2, 8.5
 *
 * @param eps          Current events-per-second rate derived from the OpenSearch
 *                     document count delta over the measurement window.
 * @param epsHistory   Immutable list of historical EPS samples (oldest first),
 *                     bounded to at most 60 entries.
 * @param lastEventAt  Timestamp of the most recently indexed event, or {@code null}.
 */
public record IngestStats(
        double eps,
        List<Double> epsHistory,
        Instant lastEventAt
) {}
