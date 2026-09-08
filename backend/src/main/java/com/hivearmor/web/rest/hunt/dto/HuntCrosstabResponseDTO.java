package com.hivearmor.web.rest.hunt.dto;

import com.hivearmor.web.rest.hunt.dto.HuntSearchResponseDTO.PartialFailureDTO;

import java.util.List;

/**
 * Response DTO for {@code POST /api/ha-hunts/search/crosstab}.
 *
 * <p>PR-A P1. Semantically honest by construction:
 * <ul>
 *   <li><b>Scope</b>: {@code totalMatched} = all hunt matches; {@code pivotEligibleMatched} = events
 *       with BOTH axis fields present (the real crosstab denominator under MissingMode.OMIT).</li>
 *   <li><b>Three independent approximation concepts</b>: {@code axisSelection.approximate} (how the
 *       row/column MEMBERS were selected — always true in P1, distributed terms) is distinct from
 *       {@code measure.approximate} (whether the VALUES are approximate — false for count, true for
 *       distinct) which is distinct from {@code status} (COMPLETE/PARTIAL execution health).</li>
 *   <li><b>Totals</b> are computed at their own aggregation scope and are NOT summed from cells:
 *       {@code totalSemantics.additive} is false for both measures (multi-valued fields legitimately
 *       break additivity).</li>
 * </ul>
 *
 * <p>POJO (getters/setters) to match the existing hunt DTO style — not a record.
 */
public class HuntCrosstabResponseDTO {

    /** Throwaway label ("HUNT-XT-xxxxxxxx"), NOT a snapshot/session id. */
    private String searchId;

    /** ISO timestamp; labelled "computed at", never "snapshot at" (aggregate path uses no PIT). */
    private String computedAt;

    /** All events matching the hunt (context only). */
    private long totalMatched;

    /** Events eligible to participate in this crosstab (both axis fields present). Grand COUNT total. */
    private long pivotEligibleMatched;

    /** hits.total relation for totalMatched: "eq" or "gte". */
    private String totalRelation;

    private MetricDTO measure;

    /** Row member keys, ordered by the preflight measure. */
    private List<String> rowKeys;

    /** Column member keys, ordered by the preflight measure. */
    private List<String> colKeys;

    /** Sparse non-zero cells. */
    private List<CellDTO> cells;

    /** Row totals, aligned to rowKeys (own-scope; never summed from cells). */
    private List<Long> rowTotals;

    /** Column totals, aligned to colKeys (own-scope; never summed from cells). */
    private List<Long> colTotals;

    /** Grand total: COUNT = pivotEligibleMatched; DISTINCT = eligible-scope cardinality (approx). */
    private long grandTotal;

    private TotalSemanticsDTO totalSemantics;

    private boolean rowTruncated;
    private boolean colTruncated;

    /** Approximate distinct-value counts of the axis fields (drives truncation + high-card confirm). */
    private long rowCardinalityEstimate;
    private long colCardinalityEstimate;

    /** Axis cardinality is always approximate (HyperLogLog++). */
    private boolean cardinalityApproximate = true;

    /** P1.1: whether each axis is a date_histogram, and its interval (so the FE renders time labels). */
    private boolean rowBucketed;
    private boolean colBucketed;
    private String rowBucketInterval;
    private String colBucketInterval;

    /** P1.1: whether each axis includes a (missing) bucket, and the sentinel key the FE renders as "(no value)". */
    private boolean rowHasMissingBucket;
    private boolean colHasMissingBucket;
    private String missingKey;

    /** P1.1: whether each axis field is multi-valued (array) — cells may exceed the total legitimately. */
    private boolean rowMultiValued;
    private boolean colMultiValued;

    /** P2: describes the previous-period comparison when requested (null otherwise). */
    private ComparisonDTO comparison;

    /**
     * P2 Strand B: per-row UEBA deviation, aligned index-for-index with {@code rowKeys}. Only populated
     * when the ROW axis is a UEBA-scored entity (user.name) AND that user has a real deviation; every
     * other entry is null. NEVER an invented score — this mirrors the existing z-score, or is absent.
     */
    private List<DeviationDTO> rowDeviations;

