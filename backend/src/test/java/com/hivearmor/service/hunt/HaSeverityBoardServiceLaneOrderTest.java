package com.hivearmor.service.hunt;

import com.hivearmor.service.hunt.dto.AlertPreview;
import com.hivearmor.service.hunt.dto.SeverityLane;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests verifying the severity board always returns exactly 5 lanes
 * in the canonical order: critical, high, medium, low, info.
 *
 * <p>Tests the lane ordering invariant (Design Property 2) at the service level
 * without requiring an OpenSearch connection — exercises the static LANE_ORDER
 * constant and the lane-building logic from LaneAccumulator.
 *
 * <p>Sprint 37 — ALT-023 (Requirement 1.3, Task 1.13).
 */
@Tag("Feature: sprint-37-alert-advanced-contracts")
@DisplayName("HaSeverityBoardService — Lane Order Invariant")
class HaSeverityBoardServiceLaneOrderTest {

    private static final List<String> EXPECTED_ORDER = List.of(
        "critical", "high", "medium", "low", "info"
    );

    // =========================================================================
    // Test: LANE_ORDER constant matches expected severity ordering
    // =========================================================================

    @Test
    @DisplayName("LANE_ORDER contains exactly 5 lanes in critical→info order")
    void laneOrder_isExactly5LanesInCorrectOrder() {
        assertThat(HaSeverityBoardService.LANE_ORDER)
            .hasSize(5)
            .containsExactlyElementsOf(EXPECTED_ORDER);
    }

    // =========================================================================
    // Test: Lane building from accumulators produces 5 lanes in order
    // =========================================================================

    @Test
    @DisplayName("Lane building from accumulators produces 5 lanes in critical→info order")
    void laneBuilding_producesAllFiveLanesInOrder() {
        // Simulate accumulators with mixed data — only some lanes have alerts
        Map<String, HaSeverityBoardService.LaneAccumulator> accumulators = new LinkedHashMap<>();
        for (String lane : HaSeverityBoardService.LANE_ORDER) {
            accumulators.put(lane, new HaSeverityBoardService.LaneAccumulator());
        }

        // Populate only critical and medium with counts
        accumulators.get("critical").count = 15;
        accumulators.get("critical").activeCount = 12;
        accumulators.get("medium").count = 25;
        accumulators.get("medium").activeCount = 20;

        // Build lanes the same way the service does
        List<SeverityLane> lanes = HaSeverityBoardService.LANE_ORDER.stream()
            .map(laneLabel -> {
                HaSeverityBoardService.LaneAccumulator acc = accumulators.get(laneLabel);
                List<AlertPreview> alerts = HaSeverityBoardService.mapTopHitsToAlertPreviews(
                    acc.topHitsAggregates, 4);
                return new SeverityLane(laneLabel, acc.count, acc.activeCount,
                    acc.slaPressure, acc.unassigned, alerts);
            })
            .toList();

        assertThat(lanes).hasSize(5);
        assertThat(lanes.stream().map(SeverityLane::severity).toList())
            .containsExactlyElementsOf(EXPECTED_ORDER);
    }

    // =========================================================================
    // Test: Empty lanes still appear in the result
    // =========================================================================

    @Test
    @DisplayName("Lanes with zero alerts still appear in the result at their correct position")
    void emptyLanes_stillAppearInResult() {
        // All accumulators are empty (zero alerts for every severity)
        Map<String, HaSeverityBoardService.LaneAccumulator> accumulators = new LinkedHashMap<>();
        for (String lane : HaSeverityBoardService.LANE_ORDER) {
            accumulators.put(lane, new HaSeverityBoardService.LaneAccumulator());
        }

        List<SeverityLane> lanes = HaSeverityBoardService.LANE_ORDER.stream()
            .map(laneLabel -> {
                HaSeverityBoardService.LaneAccumulator acc = accumulators.get(laneLabel);
                List<AlertPreview> alerts = HaSeverityBoardService.mapTopHitsToAlertPreviews(
                    acc.topHitsAggregates, 4);
                return new SeverityLane(laneLabel, acc.count, acc.activeCount,
                    acc.slaPressure, acc.unassigned, alerts);
            })
            .toList();

        assertThat(lanes).hasSize(5);

        // Every lane exists with 0 count and empty alerts
        for (int i = 0; i < EXPECTED_ORDER.size(); i++) {
            SeverityLane lane = lanes.get(i);
            assertThat(lane.severity()).isEqualTo(EXPECTED_ORDER.get(i));
            assertThat(lane.count()).isZero();
            assertThat(lane.activeCount()).isZero();
            assertThat(lane.alerts()).isEmpty();
        }
    }

    // =========================================================================
    // Test: mapSeverityToLane correctly maps numeric values to lane labels
    // =========================================================================

    @Test
    @DisplayName("mapSeverityToLane maps numeric severity values to correct lane labels")
    void mapSeverityToLane_correctMapping() {
        // critical: >= 9
        assertThat(HaSeverityBoardService.mapSeverityToLane(9)).isEqualTo("critical");
        assertThat(HaSeverityBoardService.mapSeverityToLane(10)).isEqualTo("critical");
        assertThat(HaSeverityBoardService.mapSeverityToLane(15)).isEqualTo("critical");

        // high: 7-8
        assertThat(HaSeverityBoardService.mapSeverityToLane(7)).isEqualTo("high");
        assertThat(HaSeverityBoardService.mapSeverityToLane(8)).isEqualTo("high");

        // medium: 4-6
        assertThat(HaSeverityBoardService.mapSeverityToLane(4)).isEqualTo("medium");
        assertThat(HaSeverityBoardService.mapSeverityToLane(5)).isEqualTo("medium");
        assertThat(HaSeverityBoardService.mapSeverityToLane(6)).isEqualTo("medium");

        // low: 1-3
        assertThat(HaSeverityBoardService.mapSeverityToLane(1)).isEqualTo("low");
        assertThat(HaSeverityBoardService.mapSeverityToLane(2)).isEqualTo("low");
        assertThat(HaSeverityBoardService.mapSeverityToLane(3)).isEqualTo("low");

        // info: 0
        assertThat(HaSeverityBoardService.mapSeverityToLane(0)).isEqualTo("info");
    }

    // =========================================================================
    // Test: All mapped lane labels exist in LANE_ORDER (no orphans)
    // =========================================================================

    @Test
    @DisplayName("Every possible severity value maps to a lane that exists in LANE_ORDER")
    void allSeverityValues_mapToKnownLane() {
        // Test all severity values from 0 to 20
        for (int severity = 0; severity <= 20; severity++) {
            String lane = HaSeverityBoardService.mapSeverityToLane(severity);
            assertThat(HaSeverityBoardService.LANE_ORDER)
                .as("Severity %d should map to a known lane, got '%s'", severity, lane)
                .contains(lane);
        }
    }
}
