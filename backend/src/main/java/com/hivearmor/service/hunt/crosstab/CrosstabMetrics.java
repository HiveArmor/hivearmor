package com.hivearmor.service.hunt.crosstab;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.Nullable;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Minimal telemetry for the Hunt Crosstab (Pivot) engine.
 *
 * <p>PR-A P1. Mirrors the {@code LlmUsageCounter} pattern: uses Micrometer when a
 * {@link MeterRegistry} bean is present; otherwise falls back to in-memory {@link AtomicLong}s so
 * plain unit tests can construct it with {@code new CrosstabMetrics()}.
 */
@Component
public class CrosstabMetrics {

    static final String METRIC_REQUESTS = "hivearmor.hunt.crosstab.requests";
    static final String METRIC_FAILURES = "hivearmor.hunt.crosstab.failures";
    static final String METRIC_PARTIAL = "hivearmor.hunt.crosstab.partial";
    static final String METRIC_TRUNCATED = "hivearmor.hunt.crosstab.truncated";
    static final String METRIC_RETURNED_CELLS = "hivearmor.hunt.crosstab.returned.cells";
    static final String METRIC_COMPARISON = "hivearmor.hunt.crosstab.comparison";
    static final String METRIC_SIGNIFICANCE = "hivearmor.hunt.crosstab.significance";

    private final AtomicLong requests = new AtomicLong();
    private final AtomicLong failures = new AtomicLong();
    private final AtomicLong partial = new AtomicLong();
    private final AtomicLong truncated = new AtomicLong();
    private final AtomicLong returnedCells = new AtomicLong();
    private final AtomicLong comparison = new AtomicLong();
    private final AtomicLong significance = new AtomicLong();

    @Nullable private final Counter micrometerRequests;
    @Nullable private final Counter micrometerFailures;
    @Nullable private final Counter micrometerPartial;
    @Nullable private final Counter micrometerTruncated;
    @Nullable private final Counter micrometerReturnedCells;
    @Nullable private final Counter micrometerComparison;
    @Nullable private final Counter micrometerSignificance;

    /** In-memory-only counter (tests / no MeterRegistry). */
    public CrosstabMetrics() {
        this(null);
    }

    public CrosstabMetrics(@Nullable MeterRegistry meterRegistry) {
        if (meterRegistry != null) {
            this.micrometerRequests = Counter.builder(METRIC_REQUESTS)
                .description("Hunt crosstab requests").register(meterRegistry);
            this.micrometerFailures = Counter.builder(METRIC_FAILURES)
                .description("Hunt crosstab failures").register(meterRegistry);
            this.micrometerPartial = Counter.builder(METRIC_PARTIAL)
                .description("Hunt crosstab responses with partial results").register(meterRegistry);
            this.micrometerTruncated = Counter.builder(METRIC_TRUNCATED)
                .description("Hunt crosstab responses with a truncated axis").register(meterRegistry);
            this.micrometerReturnedCells = Counter.builder(METRIC_RETURNED_CELLS)
                .description("Total non-zero cells returned by hunt crosstab").register(meterRegistry);
            this.micrometerComparison = Counter.builder(METRIC_COMPARISON)
                .description("Hunt crosstab responses that ran a previous-period comparison").register(meterRegistry);
            this.micrometerSignificance = Counter.builder(METRIC_SIGNIFICANCE)
                .description("Hunt crosstab responses that computed significant-combination residuals").register(meterRegistry);
        } else {
            this.micrometerRequests = null;
            this.micrometerFailures = null;
            this.micrometerPartial = null;
            this.micrometerTruncated = null;
            this.micrometerReturnedCells = null;
            this.micrometerComparison = null;
            this.micrometerSignificance = null;
        }
    }

    public void recordRequest() {
        requests.incrementAndGet();
        if (micrometerRequests != null) micrometerRequests.increment();
    }

    public void recordFailure() {
        failures.incrementAndGet();
        if (micrometerFailures != null) micrometerFailures.increment();
    }

    public void recordPartial() {
        partial.incrementAndGet();
        if (micrometerPartial != null) micrometerPartial.increment();
    }

    public void recordTruncated() {
        truncated.incrementAndGet();
        if (micrometerTruncated != null) micrometerTruncated.increment();
    }

    public void recordReturnedCells(long cells) {
        if (cells <= 0) return;
        returnedCells.addAndGet(cells);
        if (micrometerReturnedCells != null) micrometerReturnedCells.increment(cells);
    }

    public void recordComparison() {
        comparison.incrementAndGet();
        if (micrometerComparison != null) micrometerComparison.increment();
    }

    public void recordSignificance() {
        significance.incrementAndGet();
        if (micrometerSignificance != null) micrometerSignificance.increment();
    }

    public long getRequestCount() { return requests.get(); }
    public long getFailureCount() { return failures.get(); }
    public long getPartialCount() { return partial.get(); }
    public long getTruncatedCount() { return truncated.get(); }
    public long getReturnedCellCount() { return returnedCells.get(); }
    public long getComparisonCount() { return comparison.get(); }
    public long getSignificanceCount() { return significance.get(); }
}
