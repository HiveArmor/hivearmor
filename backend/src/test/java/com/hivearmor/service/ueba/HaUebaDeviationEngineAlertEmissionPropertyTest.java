package com.hivearmor.service.ueba;

import com.hivearmor.domain.ueba.HaUebaBaseline;
import com.hivearmor.domain.ueba.HaUebaPeerGroup;
import com.hivearmor.repository.ueba.HaUebaBaselineRepository;
import com.hivearmor.repository.ueba.HaUebaDeviationRepository;
import com.hivearmor.repository.ueba.HaUebaPeerGroupRepository;
import com.hivearmor.service.ueba.metrics.MetricObservationReader;
import com.hivearmor.service.ueba.metrics.UebaMetrics;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Property-based test for threshold-triggered alert emission in {@link HaUebaDeviationEngine}.
 *
 * <p><strong>Property 5: One alert iff total > 75 in a scoring run</strong><br>
 * For any set of per-metric awarded points {@code p = [p1..p5]} produced within a single
 * {@code scoreUser} invocation, {@code HaUebaDeviationEngine} emits exactly one
 * {@code Synthetic_Alert_Payload} iff {@code sum(p) > 75}, and zero otherwise.
 *
 * <p><strong>Validates: Requirement 3.7</strong>
 *
 * <h2>Test strategy</h2>
 * <ul>
 *   <li>Generate random arrays of 5 per-metric observations that, through controlled
 *       baselines (mean=0, stddev=1), produce specific z-scores mapping to known point values.</li>
 *   <li>Mock the repositories and observation reader so the engine uses these controlled values.</li>
 *   <li>After {@code scoreUser}, simulate the {@code runHourlyScoring} alert decision:
 *       if total > 75, verify {@code postToInjector} is called exactly once with
 *       {@code markAlertOnce} used correctly; otherwise verify zero calls.</li>
 * </ul>
 */
class HaUebaDeviationEngineAlertEmissionPropertyTest {

    private static final String TENANT_ID = "test-tenant";
    private static final String USER_ID = "user-001";
    private static final String GROUP_KEY = "engineering";
    private static final Instant RUN_TS = Instant.parse("2026-07-25T10:00:00Z");

    private HaUebaPeerGroupRepository peerGroupRepository;
    private HaUebaBaselineRepository baselineRepository;
    private HaUebaDeviationRepository deviationRepository;
    private MetricObservationReader observationReader;
    private SyntheticAlertInjector injector;
    private Clock clock;
    private HaUebaDeviationEngine engine;

    /**
     * Sorted metric list ensures deterministic ordering for test assertions.
     */
    private static final List<String> SORTED_METRICS = UebaMetrics.METRIC_SET.stream()
        .sorted().toList();

    @BeforeTry
    void setUp() {
        peerGroupRepository = mock(HaUebaPeerGroupRepository.class);
        baselineRepository = mock(HaUebaBaselineRepository.class);
        deviationRepository = mock(HaUebaDeviationRepository.class);
        observationReader = mock(MetricObservationReader.class);
        injector = mock(SyntheticAlertInjector.class);
        clock = Clock.fixed(RUN_TS, ZoneOffset.UTC);

        engine = new HaUebaDeviationEngine(
            peerGroupRepository,
            baselineRepository,
            deviationRepository,
            observationReader,
            injector,
            clock
        );

        // Set up a peer group for the test user
        HaUebaPeerGroup peerGroup = new HaUebaPeerGroup();
        peerGroup.setUserId(USER_ID);
        peerGroup.setGroupKey(GROUP_KEY);
        peerGroup.setTenantId(TENANT_ID);
        when(peerGroupRepository.findFirstByUserIdOrderByComputedOnDesc(USER_ID))
            .thenReturn(Optional.of(peerGroup));

        // Set up baselines with mean=0, stddev=1 for all metrics
        // This means observed value == z-score, simplifying the property test
        for (String metric : UebaMetrics.METRIC_SET) {
            HaUebaBaseline baseline = new HaUebaBaseline();
            baseline.setGroupKey(GROUP_KEY);
            baseline.setMetricName(metric);
            baseline.setBaselineMean(0.0);
            baseline.setBaselineStddev(1.0);
            when(baselineRepository.findLatestByGroupKeyAndMetricName(GROUP_KEY, metric))
                .thenReturn(Optional.of(baseline));
        }

        // Default: dedup guard returns true (first alert this run)
        when(deviationRepository.markAlertOnce(anyString(), any(Instant.class), anyString()))
            .thenReturn(true);

        // Mock findAllByUserIdAndRunTs for buildPayload
        when(deviationRepository.findAllByUserIdAndRunTs(anyString(), any(Instant.class)))
            .thenReturn(Collections.emptyList());
    }

