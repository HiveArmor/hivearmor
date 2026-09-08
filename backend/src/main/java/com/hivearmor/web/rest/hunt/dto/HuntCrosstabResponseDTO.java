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
