package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.web.rest.hunt.dto.HuntSearchRequestDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ComparisonWindow} — the previous-period window math for P2 comparison.
 * Pure logic (no OpenSearch), so it runs under the JUnit console launcher like the other crosstab tests.
 */
class ComparisonWindowTest {

    private HuntSearchRequestDTO.TimeRangeDTO range(String from, String to) {
        HuntSearchRequestDTO.TimeRangeDTO r = new HuntSearchRequestDTO.TimeRangeDTO();
        r.setFrom(from);
        r.setTo(to);
        return r;
    }

    @Test
    @DisplayName("previous_period shifts back by the window's own width")
    void previousPeriodShiftsByWidth() {
        // A 24h window → the comparison is the 24h immediately before it.
        var current = range("2026-09-08T00:00:00Z", "2026-09-09T00:00:00Z");
        var shifted = ComparisonWindow.shift(current, "previous_period", null);
        assertThat(shifted).isNotNull();
        assertThat(shifted.getFrom()).isEqualTo("2026-09-07T00:00:00Z");
        assertThat(shifted.getTo()).isEqualTo("2026-09-08T00:00:00Z");
    }

    @Test
    @DisplayName("previous_window shifts back by an explicit offset, preserving width")
    void previousWindowShiftsByOffset() {
        var current = range("2026-09-08T00:00:00Z", "2026-09-09T00:00:00Z");
        var shifted = ComparisonWindow.shift(current, "previous_window", "7d");
        assertThat(shifted).isNotNull();
        assertThat(shifted.getFrom()).isEqualTo("2026-09-01T00:00:00Z");
        assertThat(shifted.getTo()).isEqualTo("2026-09-02T00:00:00Z");
    }

    @Test
    @DisplayName("returns null for a non-absolute (relative) window instead of fabricating one")
    void relativeWindowYieldsNull() {
        var current = range("now-24h", "now");
        assertThat(ComparisonWindow.shift(current, "previous_period", null)).isNull();
    }

    @Test
    @DisplayName("returns null for a zero/inverted window and for a bad offset")
    void guardsBadInput() {
        assertThat(ComparisonWindow.shift(range("2026-09-09T00:00:00Z", "2026-09-08T00:00:00Z"), "previous_period", null)).isNull();
        assertThat(ComparisonWindow.shift(range("2026-09-08T00:00:00Z", "2026-09-09T00:00:00Z"), "previous_window", "nonsense")).isNull();
        assertThat(ComparisonWindow.shift(null, "previous_period", null)).isNull();
    }

    @Test
    @DisplayName("parseOffset understands s/m/h/d and rejects the rest")
    void parseOffsetUnits() {
        assertThat(ComparisonWindow.parseOffset("30m").toMinutes()).isEqualTo(30);
        assertThat(ComparisonWindow.parseOffset("2h").toHours()).isEqualTo(2);
        assertThat(ComparisonWindow.parseOffset("7d").toDays()).isEqualTo(7);
        assertThat(ComparisonWindow.parseOffset("5w")).isNull();
        assertThat(ComparisonWindow.parseOffset("d")).isNull();
    }
}