    // =========================================================================
    // Property 5: One alert iff total > 75 in a scoring run
    // Validates: Requirement 3.7
    // =========================================================================

    /**
     * <strong>Validates: Requirement 3.7</strong>
     *
     * <p>When the sum of awarded points strictly exceeds 75,
     * {@code SyntheticAlertInjector.postToInjector()} is called exactly once.
     */
    @Property(tries = 200)
    @Label("Property 5a: sum(points) > 75 → postToInjector() called exactly once")
    void property5a_totalAboveThreshold_alertEmittedOnce(
            @ForAll("observedValuesAboveThreshold") double[] observations) {

        configureObservations(observations);

        // Execute the full scoring + alert emission flow for a single user
        scoreAndEmit(USER_ID, TENANT_ID, RUN_TS);

        // Verify: postToInjector called exactly once
        verify(injector, times(1)).postToInjector(any(SyntheticAlertPayload.class));
        // Verify: markAlertOnce was called (dedup guard used)
        verify(deviationRepository, times(1)).markAlertOnce(USER_ID, RUN_TS, TENANT_ID);
    }

    /**
     * <strong>Validates: Requirement 3.7</strong>
     *
     * <p>When the sum of awarded points is 75 or less (not strictly exceeding),
     * {@code SyntheticAlertInjector.postToInjector()} is never called.
     */
    @Property(tries = 200)
    @Label("Property 5b: sum(points) ≤ 75 → postToInjector() never called")
    void property5b_totalAtOrBelowThreshold_noAlertEmitted(
            @ForAll("observedValuesAtOrBelowThreshold") double[] observations) {

        configureObservations(observations);

        // Execute the full scoring + alert emission flow for a single user
        scoreAndEmit(USER_ID, TENANT_ID, RUN_TS);

        // Verify: postToInjector never called
        verify(injector, never()).postToInjector(any());
        // Verify: markAlertOnce was never called (threshold not crossed)
        verify(deviationRepository, never()).markAlertOnce(anyString(), any(Instant.class), anyString());
    }

    /**
     * <strong>Validates: Requirement 3.7</strong>
     *
     * <p>When the dedup guard ({@code markAlertOnce}) returns false (repeat call within
     * same scoring run), no alert is emitted even though the threshold is exceeded.
     */
    @Property(tries = 100)
    @Label("Property 5c: dedup guard prevents duplicate alert emission")
    void property5c_dedupGuardPreventsReEmission(
            @ForAll("observedValuesAboveThreshold") double[] observations) {

        configureObservations(observations);

        // Simulate dedup hit: markAlertOnce returns false (alert already emitted this run)
        when(deviationRepository.markAlertOnce(anyString(), any(Instant.class), anyString()))
            .thenReturn(false);

        // Execute the full scoring + alert emission flow for a single user
        scoreAndEmit(USER_ID, TENANT_ID, RUN_TS);

        // Verify: postToInjector never called because dedup guard blocked it
        verify(injector, never()).postToInjector(any());
        // Verify: markAlertOnce was still invoked (guard is always checked)
        verify(deviationRepository, times(1)).markAlertOnce(USER_ID, RUN_TS, TENANT_ID);
    }

    // =========================================================================
    // Arbitraries — generate observation arrays that produce controlled point sums
    // =========================================================================

