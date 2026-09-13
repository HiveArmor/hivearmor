package com.hivearmor.service.hunt.crosstab;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link CrosstabCostPolicy} clamping and {@link CrosstabMetrics} in-memory fallback.
 * Plain JUnit 5 + AssertJ, no Spring context.
 */
class CrosstabCostPolicyTest {

    @Test
    @DisplayName("row/col sizes clamp into [1, max]")
    void clampSizes() {
        CrosstabCostPolicy policy = new CrosstabCostPolicy();
        policy.setMaxRowMembers(50);
        policy.setMaxColMembers(30);

        assertThat(policy.clampRowSize(20)).isEqualTo(20);
        assertThat(policy.clampRowSize(0)).isEqualTo(1);
        assertThat(policy.clampRowSize(999)).isEqualTo(50);
        assertThat(policy.clampColSize(40)).isEqualTo(30);
        assertThat(policy.clampColSize(-5)).isEqualTo(1);
    }

    @Test
    @DisplayName("shard_size is max(size*factor, floor)")
    void shardSize() {
        CrosstabCostPolicy policy = new CrosstabCostPolicy();
        policy.setShardSizeFactor(4);
        policy.setShardSizeFloor(200);

        assertThat(policy.shardSizeFor(20)).isEqualTo(200);   // 80 < 200 -> floor
        assertThat(policy.shardSizeFor(100)).isEqualTo(400);  // 400 > 200 -> factor
    }

    @Test
    @DisplayName("feature flag defaults off")
    void flagDefaultsOff() {
        assertThat(new CrosstabCostPolicy().isEnabled()).isFalse();
    }

    @Test
    @DisplayName("metrics fall back to in-memory counters with no MeterRegistry")
    void metricsFallback() {
        CrosstabMetrics metrics = new CrosstabMetrics();
        metrics.recordRequest();
        metrics.recordRequest();
        metrics.recordPartial();
        metrics.recordTruncated();
        metrics.recordReturnedCells(12);
        metrics.recordReturnedCells(0); // ignored
        metrics.recordFailure();

        assertThat(metrics.getRequestCount()).isEqualTo(2);
        assertThat(metrics.getPartialCount()).isEqualTo(1);
        assertThat(metrics.getTruncatedCount()).isEqualTo(1);
        assertThat(metrics.getReturnedCellCount()).isEqualTo(12);
        assertThat(metrics.getFailureCount()).isEqualTo(1);
    }
}
