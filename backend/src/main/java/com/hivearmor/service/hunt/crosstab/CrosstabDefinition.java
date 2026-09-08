package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.web.rest.hunt.dto.HuntSearchRequestDTO;

import java.util.List;

/**
 * Neutral internal domain model for a crosstab request.
 *
 * <p>PR-A P1. The <b>public</b> request DTO ({@code HuntCrosstabRequestDTO}) stays flat
 * (rowField/colField/valueFn/distinctField); this internal model is what the planner speaks, so
 * P2+ can add a second dimension, comparison, or display modes without a breaking rewrite. A V1
 * validator clamps this model to {@code rows.size()==1, columns.size()==1, measures.size()==1}.
 *
 * <p>Immutable value object built by {@code CrosstabRequestMapper}. Not a Spring bean.
 */
public final class CrosstabDefinition {

    /** Measure function. P1 supports COUNT and DISTINCT only. */
    public enum MeasureFn { COUNT, DISTINCT }

    /** Dimension kind. P1 supports TERM only (DATE_HISTOGRAM is a P1.1 hook). */
    public enum DimKind { TERM }

    /** How events missing the dimension field are handled. P1 is OMIT only (INCLUDE is a P1.1 hook). */
    public enum MissingMode { OMIT }

    /** A single crosstab dimension. */
    public static final class Dimension {
        private final String field;
        private final DimKind kind;
        private final MissingMode missing;

        public Dimension(String field, DimKind kind, MissingMode missing) {
            this.field = field;
            this.kind = kind;
            this.missing = missing;
        }

        public String field() { return field; }
        public DimKind kind() { return kind; }
        public MissingMode missing() { return missing; }
    }

    /** The crosstab measure. {@code field} is only set for DISTINCT. */
    public static final class Measure {
        private final MeasureFn fn;
        private final String field;

        public Measure(MeasureFn fn, String field) {
            this.fn = fn;
            this.field = field;
        }

        public MeasureFn fn() { return fn; }
        public String field() { return field; }
    }

    /** Rows / columns dimension lists. P1: each holds exactly one. */
    public static final class Dimensions {
        private final List<Dimension> rows;
        private final List<Dimension> columns;

        public Dimensions(List<Dimension> rows, List<Dimension> columns) {
            this.rows = List.copyOf(rows);
            this.columns = List.copyOf(columns);
        }

        public List<Dimension> rows() { return rows; }
        public List<Dimension> columns() { return columns; }
    }

    // Context inherited from the committed hunt (never re-typed by the client beyond query/time).
    private final String query;
    private final String language;
    private final HuntSearchRequestDTO.TimeRangeDTO timeRange;
    private final String indexType;
    private final String tenantScope;

    private final Dimensions dimensions;
    private final List<Measure> measures;

    // Requested per-axis member caps (already clamped by the mapper against CrosstabCostPolicy).
    private final int rowSize;
    private final int colSize;

    public CrosstabDefinition(String query,
                              String language,
                              HuntSearchRequestDTO.TimeRangeDTO timeRange,
                              String indexType,
                              String tenantScope,
                              Dimensions dimensions,
                              List<Measure> measures,
                              int rowSize,
                              int colSize) {
        this.query = query;
        this.language = language;
        this.timeRange = timeRange;
        this.indexType = indexType;
        this.tenantScope = tenantScope;
        this.dimensions = dimensions;
        this.measures = List.copyOf(measures);
        this.rowSize = rowSize;
        this.colSize = colSize;
    }

    public String query() { return query; }
    public String language() { return language; }
    public HuntSearchRequestDTO.TimeRangeDTO timeRange() { return timeRange; }
    public String indexType() { return indexType; }
    public String tenantScope() { return tenantScope; }
    public Dimensions dimensions() { return dimensions; }
    public List<Measure> measures() { return measures; }
    public int rowSize() { return rowSize; }
    public int colSize() { return colSize; }

    // --- P1 convenience accessors (valid only after the V1 validator has clamped to 1x1x1) ---

    public Dimension row() { return dimensions.rows().get(0); }
    public Dimension column() { return dimensions.columns().get(0); }
    public Measure measure() { return measures.get(0); }
    public boolean isDistinct() { return measure().fn() == MeasureFn.DISTINCT; }
}
