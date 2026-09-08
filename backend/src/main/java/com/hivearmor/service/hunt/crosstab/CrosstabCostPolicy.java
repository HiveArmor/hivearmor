package com.hivearmor.service.hunt.crosstab;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Cost / guardrail policy for the Hunt Crosstab (Pivot) engine, bound from {@code app.hunt.crosstab.*}.
 *
 * <p>PR-A P1. Setter-bound JavaBean registered as a {@link Component}, matching the house
 * {@code AppProperties} style. All limits are config-driven so they can be tuned from the
 * benchmark track without a code change.
 *
 * <p><b>No {@code terminateAfter}.</b> Intentionally stopping document collection after N matching
 * documents would silently turn a "computed over the full matched set" crosstab into a partial one,
 * breaking the product contract. The guardrails here bound how many members / cells we compute and
 * how long we wait, never how much of the matched set is counted.
 */
@Component
@ConfigurationProperties(prefix = "app.hunt.crosstab")
public class CrosstabCostPolicy {

    /** Master feature flag for the crosstab endpoint (P1 ships behind this, off by default). */
    private boolean enabled = false;

    /** Hard cap on selected row members (Top-N). Requested rowSize is clamped to [1, this]. */
    private int maxRowMembers = 50;

    /** Hard cap on selected column members (Top-N). Requested colSize is clamped to [1, this]. */
    private int maxColMembers = 50;

    /** Ceiling on returned cells (rowMembers * colMembers) — bounds the matrix bucket count. */
    private int maxCells = 2500;

    /**
     * Per-axis cardinality estimate above which the UI shows a high-cardinality confirm. Advisory —
     * surfaced to the client; the server still clamps to the member caps regardless.
     */
    private long highCardinalityWarn = 10_000L;

    /** OpenSearch request timeout applied to both stage searches (string form, e.g. "30s"). */
    private String requestTimeout = "30s";

    /**
     * {@code shard_size} used for the distributed-terms axis discovery, to reduce the top-N
     * merge error. Applied as {@code max(size * shardSizeFactor, shardSizeFloor)}.
     */
    private int shardSizeFactor = 4;

    private int shardSizeFloor = 200;

    /**
     * HyperLogLog++ {@code precision_threshold} for distinct-count cardinality aggregations.
     * Higher = more accurate + more memory. Tune from the benchmark track; 0 = client default.
     */
    private int precisionThreshold = 3000;

    /**
     * Allowed fixed date-histogram intervals for a bucketed axis (P1.1). A request outside this list
     * is rejected by the validator. Kept small and coarse to bound the bucket count.
     */
    private java.util.List<String> allowedBucketIntervals =
        new java.util.ArrayList<>(java.util.List.of("1m", "5m", "15m", "30m", "1h", "3h", "12h", "1d", "7d"));

    /** Hard ceiling on date-histogram buckets per axis — bucket-explosion guard (e.g. 1m over 90d). */
    private int maxBuckets = 500;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public int getMaxRowMembers() { return maxRowMembers; }
    public void setMaxRowMembers(int maxRowMembers) { this.maxRowMembers = maxRowMembers; }

    public int getMaxColMembers() { return maxColMembers; }
    public void setMaxColMembers(int maxColMembers) { this.maxColMembers = maxColMembers; }

    public int getMaxCells() { return maxCells; }
    public void setMaxCells(int maxCells) { this.maxCells = maxCells; }

    public long getHighCardinalityWarn() { return highCardinalityWarn; }
    public void setHighCardinalityWarn(long highCardinalityWarn) { this.highCardinalityWarn = highCardinalityWarn; }

    public String getRequestTimeout() { return requestTimeout; }
    public void setRequestTimeout(String requestTimeout) { this.requestTimeout = requestTimeout; }

    public int getShardSizeFactor() { return shardSizeFactor; }
    public void setShardSizeFactor(int shardSizeFactor) { this.shardSizeFactor = shardSizeFactor; }

    public int getShardSizeFloor() { return shardSizeFloor; }
    public void setShardSizeFloor(int shardSizeFloor) { this.shardSizeFloor = shardSizeFloor; }

    public int getPrecisionThreshold() { return precisionThreshold; }
    public void setPrecisionThreshold(int precisionThreshold) { this.precisionThreshold = precisionThreshold; }

    public java.util.List<String> getAllowedBucketIntervals() { return allowedBucketIntervals; }
    public void setAllowedBucketIntervals(java.util.List<String> allowedBucketIntervals) { this.allowedBucketIntervals = allowedBucketIntervals; }

    public int getMaxBuckets() { return maxBuckets; }
    public void setMaxBuckets(int maxBuckets) { this.maxBuckets = maxBuckets; }

    /** True if the requested date-histogram interval is on the allow-list (case-insensitive). */
    public boolean isAllowedInterval(String interval) {
        if (interval == null) return false;
        String norm = interval.trim().toLowerCase(java.util.Locale.ROOT);
        return allowedBucketIntervals.stream().anyMatch(a -> a.equalsIgnoreCase(norm));
    }

    /** Clamp a requested row-member size into [1, maxRowMembers]. */
    public int clampRowSize(int requested) {
        return Math.max(1, Math.min(requested, maxRowMembers));
    }

    /** Clamp a requested column-member size into [1, maxColMembers]. */
    public int clampColSize(int requested) {
        return Math.max(1, Math.min(requested, maxColMembers));
    }

    /** shard_size for an axis, given the clamped member size. */
    public int shardSizeFor(int memberSize) {
        return Math.max(memberSize * shardSizeFactor, shardSizeFloor);
    }
}
