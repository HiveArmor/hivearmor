package com.hivearmor.service.hunt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link HaSeverityBoardService#mapSeverityToLane(int)}.
 *
 * <p>Validates the numeric severity → lane label mapping:
 * <ul>
 *   <li>severity >= 9 → "critical"</li>
 *   <li>severity 7–8 → "high"</li>
 *   <li>severity 4–6 → "medium"</li>
 *   <li>severity 1–3 → "low"</li>
 *   <li>severity 0 (or negative) → "info"</li>
 * </ul>
 *
 * <p>Sprint 37 — ALT-023 (Task 1.3).
 */
class HaSeverityBoardServiceMapSeverityTest {

    // =========================================================================
    // Boundary and range tests
    // =========================================================================

    @ParameterizedTest(name = "severity {0} → \"{1}\"")
    @DisplayName("mapSeverityToLane maps numeric severity to correct lane label")
    @CsvSource({
        "0, info",
        "1, low",
        "2, low",
        "3, low",
        "4, medium",
        "5, medium",
        "6, medium",
        "7, high",
        "8, high",
        "9, critical",
        "10, critical"
    })
    void mapSeverityToLane_standardValues(int severity, String expectedLane) {
        assertThat(HaSeverityBoardService.mapSeverityToLane(severity))
            .isEqualTo(expectedLane);
    }

    @Test
    @DisplayName("mapSeverityToLane — severity above 10 maps to critical")
    void mapSeverityToLane_aboveTen_critical() {
        assertThat(HaSeverityBoardService.mapSeverityToLane(11)).isEqualTo("critical");
        assertThat(HaSeverityBoardService.mapSeverityToLane(15)).isEqualTo("critical");
        assertThat(HaSeverityBoardService.mapSeverityToLane(100)).isEqualTo("critical");
    }

    @Test
    @DisplayName("mapSeverityToLane — negative severity maps to info")
    void mapSeverityToLane_negative_info() {
        assertThat(HaSeverityBoardService.mapSeverityToLane(-1)).isEqualTo("info");
        assertThat(HaSeverityBoardService.mapSeverityToLane(-5)).isEqualTo("info");
    }

    // =========================================================================
    // Boundary value tests (edges of each range)
    // =========================================================================

    @Test
    @DisplayName("mapSeverityToLane — boundary between info and low is at 1")
    void mapSeverityToLane_boundary_infoLow() {
        assertThat(HaSeverityBoardService.mapSeverityToLane(0)).isEqualTo("info");
        assertThat(HaSeverityBoardService.mapSeverityToLane(1)).isEqualTo("low");
    }

    @Test
    @DisplayName("mapSeverityToLane — boundary between low and medium is at 4")
    void mapSeverityToLane_boundary_lowMedium() {
        assertThat(HaSeverityBoardService.mapSeverityToLane(3)).isEqualTo("low");
        assertThat(HaSeverityBoardService.mapSeverityToLane(4)).isEqualTo("medium");
    }

    @Test
    @DisplayName("mapSeverityToLane — boundary between medium and high is at 7")
    void mapSeverityToLane_boundary_mediumHigh() {
        assertThat(HaSeverityBoardService.mapSeverityToLane(6)).isEqualTo("medium");
        assertThat(HaSeverityBoardService.mapSeverityToLane(7)).isEqualTo("high");
    }

    @Test
    @DisplayName("mapSeverityToLane — boundary between high and critical is at 9")
    void mapSeverityToLane_boundary_highCritical() {
        assertThat(HaSeverityBoardService.mapSeverityToLane(8)).isEqualTo("high");
        assertThat(HaSeverityBoardService.mapSeverityToLane(9)).isEqualTo("critical");
    }
}