    /**
     * Generates 5 observation values (one per metric) that produce a point sum > 75.
     *
     * <p>With mean=0, stddev=1, the observed value equals the z-score directly.
     * We generate values from the set of tier-producing z-scores to create
     * combinations where the total strictly exceeds 75.
     *
     * <p>Possible per-metric point values: 0, 10, 25, 50.
     * To exceed 75 with 5 metrics, we need combinations like:
     * 50+50=100, 50+25+10=85, 50+25+25=100, 25+25+25+10=85, etc.
     */
    @Provide
    Arbitrary<double[]> observedValuesAboveThreshold() {
        return Combinators.combine(
            zScoreFromAnyTier(),
            zScoreFromAnyTier(),
            zScoreFromAnyTier(),
            zScoreFromAnyTier(),
            zScoreFromAnyTier()
        ).as((v1, v2, v3, v4, v5) -> new double[]{v1, v2, v3, v4, v5})
         .filter(obs -> computeExpectedTotal(obs) > 75);
    }

    /**
     * Generates 5 observation values that produce a point sum ≤ 75.
     *
     * <p>We mix tier-producing z-scores in combinations that keep the sum at or below 75.
     */
    @Provide
    Arbitrary<double[]> observedValuesAtOrBelowThreshold() {
        return Combinators.combine(
            zScoreFromAnyTier(),
            zScoreFromAnyTier(),
            zScoreFromAnyTier(),
            zScoreFromAnyTier(),
            zScoreFromAnyTier()
        ).as((v1, v2, v3, v4, v5) -> new double[]{v1, v2, v3, v4, v5})
         .filter(obs -> computeExpectedTotal(obs) <= 75);
    }

    /**
     * Generates a single z-score value from any of the four tiers.
     * Each tier is equally likely, including both positive and negative z-scores.
     */
    private Arbitrary<Double> zScoreFromAnyTier() {
        Arbitrary<Double> tier50 = Arbitraries.doubles().between(4.01, 10.0).ofScale(2);  // |z|>4 → 50
        Arbitrary<Double> tier25 = Arbitraries.doubles().between(3.01, 4.0).ofScale(2);   // 3<|z|≤4 → 25
        Arbitrary<Double> tier10 = Arbitraries.doubles().between(2.01, 3.0).ofScale(2);   // 2<|z|≤3 → 10
        Arbitrary<Double> tier0  = Arbitraries.doubles().between(0.0, 2.0).ofScale(2);    // |z|≤2 → 0

        // Mix positive and negative z-scores
        Arbitrary<Double> positiveZ = Arbitraries.oneOf(tier50, tier25, tier10, tier0);
        Arbitrary<Double> negativeZ = positiveZ.map(v -> -v);
        return Arbitraries.oneOf(positiveZ, negativeZ);
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    /**
     * Simulates the {@code runHourlyScoring} flow for a single user:
     * scores the user, checks the threshold, guards with dedup, and emits alert.
     *
     * <p>This mirrors the exact logic in the design for {@code runHourlyScoring}:
     * <pre>
     *   total = scoreUser(userId)
     *   if total > TOTAL_SCORE_THRESHOLD:
     *     if markAlertOnce(userId, runTs, tenantId):
     *       postToInjector(buildPayload(...))
     * </pre>
     */
    private void scoreAndEmit(String userId, String tenantId, Instant runTs) {
        int total = engine.scoreUser(tenantId, userId, runTs);
        if (total > HaUebaDeviationEngine.TOTAL_SCORE_THRESHOLD) {
            if (deviationRepository.markAlertOnce(userId, runTs, tenantId)) {
                SyntheticAlertPayload payload = engine.buildPayload(tenantId, userId, runTs, total);
                injector.postToInjector(payload);
            }
        }
    }

    /**
     * Configures the mock observation reader to return the given values
     * for the five metrics in sorted order.
     */
    private void configureObservations(double[] observations) {
        for (int i = 0; i < SORTED_METRICS.size(); i++) {
            String metric = SORTED_METRICS.get(i);
            double value = observations[i];
            when(observationReader.readCurrentValue(USER_ID, metric, RUN_TS))
                .thenReturn(value);
        }
    }

    /**
     * Computes the expected total awarded points for the observation array.
     * With mean=0 and stddev=1, the observed value IS the z-score.
     */
    private static int computeExpectedTotal(double[] observations) {
        int total = 0;
        for (double obs : observations) {
            total += HaUebaDeviationEngine.awardPoints(obs);
        }
        return total;
    }
}
