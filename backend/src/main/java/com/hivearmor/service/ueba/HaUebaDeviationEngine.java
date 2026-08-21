package com.hivearmor.service.ueba;

import com.hivearmor.domain.ueba.HaUebaBaseline;
import com.hivearmor.domain.ueba.HaUebaDeviation;
import com.hivearmor.domain.ueba.HaUebaPeerGroup;
import com.hivearmor.repository.ueba.HaUebaBaselineRepository;
import com.hivearmor.repository.ueba.HaUebaDeviationRepository;
import com.hivearmor.repository.ueba.HaUebaPeerGroupRepository;
import com.hivearmor.service.ueba.metrics.MetricObservationReader;
import com.hivearmor.service.ueba.metrics.UebaMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * UEBA Deviation Scoring Engine — computes per-user z-scores against peer-group
 * baselines and applies the tiered scoring rubric.
 *
 * <p>For each user and each metric in {@link UebaMetrics#METRIC_SET}, the engine:
 * <ol>
 *   <li>Loads the user's most recent peer-group assignment</li>
 *   <li>Looks up the latest {@link HaUebaBaseline} for that peer group and metric</li>
 *   <li>Reads the current-hour observed value via {@link MetricObservationReader}</li>
 *   <li>Computes {@code z = (observed - mean) / stddev}, guarding against {@code stddev == 0}</li>
 *   <li>Applies the highest-wins tier rubric: {@code |z|>4→50, |z|>3→25, |z|>2→10, else 0}</li>
 *   <li>Persists a {@link HaUebaDeviation} row when the z-score is computable
 *       (even if awarded points are 0)</li>
 * </ol>
 *
 * <p>Every observation lookup uses {@code MsspIndexResolver} for the index pattern
 * and {@code SearchUtil} DSL for the query body — enforced via the
 * {@link MetricObservationReader} interface contract.
 *
 * <p>The hourly scoring pass is triggered by task 3.5's schedule wiring. When a user's
 * summed score strictly exceeds {@link #TOTAL_SCORE_THRESHOLD} (75), exactly one
 * synthetic alert is emitted via {@link SyntheticAlertInjector}.
 *
 * @see HaUebaBaselineService
 * @see MetricObservationReader
 * @see SyntheticAlertInjector
 */
@Service
public class HaUebaDeviationEngine {

    private static final Logger log = LoggerFactory.getLogger(HaUebaDeviationEngine.class);

    /**
     * Summed awarded points must strictly exceed this threshold to trigger
     * a synthetic alert. Locked by Sprint 29 requirements.
     */
    static final int TOTAL_SCORE_THRESHOLD = 75;

    private final HaUebaPeerGroupRepository peerGroupRepository;
    private final HaUebaBaselineRepository baselineRepository;
    private final HaUebaDeviationRepository deviationRepository;
    private final MetricObservationReader observationReader;
    private final SyntheticAlertInjector injector;
    private final Clock clock;

    public HaUebaDeviationEngine(
            HaUebaPeerGroupRepository peerGroupRepository,
            HaUebaBaselineRepository baselineRepository,
            HaUebaDeviationRepository deviationRepository,
            MetricObservationReader observationReader,
            SyntheticAlertInjector injector,
            Clock clock) {
        this.peerGroupRepository = peerGroupRepository;
        this.baselineRepository = baselineRepository;
        this.deviationRepository = deviationRepository;
        this.observationReader = observationReader;
        this.injector = injector;
        this.clock = clock;
    }

    /**
     * Scores a single user using the current clock time (truncated to the hour).
     *
     * <p>This is the public API entry point for on-demand scoring (e.g., from REST
     * endpoints or integration tests).
     *
     * @param tenantId the tenant context for this scoring run
     * @param userId   the user to score
     * @return the summed awarded points across all metrics in {@link UebaMetrics#METRIC_SET}
     */
    public int scoreUser(String tenantId, String userId) {
        return scoreUser(tenantId, userId, Instant.now(clock).truncatedTo(ChronoUnit.HOURS));
    }

    /**
     * Scores a single user for a specific run timestamp.
     *
     * <p>For each metric in {@link UebaMetrics#METRIC_SET}:
     * <ul>
     *   <li>Loads the latest baseline for the user's peer group</li>
     *   <li>Guards against {@code stddev == 0} (skips the metric, does not throw)</li>
     *   <li>Computes the z-score and awards points per the tiered rubric</li>
     *   <li>Persists a {@link HaUebaDeviation} row when the z-score is computable
     *       (even when awarded points are 0)</li>
     * </ul>
     *
     * @param tenantId the tenant context
     * @param userId   the user to score
     * @param runTs    the scoring-run timestamp (truncated to the hour)
     * @return the summed awarded points across all metrics
     */
    int scoreUser(String tenantId, String userId, Instant runTs) {
        Optional<HaUebaPeerGroup> peer = peerGroupRepository.findFirstByUserIdOrderByComputedOnDesc(userId);
        if (peer.isEmpty()) {
            log.debug("No peer-group assignment found for userId={}, skipping scoring", userId);
            return 0;
        }

        String groupKey = peer.get().getGroupKey();
        int total = 0;

        for (String metric : UebaMetrics.METRIC_SET) {
            Optional<HaUebaBaseline> baseline =
                baselineRepository.findLatestByGroupKeyAndMetricName(groupKey, metric);

            // Guard: skip metric if no baseline exists or stddev is zero (avoid divide-by-zero)
            if (baseline.isEmpty() || baseline.get().getBaselineStddev() == 0.0) {
                continue;
            }

            double observed = observationReader.readCurrentValue(userId, metric, runTs);
            double z = (observed - baseline.get().getBaselineMean()) / baseline.get().getBaselineStddev();
            int points = awardPoints(z);

            // Persist a deviation row: insert even when awarded_points == 0 since
            // the z-score is computable (stddev != 0 guard passed above).
            // Only skip when z-score is non-computable (stddev == 0), which is handled above.
            HaUebaDeviation row = new HaUebaDeviation();
            row.setTenantId(tenantId);
            row.setUserId(userId);
            row.setMetricName(metric);
            row.setRunTs(runTs);
            row.setZScore(z);
            row.setPoints(points);
            row.setObservedValue(observed);
            deviationRepository.save(row);

            total += points;
        }

        return total;
    }

    /**
     * Applies the highest-wins tiered scoring rubric.
     *
     * <p>Uses strictly-greater-than comparisons:
     * <ul>
     *   <li>{@code |z| > 4} → 50 points</li>
     *   <li>{@code |z| > 3} → 25 points</li>
     *   <li>{@code |z| > 2} → 10 points</li>
     *   <li>Otherwise → 0 points</li>
     * </ul>
     *
     * <p>Only the highest applicable tier is awarded — there is no additive stacking
     * of lower tiers.
     *
     * @param z the z-score value
     * @return the awarded points for the highest applicable tier
     */
    static int awardPoints(double z) {
        double a = Math.abs(z);
        if (a > 4.0) return 50;
        if (a > 3.0) return 25;
        if (a > 2.0) return 10;
        return 0;
    }

    /**
     * Builds a {@link SyntheticAlertPayload} from the deviation rows produced
     * in the current scoring run.
     *
     * @param tenantId the tenant context
     * @param userId   the user whose deviations triggered the alert
     * @param runTs    the scoring-run timestamp
     * @param total    the summed awarded points
     * @return the assembled payload
     */
    SyntheticAlertPayload buildPayload(String tenantId, String userId, Instant runTs, int total) {
        List<HaUebaDeviation> deviations = deviationRepository.findAllByUserIdAndRunTs(userId, runTs);
        List<SyntheticAlertPayload.ContributingMetric> contributing = new ArrayList<>();
        for (HaUebaDeviation d : deviations) {
            if (d.getPoints() > 0) {
                contributing.add(new SyntheticAlertPayload.ContributingMetric(
                    d.getMetricName(), d.getZScore(), d.getPoints()));
            }
        }
        return new SyntheticAlertPayload(userId, runTs, total, contributing, tenantId);
    }

    // --- Accessors for testing ---

    Clock getClock() {
        return clock;
    }

    int getTotalScoreThreshold() {
        return TOTAL_SCORE_THRESHOLD;
    }
}
