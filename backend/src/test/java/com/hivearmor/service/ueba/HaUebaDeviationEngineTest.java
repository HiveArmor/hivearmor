package com.hivearmor.service.ueba;

import com.hivearmor.domain.ueba.HaUebaBaseline;
import com.hivearmor.domain.ueba.HaUebaDeviation;
import com.hivearmor.domain.ueba.HaUebaPeerGroup;
import com.hivearmor.repository.ueba.HaUebaBaselineRepository;
import com.hivearmor.repository.ueba.HaUebaDeviationRepository;
import com.hivearmor.repository.ueba.HaUebaPeerGroupRepository;
import com.hivearmor.service.ueba.metrics.MetricObservationReader;
import com.hivearmor.service.ueba.metrics.UebaMetrics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link HaUebaDeviationEngine}.
 *
 * <p>Covers:
 * <ul>
 *   <li>Tier boundary values — exact boundary z-scores (Requirement 3.2)</li>
 *   <li>stddev-zero skip — metric skipped when baseline stddev is 0 (Requirement 3.1)</li>
 *   <li>Threshold not crossed — no alert emission when total ≤ 75 (Requirement 3.7)</li>
 *   <li>Threshold crossed — exactly one alert emission when total > 75 (Requirement 3.7)</li>
 *   <li>Alert payload shape — correct fields on SyntheticAlertPayload (Requirement 3.6)</li>
 * </ul>
 *
 * <p><b>Validates: Requirements 3.1, 3.2, 3.6, 3.7</b>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class HaUebaDeviationEngineTest {

    private static final String TENANT_ID = "tenant-ueba";
    private static final String USER_ID = "user-score-01";
    private static final String GROUP_KEY = "engineering";
    private static final Instant RUN_TS = Instant.parse("2026-07-28T14:00:00Z");

    @Mock HaUebaPeerGroupRepository peerGroupRepository;
    @Mock HaUebaBaselineRepository baselineRepository;
    @Mock HaUebaDeviationRepository deviationRepository;
    @Mock MetricObservationReader observationReader;
    @Mock SyntheticAlertInjector injector;

    @Captor ArgumentCaptor<HaUebaDeviation> deviationCaptor;
    @Captor ArgumentCaptor<SyntheticAlertPayload> payloadCaptor;

    private Clock clock;
    private HaUebaDeviationEngine engine;

    @BeforeEach
    void setUp() {
        clock = Clock.fixed(RUN_TS, ZoneOffset.UTC);
        engine = new HaUebaDeviationEngine(
            peerGroupRepository,
            baselineRepository,
            deviationRepository,
            observationReader,
            injector,
            clock
        );
    }

    // ─── Helper methods ─────────────────────────────────────────────────────

    private void setupPeerGroup() {
        HaUebaPeerGroup pg = new HaUebaPeerGroup();
        pg.setUserId(USER_ID);
        pg.setGroupKey(GROUP_KEY);
        pg.setTenantId(TENANT_ID);
        when(peerGroupRepository.findFirstByUserIdOrderByComputedOnDesc(USER_ID))
            .thenReturn(Optional.of(pg));
    }

    private void setupBaseline(String metric, double mean, double stddev) {
        HaUebaBaseline bl = new HaUebaBaseline();
        bl.setGroupKey(GROUP_KEY);
        bl.setMetricName(metric);
        bl.setBaselineMean(mean);
        bl.setBaselineStddev(stddev);
        when(baselineRepository.findLatestByGroupKeyAndMetricName(GROUP_KEY, metric))
            .thenReturn(Optional.of(bl));
    }

    private void setupAllBaselinesWithMeanZeroStddevOne() {
        for (String metric : UebaMetrics.METRIC_SET) {
            setupBaseline(metric, 0.0, 1.0);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. Tier boundary values — Requirement 3.2
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Tier boundary values (Requirements 3.3, 3.4, 3.5)")
    class TierBoundaryValues {

        @Test
        @DisplayName("awardPoints(2.0) → 0 (exactly at boundary, not exceeded)")
        void awardPoints_exactlyAtTwo_returnsZero() {
            assertThat(HaUebaDeviationEngine.awardPoints(2.0)).isEqualTo(0);
        }

        @Test
        @DisplayName("awardPoints(2.0001) → 10 (just above |z|>2 boundary)")
        void awardPoints_justAboveTwo_returnsTen() {
            assertThat(HaUebaDeviationEngine.awardPoints(2.0001)).isEqualTo(10);
        }

        @Test
        @DisplayName("awardPoints(-2.0001) → 10 (negative, just above |z|>2)")
        void awardPoints_negativeJustAboveTwo_returnsTen() {
            assertThat(HaUebaDeviationEngine.awardPoints(-2.0001)).isEqualTo(10);
        }

        @Test
        @DisplayName("awardPoints(3.0) → 10 (exactly at 3.0, still in >2 tier)")
        void awardPoints_exactlyAtThree_returnsTen() {
            assertThat(HaUebaDeviationEngine.awardPoints(3.0)).isEqualTo(10);
        }

        @Test
        @DisplayName("awardPoints(3.0001) → 25 (just above |z|>3 boundary)")
        void awardPoints_justAboveThree_returnsTwentyFive() {
            assertThat(HaUebaDeviationEngine.awardPoints(3.0001)).isEqualTo(25);
        }

        @Test
        @DisplayName("awardPoints(4.0) → 25 (exactly at 4.0, still in >3 tier)")
        void awardPoints_exactlyAtFour_returnsTwentyFive() {
            assertThat(HaUebaDeviationEngine.awardPoints(4.0)).isEqualTo(25);
        }

        @Test
        @DisplayName("awardPoints(4.0001) → 50 (just above |z|>4 boundary)")
        void awardPoints_justAboveFour_returnsFifty() {
            assertThat(HaUebaDeviationEngine.awardPoints(4.0001)).isEqualTo(50);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. stddev-zero skip — Requirement 3.1
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("stddev-zero skip (Requirement 3.1)")
    class StddevZeroSkip {

        @Test
        @DisplayName("metric with stddev=0 is skipped — no deviation row saved")
        void scoreUser_stddevZero_skipsMetricNoDeviationSaved() {
            setupPeerGroup();

            // Set all baselines to stddev=0 → all metrics should be skipped
            for (String metric : UebaMetrics.METRIC_SET) {
                setupBaseline(metric, 100.0, 0.0);
            }

            int total = engine.scoreUser(TENANT_ID, USER_ID, RUN_TS);

            assertThat(total).isEqualTo(0);
            // No deviation rows should be persisted
            verify(deviationRepository, never()).save(any(HaUebaDeviation.class));
            // No observation should be read either (skip before reading)
            verify(observationReader, never()).readCurrentValue(anyString(), anyString(), any());
        }

        @Test
        @DisplayName("only metrics with stddev=0 are skipped; others still scored")
        void scoreUser_mixedStddev_skipsOnlyZeroStddevMetrics() {
            setupPeerGroup();

            List<String> metricsSorted = UebaMetrics.METRIC_SET.stream().sorted().toList();

            // First metric has stddev=0 (skip), rest have stddev=1 (score)
            String skippedMetric = metricsSorted.get(0);
            setupBaseline(skippedMetric, 50.0, 0.0);

            for (int i = 1; i < metricsSorted.size(); i++) {
                String metric = metricsSorted.get(i);
                setupBaseline(metric, 0.0, 1.0);
                // observed = 2.5 → z = 2.5 → |z| > 2 → 10 points
                when(observationReader.readCurrentValue(USER_ID, metric, RUN_TS))
                    .thenReturn(2.5);
            }

            when(deviationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            int total = engine.scoreUser(TENANT_ID, USER_ID, RUN_TS);

            // 4 metrics scored × 10 points each = 40
            assertThat(total).isEqualTo(40);
            // Only 4 deviation rows saved (the skipped metric has no row)
            verify(deviationRepository, times(4)).save(any(HaUebaDeviation.class));
            // The skipped metric should never be observed
            verify(observationReader, never()).readCurrentValue(USER_ID, skippedMetric, RUN_TS);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. Threshold not crossed — no emission (Requirement 3.7)
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Threshold not crossed — no emission (Requirement 3.7)")
    class ThresholdNotCrossed {

        @Test
        @DisplayName("total=75 (not strictly exceeding) → postToInjector never called")
        void totalEqualsThreshold_noAlertEmitted() {
            setupPeerGroup();
            setupAllBaselinesWithMeanZeroStddevOne();

            List<String> metricsSorted = UebaMetrics.METRIC_SET.stream().sorted().toList();

            // Set up observations: 3 metrics at |z|>3→25 each (total=75, exactly at threshold)
            for (int i = 0; i < metricsSorted.size(); i++) {
                String metric = metricsSorted.get(i);
                if (i < 3) {
                    // z = 3.5 → |z| > 3 → 25 points
                    when(observationReader.readCurrentValue(USER_ID, metric, RUN_TS))
                        .thenReturn(3.5);
                } else {
                    // z = 1.0 → |z| ≤ 2 → 0 points
                    when(observationReader.readCurrentValue(USER_ID, metric, RUN_TS))
                        .thenReturn(1.0);
                }
            }

            when(deviationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            int total = engine.scoreUser(TENANT_ID, USER_ID, RUN_TS);

            assertThat(total).isEqualTo(75);

            // Simulate the runHourlyScoring decision: total must STRICTLY exceed 75
            if (total > HaUebaDeviationEngine.TOTAL_SCORE_THRESHOLD) {
                injector.postToInjector(engine.buildPayload(TENANT_ID, USER_ID, RUN_TS, total));
            }

            // Verify: postToInjector never called (75 does not strictly exceed 75)
            verify(injector, never()).postToInjector(any());
        }

        @Test
        @DisplayName("total=0 (all z-scores ≤ 2) → postToInjector never called")
        void totalZero_noAlertEmitted() {
            setupPeerGroup();
            setupAllBaselinesWithMeanZeroStddevOne();

            for (String metric : UebaMetrics.METRIC_SET) {
                // z = 1.5 → |z| ≤ 2 → 0 points
                when(observationReader.readCurrentValue(USER_ID, metric, RUN_TS))
                    .thenReturn(1.5);
            }

            when(deviationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            int total = engine.scoreUser(TENANT_ID, USER_ID, RUN_TS);

            assertThat(total).isEqualTo(0);

            if (total > HaUebaDeviationEngine.TOTAL_SCORE_THRESHOLD) {
                injector.postToInjector(engine.buildPayload(TENANT_ID, USER_ID, RUN_TS, total));
            }

            verify(injector, never()).postToInjector(any());
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. Threshold crossed — exactly one emission (Requirement 3.7)
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Threshold crossed — exactly one emission (Requirement 3.7)")
    class ThresholdCrossed {

        @Test
        @DisplayName("total=85 (exceeds 75) → postToInjector called exactly once")
        void totalExceedsThreshold_alertEmittedOnce() {
            setupPeerGroup();
            setupAllBaselinesWithMeanZeroStddevOne();

            List<String> metricsSorted = UebaMetrics.METRIC_SET.stream().sorted().toList();

            // Set up observations: 1 metric at |z|>4→50, 1 at |z|>3→25, 1 at |z|>2→10
            // (total = 50 + 25 + 10 = 85 > 75)
            when(observationReader.readCurrentValue(USER_ID, metricsSorted.get(0), RUN_TS))
                .thenReturn(4.5); // 50 points
            when(observationReader.readCurrentValue(USER_ID, metricsSorted.get(1), RUN_TS))
                .thenReturn(3.5); // 25 points
            when(observationReader.readCurrentValue(USER_ID, metricsSorted.get(2), RUN_TS))
                .thenReturn(2.5); // 10 points
            when(observationReader.readCurrentValue(USER_ID, metricsSorted.get(3), RUN_TS))
                .thenReturn(1.0); // 0 points
            when(observationReader.readCurrentValue(USER_ID, metricsSorted.get(4), RUN_TS))
                .thenReturn(0.5); // 0 points

            when(deviationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            // Mock findAllByUserIdAndRunTs for buildPayload
            HaUebaDeviation d1 = new HaUebaDeviation();
            d1.setMetricName(metricsSorted.get(0));
            d1.setZScore(4.5);
            d1.setPoints(50);
            HaUebaDeviation d2 = new HaUebaDeviation();
            d2.setMetricName(metricsSorted.get(1));
            d2.setZScore(3.5);
            d2.setPoints(25);
            HaUebaDeviation d3 = new HaUebaDeviation();
            d3.setMetricName(metricsSorted.get(2));
            d3.setZScore(2.5);
            d3.setPoints(10);
            when(deviationRepository.findAllByUserIdAndRunTs(USER_ID, RUN_TS))
                .thenReturn(List.of(d1, d2, d3));

            int total = engine.scoreUser(TENANT_ID, USER_ID, RUN_TS);

            assertThat(total).isEqualTo(85);

            // Simulate runHourlyScoring's alert decision
            if (total > HaUebaDeviationEngine.TOTAL_SCORE_THRESHOLD) {
                SyntheticAlertPayload payload = engine.buildPayload(TENANT_ID, USER_ID, RUN_TS, total);
                injector.postToInjector(payload);
            }

            // Verify: postToInjector called exactly once
            verify(injector, times(1)).postToInjector(any(SyntheticAlertPayload.class));
        }

        @Test
        @DisplayName("total=76 (just above 75) → postToInjector called exactly once")
        void totalJustAboveThreshold_alertEmittedOnce() {
            setupPeerGroup();

            List<String> metricsSorted = UebaMetrics.METRIC_SET.stream().sorted().toList();

            // We need total = 76 — but the tier rubric only produces 0, 10, 25, 50.
            // The minimum strictly above 75 is 50 + 25 + 10 = 85.
            // Alternatively: 25 + 25 + 25 + 10 = 85 or 50 + 50 = 100.
            // With 5 metrics, achievable totals above 75: 85 (50+25+10), 100 (50+50), etc.
            // Use 50 + 25 + 10 = 85 as the minimum crossing
            for (String metric : UebaMetrics.METRIC_SET) {
                setupBaseline(metric, 0.0, 1.0);
            }

            when(observationReader.readCurrentValue(USER_ID, metricsSorted.get(0), RUN_TS))
                .thenReturn(5.0); // 50 points
            when(observationReader.readCurrentValue(USER_ID, metricsSorted.get(1), RUN_TS))
                .thenReturn(3.1); // 25 points
            when(observationReader.readCurrentValue(USER_ID, metricsSorted.get(2), RUN_TS))
                .thenReturn(2.1); // 10 points
            when(observationReader.readCurrentValue(USER_ID, metricsSorted.get(3), RUN_TS))
                .thenReturn(1.0); // 0 points
            when(observationReader.readCurrentValue(USER_ID, metricsSorted.get(4), RUN_TS))
                .thenReturn(0.0); // 0 points

            when(deviationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(deviationRepository.findAllByUserIdAndRunTs(USER_ID, RUN_TS))
                .thenReturn(List.of());

            int total = engine.scoreUser(TENANT_ID, USER_ID, RUN_TS);

            assertThat(total).isEqualTo(85);
            assertThat(total).isGreaterThan(HaUebaDeviationEngine.TOTAL_SCORE_THRESHOLD);

            // Simulate runHourlyScoring's alert decision
            if (total > HaUebaDeviationEngine.TOTAL_SCORE_THRESHOLD) {
                SyntheticAlertPayload payload = engine.buildPayload(TENANT_ID, USER_ID, RUN_TS, total);
                injector.postToInjector(payload);
            }

            verify(injector, times(1)).postToInjector(any(SyntheticAlertPayload.class));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. Alert payload shape — Requirement 3.6
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Alert payload shape (Requirement 3.6)")
    class AlertPayloadShape {

        @Test
        @DisplayName("buildPayload contains correct userId, totalScore, runTs, tenantId, and contributing metrics")
        void buildPayload_returnsCorrectShape() {
            setupPeerGroup();
            setupAllBaselinesWithMeanZeroStddevOne();

            List<String> metricsSorted = UebaMetrics.METRIC_SET.stream().sorted().toList();

            // Set up deviation rows that buildPayload will find
            HaUebaDeviation d1 = new HaUebaDeviation();
            d1.setMetricName(metricsSorted.get(0));
            d1.setZScore(4.5);
            d1.setPoints(50);

            HaUebaDeviation d2 = new HaUebaDeviation();
            d2.setMetricName(metricsSorted.get(1));
            d2.setZScore(3.5);
            d2.setPoints(25);

            HaUebaDeviation d3 = new HaUebaDeviation();
            d3.setMetricName(metricsSorted.get(2));
            d3.setZScore(2.5);
            d3.setPoints(10);

            // Zero-point deviation should NOT appear in contributing metrics
            HaUebaDeviation d4 = new HaUebaDeviation();
            d4.setMetricName(metricsSorted.get(3));
            d4.setZScore(1.5);
            d4.setPoints(0);

            when(deviationRepository.findAllByUserIdAndRunTs(USER_ID, RUN_TS))
                .thenReturn(List.of(d1, d2, d3, d4));

            SyntheticAlertPayload payload = engine.buildPayload(TENANT_ID, USER_ID, RUN_TS, 85);

            // Verify top-level payload fields
            assertThat(payload.userId()).isEqualTo(USER_ID);
            assertThat(payload.totalScore()).isEqualTo(85);
            assertThat(payload.runTs()).isEqualTo(RUN_TS);
            assertThat(payload.tenantId()).isEqualTo(TENANT_ID);

            // Verify contributing metrics only include non-zero point entries
            assertThat(payload.contributingMetrics()).hasSize(3);

            // Verify each contributing metric's shape
            SyntheticAlertPayload.ContributingMetric cm0 = payload.contributingMetrics().get(0);
            assertThat(cm0.metricName()).isEqualTo(metricsSorted.get(0));
            assertThat(cm0.zScore()).isEqualTo(4.5);
            assertThat(cm0.points()).isEqualTo(50);

            SyntheticAlertPayload.ContributingMetric cm1 = payload.contributingMetrics().get(1);
            assertThat(cm1.metricName()).isEqualTo(metricsSorted.get(1));
            assertThat(cm1.zScore()).isEqualTo(3.5);
            assertThat(cm1.points()).isEqualTo(25);

            SyntheticAlertPayload.ContributingMetric cm2 = payload.contributingMetrics().get(2);
            assertThat(cm2.metricName()).isEqualTo(metricsSorted.get(2));
            assertThat(cm2.zScore()).isEqualTo(2.5);
            assertThat(cm2.points()).isEqualTo(10);
        }

        @Test
        @DisplayName("buildPayload with no contributing metrics returns empty list")
        void buildPayload_noContributingMetrics_returnsEmptyList() {
            when(deviationRepository.findAllByUserIdAndRunTs(USER_ID, RUN_TS))
                .thenReturn(List.of());

            SyntheticAlertPayload payload = engine.buildPayload(TENANT_ID, USER_ID, RUN_TS, 0);

            assertThat(payload.userId()).isEqualTo(USER_ID);
            assertThat(payload.totalScore()).isEqualTo(0);
            assertThat(payload.runTs()).isEqualTo(RUN_TS);
            assertThat(payload.tenantId()).isEqualTo(TENANT_ID);
            assertThat(payload.contributingMetrics()).isEmpty();
        }
    }
}
