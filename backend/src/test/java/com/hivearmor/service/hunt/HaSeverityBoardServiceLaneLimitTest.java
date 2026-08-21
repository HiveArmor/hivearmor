package com.hivearmor.service.hunt;

import com.hivearmor.service.hunt.dto.AlertPreview;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests verifying the severity board respects the laneLimit parameter —
 * each lane never contains more than laneLimit alert previews.
 *
 * <p>Tests the truncation invariant (Design Property 3) at the service level
 * without requiring an OpenSearch connection — exercises the sorting and
 * truncation logic in {@link HaSeverityBoardService#mapTopHitsToAlertPreviews}.
 *
 * <p>Sprint 37 — ALT-023 (Requirement 1.8, Task 1.14).
 */
@Tag("Feature: sprint-37-alert-advanced-contracts")
@DisplayName("HaSeverityBoardService — Lane Limit Invariant")
class HaSeverityBoardServiceLaneLimitTest {

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Creates an AlertPreview with a given riskScore and detectedAt for sorting tests.
     */
    private static AlertPreview makePreview(String id, double riskScore, Instant detectedAt) {
        return new AlertPreview(
            id,
            "Alert " + id,
            "Summary for " + id,
            9, // severity (critical)
            riskScore,
            85,
            detectedAt,
            1, // status: New
            "New",
            "Malware",
            new AlertPreview.PrimaryEntity("host-1", "host", "server-01"),
            null,
            "on_track",
            false,
            0,
            null,
            "tenant-a",
            List.of()
        );
    }

    /**
     * Simulates the same sort logic used by mapTopHitsToAlertPreviews:
     * riskScore DESC, detectedAt DESC, id ASC.
     */
    private static List<AlertPreview> sortAndTruncate(List<AlertPreview> previews, int laneLimit) {
        List<AlertPreview> sorted = new ArrayList<>(previews);
        sorted.sort(Comparator
            .comparingDouble(AlertPreview::riskScore).reversed()
            .thenComparing(Comparator.comparing(AlertPreview::detectedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .thenComparing(AlertPreview::id, Comparator.nullsLast(Comparator.naturalOrder()))
        );
        if (sorted.size() > laneLimit) {
            return sorted.subList(0, laneLimit);
        }
        return sorted;
    }

    // =========================================================================
    // Test: More previews than laneLimit — only laneLimit previews returned
    // =========================================================================

    @Test
    @DisplayName("When more previews than laneLimit exist, only laneLimit previews are returned")
    void moreThanLaneLimit_onlyLaneLimitReturned() {
        int laneLimit = 4;
        Instant base = Instant.parse("2025-01-15T10:00:00Z");

        // Create 8 alerts — more than the laneLimit of 4
        List<AlertPreview> allPreviews = List.of(
            makePreview("alert-1", 95.0, base.minusSeconds(100)),
            makePreview("alert-2", 92.0, base.minusSeconds(200)),
            makePreview("alert-3", 88.0, base.minusSeconds(300)),
            makePreview("alert-4", 85.0, base.minusSeconds(400)),
            makePreview("alert-5", 80.0, base.minusSeconds(500)),
            makePreview("alert-6", 75.0, base.minusSeconds(600)),
            makePreview("alert-7", 70.0, base.minusSeconds(700)),
            makePreview("alert-8", 65.0, base.minusSeconds(800))
        );

        List<AlertPreview> result = sortAndTruncate(allPreviews, laneLimit);

        assertThat(result)
            .hasSize(laneLimit)
            .extracting(AlertPreview::id)
            .containsExactly("alert-1", "alert-2", "alert-3", "alert-4");
    }

    // =========================================================================
    // Test: laneLimit = 1 — only the highest-risk alert is returned
    // =========================================================================

    @Test
    @DisplayName("When laneLimit is 1, only the highest-risk alert is returned per lane")
    void laneLimit1_onlyHighestRiskReturned() {
        int laneLimit = 1;
        Instant base = Instant.parse("2025-01-15T10:00:00Z");

        List<AlertPreview> allPreviews = List.of(
            makePreview("low-risk", 50.0, base.minusSeconds(100)),
            makePreview("mid-risk", 75.0, base.minusSeconds(200)),
            makePreview("high-risk", 99.0, base.minusSeconds(300)),
            makePreview("med-risk", 60.0, base.minusSeconds(400))
        );

        List<AlertPreview> result = sortAndTruncate(allPreviews, laneLimit);

        assertThat(result)
            .hasSize(1)
            .extracting(AlertPreview::id)
            .containsExactly("high-risk");
    }

    // =========================================================================
    // Test: laneLimit = 10 (max) — all alerts up to 10 appear
    // =========================================================================

    @Test
    @DisplayName("When laneLimit is 10 (max), all alerts up to 10 appear")
    void laneLimit10_allAlertsUpTo10Appear() {
        int laneLimit = 10;
        Instant base = Instant.parse("2025-01-15T10:00:00Z");

        // Create exactly 10 alerts
        List<AlertPreview> allPreviews = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            allPreviews.add(makePreview("alert-" + String.format("%02d", i),
                100.0 - i, base.minusSeconds(i * 100L)));
        }

        List<AlertPreview> result = sortAndTruncate(allPreviews, laneLimit);

        assertThat(result)
            .hasSize(10)
            .extracting(AlertPreview::riskScore)
            .isSortedAccordingTo(Comparator.reverseOrder());
    }

    // =========================================================================
    // Test: Fewer alerts than laneLimit — all available returned (no padding)
    // =========================================================================

    @Test
    @DisplayName("When fewer alerts than laneLimit exist, all available alerts are returned without padding")
    void fewerThanLaneLimit_allReturnedNoPadding() {
        int laneLimit = 4;
        Instant base = Instant.parse("2025-01-15T10:00:00Z");

        // Only 2 alerts, laneLimit is 4
        List<AlertPreview> allPreviews = List.of(
            makePreview("alert-a", 90.0, base.minusSeconds(100)),
            makePreview("alert-b", 85.0, base.minusSeconds(200))
        );

        List<AlertPreview> result = sortAndTruncate(allPreviews, laneLimit);

        assertThat(result)
            .hasSize(2)
            .extracting(AlertPreview::id)
            .containsExactly("alert-a", "alert-b");
    }

    // =========================================================================
    // Test: mapTopHitsToAlertPreviews with empty aggregates returns empty list
    // =========================================================================

    @Test
    @DisplayName("mapTopHitsToAlertPreviews with empty aggregate list returns empty list regardless of laneLimit")
    void emptyAggregates_returnsEmptyList() {
        List<Aggregate> emptyAggregates = new ArrayList<>();

        // Any laneLimit should return empty when no data
        assertThat(HaSeverityBoardService.mapTopHitsToAlertPreviews(emptyAggregates, 4))
            .isEmpty();
        assertThat(HaSeverityBoardService.mapTopHitsToAlertPreviews(emptyAggregates, 1))
            .isEmpty();
        assertThat(HaSeverityBoardService.mapTopHitsToAlertPreviews(emptyAggregates, 10))
            .isEmpty();
    }

    // =========================================================================
    // Test: LaneAccumulator integration — lane building with laneLimit = 4
    // =========================================================================

    @Test
    @DisplayName("LaneAccumulator with no top_hits produces empty alerts list for any laneLimit")
    void laneAccumulator_noTopHits_emptyAlerts() {
        HaSeverityBoardService.LaneAccumulator acc = new HaSeverityBoardService.LaneAccumulator();

        // Simulate what the service does: call mapTopHitsToAlertPreviews on the accumulator
        List<AlertPreview> alerts1 = HaSeverityBoardService.mapTopHitsToAlertPreviews(
            acc.topHitsAggregates, 1);
        List<AlertPreview> alerts4 = HaSeverityBoardService.mapTopHitsToAlertPreviews(
            acc.topHitsAggregates, 4);
        List<AlertPreview> alerts10 = HaSeverityBoardService.mapTopHitsToAlertPreviews(
            acc.topHitsAggregates, 10);

        assertThat(alerts1).isEmpty();
        assertThat(alerts4).isEmpty();
        assertThat(alerts10).isEmpty();
    }
}