    /** P2 Strand B deviation marker: the user's most-anomalous UEBA metric + its z-score (real, from HaUebaDeviationEngine). */
    public static class DeviationDTO {
        private String metric;
        private double zScore;
        public DeviationDTO() {}
        public DeviationDTO(String metric, double zScore) { this.metric = metric; this.zScore = zScore; }
        public String getMetric() { return metric; }
        public void setMetric(String metric) { this.metric = metric; }
        public double getZScore() { return zScore; }
        public void setZScore(double zScore) { this.zScore = zScore; }
    }

    /** P2 comparison descriptor: the mode applied and the shifted window the comparison values came from. */
    public static class ComparisonDTO {
        private String mode;         // previous_period | previous_window
        private String from;         // shifted window start (ISO)
        private String to;           // shifted window end (ISO)
        public ComparisonDTO() {}
        public ComparisonDTO(String mode, String from, String to) { this.mode = mode; this.from = from; this.to = to; }
        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }
        public String getFrom() { return from; }
        public void setFrom(String from) { this.from = from; }
        public String getTo() { return to; }
        public void setTo(String to) { this.to = to; }
    }

    private AxisSelectionDTO axisSelection;

    private ExecutionDTO execution;

    /** COMPLETE | PARTIAL (derived from partialFailures / timedOut). */
    private String status;

    private List<PartialFailureDTO> partialFailures;

    public String getSearchId() { return searchId; }
    public void setSearchId(String searchId) { this.searchId = searchId; }

    public String getComputedAt() { return computedAt; }
    public void setComputedAt(String computedAt) { this.computedAt = computedAt; }

    public long getTotalMatched() { return totalMatched; }
    public void setTotalMatched(long totalMatched) { this.totalMatched = totalMatched; }

    public long getPivotEligibleMatched() { return pivotEligibleMatched; }
    public void setPivotEligibleMatched(long pivotEligibleMatched) { this.pivotEligibleMatched = pivotEligibleMatched; }

    public String getTotalRelation() { return totalRelation; }
    public void setTotalRelation(String totalRelation) { this.totalRelation = totalRelation; }

    public MetricDTO getMeasure() { return measure; }
    public void setMeasure(MetricDTO measure) { this.measure = measure; }

    public List<String> getRowKeys() { return rowKeys; }
    public void setRowKeys(List<String> rowKeys) { this.rowKeys = rowKeys; }

    public List<String> getColKeys() { return colKeys; }
    public void setColKeys(List<String> colKeys) { this.colKeys = colKeys; }

    public boolean isRowBucketed() { return rowBucketed; }
    public void setRowBucketed(boolean rowBucketed) { this.rowBucketed = rowBucketed; }

    public boolean isColBucketed() { return colBucketed; }
    public void setColBucketed(boolean colBucketed) { this.colBucketed = colBucketed; }

    public String getRowBucketInterval() { return rowBucketInterval; }
    public void setRowBucketInterval(String rowBucketInterval) { this.rowBucketInterval = rowBucketInterval; }

    public String getColBucketInterval() { return colBucketInterval; }
    public void setColBucketInterval(String colBucketInterval) { this.colBucketInterval = colBucketInterval; }

    public boolean isRowHasMissingBucket() { return rowHasMissingBucket; }
    public void setRowHasMissingBucket(boolean rowHasMissingBucket) { this.rowHasMissingBucket = rowHasMissingBucket; }

    public boolean isColHasMissingBucket() { return colHasMissingBucket; }
    public void setColHasMissingBucket(boolean colHasMissingBucket) { this.colHasMissingBucket = colHasMissingBucket; }

    public String getMissingKey() { return missingKey; }
    public void setMissingKey(String missingKey) { this.missingKey = missingKey; }

    public boolean isRowMultiValued() { return rowMultiValued; }
    public void setRowMultiValued(boolean rowMultiValued) { this.rowMultiValued = rowMultiValued; }

    public boolean isColMultiValued() { return colMultiValued; }
    public void setColMultiValued(boolean colMultiValued) { this.colMultiValued = colMultiValued; }

    public ComparisonDTO getComparison() { return comparison; }
    public void setComparison(ComparisonDTO comparison) { this.comparison = comparison; }

    public List<DeviationDTO> getRowDeviations() { return rowDeviations; }
    public void setRowDeviations(List<DeviationDTO> rowDeviations) { this.rowDeviations = rowDeviations; }

    public List<CellDTO> getCells() { return cells; }
    public void setCells(List<CellDTO> cells) { this.cells = cells; }

    public List<Long> getRowTotals() { return rowTotals; }
    public void setRowTotals(List<Long> rowTotals) { this.rowTotals = rowTotals; }

    public List<Long> getColTotals() { return colTotals; }
    public void setColTotals(List<Long> colTotals) { this.colTotals = colTotals; }

    public long getGrandTotal() { return grandTotal; }
    public void setGrandTotal(long grandTotal) { this.grandTotal = grandTotal; }

    public TotalSemanticsDTO getTotalSemantics() { return totalSemantics; }
    public void setTotalSemantics(TotalSemanticsDTO totalSemantics) { this.totalSemantics = totalSemantics; }

    public boolean isRowTruncated() { return rowTruncated; }
    public void setRowTruncated(boolean rowTruncated) { this.rowTruncated = rowTruncated; }

    public boolean isColTruncated() { return colTruncated; }
    public void setColTruncated(boolean colTruncated) { this.colTruncated = colTruncated; }

    public long getRowCardinalityEstimate() { return rowCardinalityEstimate; }
    public void setRowCardinalityEstimate(long rowCardinalityEstimate) { this.rowCardinalityEstimate = rowCardinalityEstimate; }

    public long getColCardinalityEstimate() { return colCardinalityEstimate; }
    public void setColCardinalityEstimate(long colCardinalityEstimate) { this.colCardinalityEstimate = colCardinalityEstimate; }

    public boolean isCardinalityApproximate() { return cardinalityApproximate; }
    public void setCardinalityApproximate(boolean cardinalityApproximate) { this.cardinalityApproximate = cardinalityApproximate; }

    public AxisSelectionDTO getAxisSelection() { return axisSelection; }
    public void setAxisSelection(AxisSelectionDTO axisSelection) { this.axisSelection = axisSelection; }

    public ExecutionDTO getExecution() { return execution; }
    public void setExecution(ExecutionDTO execution) { this.execution = execution; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public List<PartialFailureDTO> getPartialFailures() { return partialFailures; }
    public void setPartialFailures(List<PartialFailureDTO> partialFailures) { this.partialFailures = partialFailures; }

    /** A single non-zero cell. */
    public static class CellDTO {
        private String row;
        private String col;
        private long value;
        /** P2 comparison: the value in the previous period, and the deltas. Null when no comparison requested. */
        private Long comparisonValue;
        private Long delta;
        private Double deltaPercent;

        public CellDTO() {}

        public CellDTO(String row, String col, long value) {
            this.row = row;
            this.col = col;
            this.value = value;
        }

        public String getRow() { return row; }
        public void setRow(String row) { this.row = row; }
        public String getCol() { return col; }
        public void setCol(String col) { this.col = col; }
        public long getValue() { return value; }
        public void setValue(long value) { this.value = value; }
        public Long getComparisonValue() { return comparisonValue; }
        public void setComparisonValue(Long comparisonValue) { this.comparisonValue = comparisonValue; }
        public Long getDelta() { return delta; }
        public void setDelta(Long delta) { this.delta = delta; }
        public Double getDeltaPercent() { return deltaPercent; }
        public void setDeltaPercent(Double deltaPercent) { this.deltaPercent = deltaPercent; }
    }

    /** The measure and whether its values are approximate. */
    public static class MetricDTO {
        private String function;   // count | distinct
        private String field;      // distinct field; null for count
        private boolean approximate;

        public MetricDTO() {}

        public MetricDTO(String function, String field, boolean approximate) {
            this.function = function;
            this.field = field;
            this.approximate = approximate;
        }

        public String getFunction() { return function; }
        public void setFunction(String function) { this.function = function; }
        public String getField() { return field; }
        public void setField(String field) { this.field = field; }
        public boolean isApproximate() { return approximate; }
        public void setApproximate(boolean approximate) { this.approximate = approximate; }
    }

    /** Describes the aggregation scope of each total, independent of the measure. */
    public static class TotalSemanticsDTO {
        private String cell;
        private String row;
        private String column;
        private String grand;
        private boolean additive;   // always false — do not sum cells to totals

        public TotalSemanticsDTO() {}

        public TotalSemanticsDTO(String cell, String row, String column, String grand, boolean additive) {
            this.cell = cell;
            this.row = row;
            this.column = column;
            this.grand = grand;
            this.additive = additive;
        }

        public String getCell() { return cell; }
        public void setCell(String cell) { this.cell = cell; }
        public String getRow() { return row; }
        public void setRow(String row) { this.row = row; }
        public String getColumn() { return column; }
        public void setColumn(String column) { this.column = column; }
        public String getGrand() { return grand; }
        public void setGrand(String grand) { this.grand = grand; }
        public boolean isAdditive() { return additive; }
        public void setAdditive(boolean additive) { this.additive = additive; }
    }

    /** How the axis MEMBERS were selected (independent of measure-value approximation). */
    public static class AxisSelectionDTO {
        private String strategy;          // "distributed_terms" (P1)
        private boolean approximate;      // true in P1
        private int rowShardSize;
        private int colShardSize;
        /** Count-order only; null in distinct mode (not faked). */
        private Long rowDocCountErrorUpperBound;
        private Long colDocCountErrorUpperBound;

        public AxisSelectionDTO() {}

        public String getStrategy() { return strategy; }
        public void setStrategy(String strategy) { this.strategy = strategy; }
        public boolean isApproximate() { return approximate; }
        public void setApproximate(boolean approximate) { this.approximate = approximate; }
        public int getRowShardSize() { return rowShardSize; }
        public void setRowShardSize(int rowShardSize) { this.rowShardSize = rowShardSize; }
        public int getColShardSize() { return colShardSize; }
        public void setColShardSize(int colShardSize) { this.colShardSize = colShardSize; }
        public Long getRowDocCountErrorUpperBound() { return rowDocCountErrorUpperBound; }
        public void setRowDocCountErrorUpperBound(Long v) { this.rowDocCountErrorUpperBound = v; }
        public Long getColDocCountErrorUpperBound() { return colDocCountErrorUpperBound; }
        public void setColDocCountErrorUpperBound(Long v) { this.colDocCountErrorUpperBound = v; }
    }

    /** Unobtrusive execution metadata for the status line + query inspector. */
    public static class ExecutionDTO {
        private long tookMs;
        private boolean timedOut;
        private long returnedCells;
        private int returnedRows;
        private int returnedColumns;
        private boolean truncated;

        public ExecutionDTO() {}

        public long getTookMs() { return tookMs; }
        public void setTookMs(long tookMs) { this.tookMs = tookMs; }
        public boolean isTimedOut() { return timedOut; }
        public void setTimedOut(boolean timedOut) { this.timedOut = timedOut; }
        public long getReturnedCells() { return returnedCells; }
        public void setReturnedCells(long returnedCells) { this.returnedCells = returnedCells; }
        public int getReturnedRows() { return returnedRows; }
        public void setReturnedRows(int returnedRows) { this.returnedRows = returnedRows; }
        public int getReturnedColumns() { return returnedColumns; }
        public void setReturnedColumns(int returnedColumns) { this.returnedColumns = returnedColumns; }
        public boolean isTruncated() { return truncated; }
        public void setTruncated(boolean truncated) { this.truncated = truncated; }
    }
}
