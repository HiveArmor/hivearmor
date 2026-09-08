package com.hivearmor.web.rest.hunt.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Request DTO for {@code POST /api/ha-hunts/search/crosstab} (Pivot view — server-side crosstab
 * over the full pivot-eligible matched set).
 *
 * <p>PR-A P1. Flat by design: exactly one Rows field, one Columns field, one measure (count or
 * distinct). The query / language / timeRange / tenantScope carry the SAME meaning as
 * {@link HuntSearchRequestDTO}, so the crosstab reuses the identical query-build path.
 *
 * <p><b>Index scope is a LOGICAL type</b> ({@code all|log|event|alert}), never a raw index
 * wildcard: the server resolves physical indices via {@code resolveIndices} + {@code MsspIndexResolver}
 * under {@code TenantContext}, so tenant isolation is identical to Search and the client cannot
 * inject an index string.
 *
 * <p>POJO (getters/setters) to match the existing hunt DTO style — not a record.
 */
public class HuntCrosstabRequestDTO {

    @NotNull
    private String query;

    @NotNull
    private String language = "kql";

    @NotNull
    @Valid
    private HuntSearchRequestDTO.TimeRangeDTO timeRange;

    @NotNull
    private String tenantScope = "authorized";

    /** Logical index type: all | log | event | alert. NOT a raw index wildcard. */
    @NotNull
    private String indexType = "all";

    @NotNull
    private String rowField;

    @NotNull
    private String colField;

    /** "count" | "distinct". */
    @NotNull
    private String valueFn = "count";

    /** Required iff valueFn == "distinct". */
    private String distinctField;

    @Min(1)
    @Max(50)
    private int rowSize = 20;

    @Min(1)
    @Max(50)
    private int colSize = 20;

    /** Optional date-histogram bucketing for the Rows axis (P1.1). Null = TERM axis. */
    private BucketDTO rowBucket;

    /** Optional date-histogram bucketing for the Columns axis (P1.1). Null = TERM axis. */
    private BucketDTO colBucket;

    /** How events missing the Rows field are handled: "omit" (default) | "include" ((missing) bucket). */
    private String rowMissing = "omit";

    /** How events missing the Columns field are handled: "omit" (default) | "include". */
    private String colMissing = "omit";

    /** P2: optional previous-period comparison. Null = no comparison (response is unchanged). */
    private ComparisonDTO comparison;

    /** P2 comparison request: which prior window to compare against. */
    public static class ComparisonDTO {
        /**
         * "previous_period" (default) shifts the window back by its own width; "previous_window" shifts
         * by an explicit {@code offset} (e.g. "7d" for week-over-week).
         */
        private String mode = "previous_period";
        /** Explicit shift for "previous_window", e.g. "7d". Ignored for "previous_period". */
        private String offset;
        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }
        public String getOffset() { return offset; }
        public void setOffset(String offset) { this.offset = offset; }
    }

    /** Fixed-interval date-histogram bucket spec for an axis. */
    public static class BucketDTO {
        /** Fixed interval, e.g. "1m", "5m", "1h", "1d". Validated against the allow-list. */
        private String interval;
        /** Optional IANA timezone; null = UTC. */
        private String timezone;

        public String getInterval() { return interval; }
        public void setInterval(String interval) { this.interval = interval; }

        public String getTimezone() { return timezone; }
        public void setTimezone(String timezone) { this.timezone = timezone; }
    }

    public String getQuery() { return query; }
    public void setQuery(String query) { this.query = query; }

    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }

    public HuntSearchRequestDTO.TimeRangeDTO getTimeRange() { return timeRange; }
    public void setTimeRange(HuntSearchRequestDTO.TimeRangeDTO timeRange) { this.timeRange = timeRange; }

    public String getTenantScope() { return tenantScope; }
    public void setTenantScope(String tenantScope) { this.tenantScope = tenantScope; }

    public String getIndexType() { return indexType; }
    public void setIndexType(String indexType) { this.indexType = indexType; }

    public String getRowField() { return rowField; }
    public void setRowField(String rowField) { this.rowField = rowField; }

    public String getColField() { return colField; }
    public void setColField(String colField) { this.colField = colField; }

    public String getValueFn() { return valueFn; }
    public void setValueFn(String valueFn) { this.valueFn = valueFn; }

    public String getDistinctField() { return distinctField; }
    public void setDistinctField(String distinctField) { this.distinctField = distinctField; }

    public int getRowSize() { return rowSize; }
    public void setRowSize(int rowSize) { this.rowSize = rowSize; }

    public int getColSize() { return colSize; }
    public void setColSize(int colSize) { this.colSize = colSize; }

    public BucketDTO getRowBucket() { return rowBucket; }
    public void setRowBucket(BucketDTO rowBucket) { this.rowBucket = rowBucket; }

    public BucketDTO getColBucket() { return colBucket; }
    public void setColBucket(BucketDTO colBucket) { this.colBucket = colBucket; }

    public String getRowMissing() { return rowMissing; }
    public void setRowMissing(String rowMissing) { this.rowMissing = rowMissing; }

    public String getColMissing() { return colMissing; }
    public void setColMissing(String colMissing) { this.colMissing = colMissing; }

    public ComparisonDTO getComparison() { return comparison; }
    public void setComparison(ComparisonDTO comparison) { this.comparison = comparison; }
}
