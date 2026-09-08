package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.HuntFieldRegistry;
import com.hivearmor.service.hunt.HuntFieldRegistry.FieldKind;
import com.hivearmor.service.hunt.HuntFieldRegistry.FieldSpec;
import com.hivearmor.service.hunt.HuntQueryException;
import com.hivearmor.service.hunt.HuntQueryParser;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.Dimension;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.Measure;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.MeasureFn;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO.AxisSelectionDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO.CellDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO.ExecutionDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO.MetricDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO.TotalSemanticsDTO;
import com.hivearmor.web.rest.hunt.dto.HuntSearchRequestDTO;
import com.hivearmor.web.rest.hunt.dto.HuntSearchResponseDTO.PartialFailureDTO;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.aggregations.Aggregation;
import org.opensearch.client.opensearch._types.aggregations.Buckets;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.ExistsQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Crosstab query planner + executor.
 *
 * <p>PR-A P1. Deterministic engine: definition &rarr; eligible-scope discovery (Stage A) &rarr;
 * bounded matrix + branch-isolated selected-member totals (Stage B) &rarr; assembly (Stage C).
 * Two {@code size:0} OpenSearch round-trips, both bounded by the cost policy; <b>no
 * {@code terminateAfter}</b> (full pivot-eligible set is always counted).
 *
 * <p>Self-contained: it re-implements the small query helpers ({@code withTimeRange},
 * {@code resolveIndices}, {@code aggFieldPathFor}, {@code partialFailures}) so {@code HaHuntService}
 * is untouched. These mirror the shipped hunt logic exactly.
 */
@Component
public class HaHuntCrosstabPlanner {

    private static final Logger log = LoggerFactory.getLogger(HaHuntCrosstabPlanner.class);
    private static final Set<String> ALLOWED_INDEX_TYPES = Set.of("log", "event", "alert");

    private static final String AGG_ELIGIBLE = "eligible";
    private static final String AGG_ROW_DISCOVERY = "row_disc";
    private static final String AGG_COL_DISCOVERY = "col_disc";
    private static final String AGG_ROW_CARD = "row_card";
    private static final String AGG_COL_CARD = "col_card";
    private static final String AGG_GRAND_DISTINCT = "grand_distinct";
    private static final String SUB_DISTINCT = "d";
    /** Synthetic key for the (missing) bucket under MissingMode.INCLUDE — the FE renders it as "(no value)". */
    private static final String MISSING_SENTINEL = "\u0000(missing)";
    private static final String AGG_MATRIX = "matrix";
    private static final String AGG_MATRIX_COL = "matrix_col";
    private static final String AGG_ROW_TOTALS = "row_totals";
    private static final String AGG_COL_TOTALS = "col_totals";

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final HuntFieldRegistry fieldRegistry;
    private final HuntQueryParser queryParser;
    private final CrosstabCostPolicy costPolicy;

    public HaHuntCrosstabPlanner(OpensearchClientBuilder osClient,
                                 MsspIndexResolver indexResolver,
                                 HuntFieldRegistry fieldRegistry,
                                 HuntQueryParser queryParser,
                                 CrosstabCostPolicy costPolicy) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.fieldRegistry = fieldRegistry;
        this.queryParser = queryParser;
        this.costPolicy = costPolicy;
    }

    /** Ordered row/column members chosen by Stage A, plus their approximate axis cardinalities. */
    private record AxisDiscovery(List<String> rowKeys, List<String> colKeys,
                                 long rowCardinality, long colCardinality,
                                 Long rowDocCountError, Long colDocCountError,
                                 long totalMatched, String totalRelation,
                                 long pivotEligibleMatched, long grandDistinct,
                                 boolean timedOut, List<PartialFailureDTO> failures) {}

    @SuppressWarnings("rawtypes")
    public HuntCrosstabResponseDTO plan(CrosstabDefinition def) throws Exception {
        long started = System.nanoTime();

        FieldSpec rowSpec = fieldRegistry.require(def.row().field());
        FieldSpec colSpec = fieldRegistry.require(def.column().field());
        AxisPlan rowPlan = axisPlan(def.row(), rowSpec);
        AxisPlan colPlan = axisPlan(def.column(), colSpec);
        String rowPath = rowPlan.path();
        String colPath = colPlan.path();

        Measure measure = def.measure();
        boolean distinct = measure.fn() == MeasureFn.DISTINCT;
        String distinctPath = distinct ? aggFieldPathFor(fieldRegistry.require(measure.field())) : null;

        Query baseQuery = withTimeRange(queryParser.parse(def.query()), def.timeRange());
        Query eligibleFilter = eligibleFilter(baseQuery, def.row(), def.column());
        List<String> indices = resolveIndices(def.indexType());

        int rowSize = def.rowSize();
        int colSize = def.colSize();
        int rowShardSize = costPolicy.shardSizeFor(rowSize);
        int colShardSize = costPolicy.shardSizeFor(colSize);

        // ---- Stage A: eligible scope + approximate axis discovery (one size:0 search) ----
        AxisDiscovery disc = discoverAxes(baseQuery, eligibleFilter, indices, rowPlan, colPlan,
            rowSize, colSize, rowShardSize, colShardSize, distinct, distinctPath);

        List<String> rowKeys = disc.rowKeys();
        List<String> colKeys = disc.colKeys();

        HuntCrosstabResponseDTO dto = new HuntCrosstabResponseDTO();
        dto.setSearchId("HUNT-XT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT));
        dto.setComputedAt(Instant.now().toString());
        dto.setTotalMatched(disc.totalMatched());
        dto.setTotalRelation(disc.totalRelation());
        dto.setPivotEligibleMatched(disc.pivotEligibleMatched());
        dto.setRowCardinalityEstimate(disc.rowCardinality());
        dto.setColCardinalityEstimate(disc.colCardinality());
        dto.setCardinalityApproximate(true);
        dto.setRowTruncated(!rowPlan.histogram() && disc.rowCardinality() > rowKeys.size());
        dto.setColTruncated(!colPlan.histogram() && disc.colCardinality() > colKeys.size());
        dto.setRowBucketed(rowPlan.histogram());
        dto.setColBucketed(colPlan.histogram());
        dto.setRowBucketInterval(rowPlan.histogram() ? rowPlan.interval() : null);
        dto.setColBucketInterval(colPlan.histogram() ? colPlan.interval() : null);
        dto.setRowHasMissingBucket(rowPlan.includeMissing());
        dto.setColHasMissingBucket(colPlan.includeMissing());
        dto.setMissingKey(rowPlan.includeMissing() || colPlan.includeMissing() ? MISSING_SENTINEL : null);
        dto.setRowMultiValued(rowSpec.multiValued());
        dto.setColMultiValued(colSpec.multiValued());

        AxisSelectionDTO axis = new AxisSelectionDTO();
        axis.setStrategy("distributed_terms");
        axis.setApproximate(true);
        axis.setRowShardSize(rowShardSize);
        axis.setColShardSize(colShardSize);
        axis.setRowDocCountErrorUpperBound(distinct ? null : disc.rowDocCountError());
        axis.setColDocCountErrorUpperBound(distinct ? null : disc.colDocCountError());
        dto.setAxisSelection(axis);

        dto.setMeasure(new MetricDTO(distinct ? "distinct" : "count", measure.field(), distinct));

        boolean timedOut = disc.timedOut();
        List<PartialFailureDTO> failures = new ArrayList<>(disc.failures());

        if (rowKeys.isEmpty() || colKeys.isEmpty()) {
            // Empty crosstab — no members to build a matrix from.
            dto.setRowKeys(rowKeys);
            dto.setColKeys(colKeys);
            dto.setCells(List.of());
            dto.setRowTotals(List.of());
            dto.setColTotals(List.of());
            dto.setGrandTotal(distinct ? disc.grandDistinct() : disc.pivotEligibleMatched());
            finalize(dto, def, measure, distinct, timedOut, failures, started, 0);
            return dto;
        }

        // ---- Stage B: bounded matrix + branch-isolated selected-member totals (one size:0 search) ----
        MatrixResult mx = computeMatrix(eligibleFilter, indices, rowSpec, colSpec, rowPlan, colPlan,
            rowKeys, colKeys, distinct, distinctPath);

        timedOut = timedOut || mx.timedOut();
        failures.addAll(mx.failures());

        dto.setRowKeys(rowKeys);
        dto.setColKeys(colKeys);
        dto.setCells(mx.cells());
        dto.setRowTotals(mx.rowTotals());
        dto.setColTotals(mx.colTotals());
        dto.setGrandTotal(distinct ? disc.grandDistinct() : disc.pivotEligibleMatched());

        finalize(dto, def, measure, distinct, timedOut, failures, started, mx.cells().size());
        return dto;
    }

    // ------------------------------------------------------------------ Stage A

    @SuppressWarnings("rawtypes")
    private AxisDiscovery discoverAxes(Query baseQuery, Query eligibleFilter, List<String> indices,
                                       AxisPlan rowPlan, AxisPlan colPlan,
                                       int rowSize, int colSize, int rowShardSize, int colShardSize,
                                       boolean distinct, String distinctPath) throws Exception {
        // Axis-discovery sub-aggs, computed inside a filter agg scoped to pivot-eligible docs.
        Map<String, Aggregation> eligibleSubs = new LinkedHashMap<>();

        Aggregation rowDisc = axisDiscoveryAgg(rowPlan, rowSize, rowShardSize, distinct, distinctPath);
        Aggregation colDisc = axisDiscoveryAgg(colPlan, colSize, colShardSize, distinct, distinctPath);

        eligibleSubs.put(AGG_ROW_DISCOVERY, rowDisc);
        eligibleSubs.put(AGG_COL_DISCOVERY, colDisc);
        // Cardinality estimates + truncation only apply to a TERM axis; a histogram is complete.
        if (!rowPlan.histogram()) eligibleSubs.put(AGG_ROW_CARD, cardinalityAgg(rowPlan.path()));
        if (!colPlan.histogram()) eligibleSubs.put(AGG_COL_CARD, cardinalityAgg(colPlan.path()));
        if (distinct) {
            eligibleSubs.put(AGG_GRAND_DISTINCT, cardinalityAgg(distinctPath));
        }

        Aggregation eligibleAgg = Aggregation.of(a -> a
            .filter(eligibleFilter)
            .aggregations(eligibleSubs));

        SearchRequest.Builder builder = new SearchRequest.Builder()
            .size(0)
            .query(baseQuery)                       // totalMatched = all hunt matches (not eligible)
            .trackTotalHits(t -> t.enabled(true))
            .index(indices).ignoreUnavailable(true).allowNoIndices(true)
            .timeout(costPolicy.getRequestTimeout())
            .allowPartialSearchResults(true)
            .aggregations(AGG_ELIGIBLE, eligibleAgg);

        SearchResponse<Map> resp = osClient.execute(os -> os.search(builder.build(), Map.class));

        long totalMatched = 0;
        String relation = "eq";
        if (resp.hits() != null && resp.hits().total() != null) {
            totalMatched = resp.hits().total().value();
            relation = resp.hits().total().relation().jsonValue();
        }

        Aggregate eligible = resp.aggregations().get(AGG_ELIGIBLE);
        long eligibleCount = eligible != null && eligible.isFilter() ? eligible.filter().docCount() : 0L;
        Map<String, Aggregate> subs = eligible != null && eligible.isFilter()
            ? eligible.filter().aggregations() : Map.of();

        RowKeys rows = readAxisKeys(subs.get(AGG_ROW_DISCOVERY), rowPlan.histogram());
        RowKeys cols = readAxisKeys(subs.get(AGG_COL_DISCOVERY), colPlan.histogram());
        // A histogram axis reports its bucket count as "cardinality" (complete, not an estimate).
        long rowCard = rowPlan.histogram() ? rows.keys().size() : cardinalityValue(subs.get(AGG_ROW_CARD));
        long colCard = colPlan.histogram() ? cols.keys().size() : cardinalityValue(subs.get(AGG_COL_CARD));
        long grandDistinct = distinct ? cardinalityValue(subs.get(AGG_GRAND_DISTINCT)) : 0L;

        return new AxisDiscovery(rows.keys(), cols.keys(), rowCard, colCard,
            distinct ? null : rows.docCountError(), distinct ? null : cols.docCountError(),
            totalMatched, relation, eligibleCount, grandDistinct,
            resp.timedOut(), partialFailures(resp));
    }

    // ------------------------------------------------------------------ Stage B

    /**
     * P2: run a matrix-only pass for a (previous-period) definition over an EXPLICIT set of members.
     *
     * <p>Reuses the current run's row/column keys so the two periods are keyed identically (no member
     * drift), and routes through the SAME {@code resolveIndices} + time-range helpers so the scope is
     * identical apart from the shifted window. Returns cells keyed {@code row\u0000col -> value}; the
     * caller merges these as {@code comparisonValue} onto the current cells. Discovery is skipped
     * entirely — this is a single matrix search, not a second full plan.
     */
    public Map<String, Long> comparisonCells(CrosstabDefinition def, List<String> rowKeys, List<String> colKeys) throws Exception {
        if (rowKeys.isEmpty() || colKeys.isEmpty()) return Map.of();
        FieldSpec rowSpec = fieldRegistry.require(def.row().field());
        FieldSpec colSpec = fieldRegistry.require(def.column().field());
        AxisPlan rowPlan = axisPlan(def.row(), rowSpec);
        AxisPlan colPlan = axisPlan(def.column(), colSpec);
        Measure measure = def.measure();
        boolean distinct = measure.fn() == MeasureFn.DISTINCT;
        String distinctPath = distinct ? aggFieldPathFor(fieldRegistry.require(measure.field())) : null;
        Query baseQuery = withTimeRange(queryParser.parse(def.query()), def.timeRange());
        Query eligibleFilter = eligibleFilter(baseQuery, def.row(), def.column());
        List<String> indices = resolveIndices(def.indexType());
        MatrixResult mx = computeMatrix(eligibleFilter, indices, rowSpec, colSpec, rowPlan, colPlan,
            rowKeys, colKeys, distinct, distinctPath);
        Map<String, Long> byKey = new LinkedHashMap<>();
        for (CellDTO c : mx.cells()) {
            byKey.put(c.getRow() + "\u0000" + c.getCol(), c.getValue());
        }
        return byKey;
    }

    private record MatrixResult(List<CellDTO> cells, List<Long> rowTotals, List<Long> colTotals,
                                boolean timedOut, List<PartialFailureDTO> failures) {}

    @SuppressWarnings("rawtypes")
    private MatrixResult computeMatrix(Query eligibleFilter, List<String> indices,
                                       FieldSpec rowSpec, FieldSpec colSpec, AxisPlan rowPlan, AxisPlan colPlan,
                                       List<String> rowKeys, List<String> colKeys,
                                       boolean distinct, String distinctPath) throws Exception {
        Map<String, Aggregation> aggs = new LinkedHashMap<>();
        String rowPath = rowPlan.path();
        String colPath = colPlan.path();

        // Matrix scope: restrict ONLY a plain TERM axis (not histogram, not INCLUDE-missing) to its
        // selected members. A date_histogram OR an INCLUDE axis produces deterministic buckets (via
        // fixed interval / the terms `missing` parameter), so a member-IN filter is neither needed nor
        // possible for it (the (missing) bucket has no field value to match).
        List<Query> scopeFilters = new ArrayList<>();
        if (!rowPlan.histogram() && !rowPlan.includeMissing()) {
            List<FieldValue> rowVals = toFieldValues(rowSpec, rowKeys);
            scopeFilters.add(Query.of(f -> f.terms(t -> t.field(rowPath).terms(tt -> tt.value(rowVals)))));
        }
        if (!colPlan.histogram() && !colPlan.includeMissing()) {
            List<FieldValue> colVals = toFieldValues(colSpec, colKeys);
            scopeFilters.add(Query.of(f -> f.terms(t -> t.field(colPath).terms(tt -> tt.value(colVals)))));
        }
        Query matrixScope = Query.of(q -> q.bool(BoolQuery.of(b -> b.filter(scopeFilters))));

        Aggregation innerCol = axisMatrixAgg(colPlan, colKeys.size(), distinct, distinctPath);
        Aggregation outerRow = axisMatrixAggWithSub(rowPlan, rowKeys.size(), innerCol);
        Aggregation matrix = Aggregation.of(a -> a
            .filter(matrixScope)
            .aggregations(AGG_MATRIX_COL, outerRow));
        aggs.put(AGG_MATRIX, matrix);

        // Per-axis totals: TERM axis -> keyed filters (member scope); date_histogram axis -> the
        // histogram bucket doc_counts (each bucket is its own scope). additive:false holds either way.
        aggs.put(AGG_ROW_TOTALS, axisMemberTotals(rowPlan, rowSpec, rowKeys, distinct, distinctPath));
        aggs.put(AGG_COL_TOTALS, axisMemberTotals(colPlan, colSpec, colKeys, distinct, distinctPath));

        SearchRequest.Builder builder = new SearchRequest.Builder()
            .size(0)
            .query(eligibleFilter)                  // common scope = pivot-eligible ONLY (no member IN clause)
            .index(indices).ignoreUnavailable(true).allowNoIndices(true)
            .timeout(costPolicy.getRequestTimeout())
            .allowPartialSearchResults(true)
            .aggregations(aggs);

        SearchResponse<Map> resp = osClient.execute(os -> os.search(builder.build(), Map.class));
        Map<String, Aggregate> top = resp.aggregations();

        // Cells from the matrix branch (axis-aware bucket iteration).
        List<CellDTO> cells = new ArrayList<>();
        Aggregate matrixAgg = top.get(AGG_MATRIX);
        if (matrixAgg != null && matrixAgg.isFilter()) {
            Aggregate outerRows = matrixAgg.filter().aggregations().get(AGG_MATRIX_COL);
            for (var rowBucket : axisBuckets(outerRows, rowPlan.histogram())) {
                String rowKey = rowBucket.key();
                Aggregate innerCols = rowBucket.aggregations().get(AGG_MATRIX_COL);
                for (var colBucket : axisBuckets(innerCols, colPlan.histogram())) {
                    long value = distinct
                        ? cardinalityValue(colBucket.aggregations().get(SUB_DISTINCT))
                        : colBucket.docCount();
                    if (value > 0) {
                        cells.add(new CellDTO(rowKey, colBucket.key(), value));
                    }
                }
            }
        }

        List<Long> rowTotals = readAxisTotals(top.get(AGG_ROW_TOTALS), rowKeys, rowPlan.histogram(), distinct);
        List<Long> colTotals = readAxisTotals(top.get(AGG_COL_TOTALS), colKeys, colPlan.histogram(), distinct);

        return new MatrixResult(cells, rowTotals, colTotals, resp.timedOut(), partialFailures(resp));
    }

    /** The inner (leaf) matrix agg for an axis: terms(size) or date_histogram, with a distinct sub-agg when needed. */
    private Aggregation axisMatrixAgg(AxisPlan plan, int size, boolean distinct, String distinctPath) {
        if (plan.histogram()) {
            return dateHistoAgg(plan, distinct, distinctPath);
        }
        if (distinct) {
            return Aggregation.of(a -> a.terms(t -> {
                t.field(plan.path()).size(size);
                if (plan.includeMissing()) t.missing(FieldValue.of(MISSING_SENTINEL));
                return t;
            }).aggregations(SUB_DISTINCT, cardinalityAgg(distinctPath)));
        }
        return Aggregation.of(a -> a.terms(t -> {
            t.field(plan.path()).size(size);
            if (plan.includeMissing()) t.missing(FieldValue.of(MISSING_SENTINEL));
            return t;
        }));
    }

    /** The outer matrix agg for the row axis, carrying the inner column agg as a sub-aggregation. */
    private Aggregation axisMatrixAggWithSub(AxisPlan plan, int size, Aggregation sub) {
        if (plan.histogram()) {
            return Aggregation.of(a -> a.dateHistogram(d -> {
                d.field(plan.path()).fixedInterval(i -> i.time(plan.interval()));
                if (plan.timezone() != null && !plan.timezone().isBlank()) d.timeZone(plan.timezone());
                return d;
            }).aggregations(AGG_MATRIX_COL, sub));
        }
        return Aggregation.of(a -> a.terms(t -> {
            t.field(plan.path()).size(size);
            if (plan.includeMissing()) t.missing(FieldValue.of(MISSING_SENTINEL));
            return t;
        }).aggregations(AGG_MATRIX_COL, sub));
    }

    /** Per-member totals agg for an axis: keyed filters (TERM) or a date_histogram (bucket doc_counts). */
    private Aggregation axisMemberTotals(AxisPlan plan, FieldSpec spec, List<String> keys,
                                         boolean distinct, String distinctPath) {
        if (plan.histogram()) {
            return dateHistoAgg(plan, distinct, distinctPath);
        }
        return keyedMemberTotals(plan.path(), spec.name(), spec, keys, distinct, distinctPath);
    }

    /** Read per-member totals for an axis: from a keyed-filters agg (TERM) or a date_histogram (by key). */
    private List<Long> readAxisTotals(Aggregate agg, List<String> keys, boolean histogram, boolean distinct) {
        if (histogram) {
            Map<String, Long> byKey = new LinkedHashMap<>();
            if (agg != null && agg.isDateHistogram()) {
                for (var b : agg.dateHistogram().buckets().array()) {
                    long value = distinct ? cardinalityValue(b.aggregations().get(SUB_DISTINCT)) : b.docCount();
                    byKey.put(b.keyAsString(), value);
                }
            }
            List<Long> totals = new ArrayList<>(keys.size());
            for (String key : keys) totals.add(byKey.getOrDefault(key, 0L));
            return totals;
        }
        return readKeyedTotals(agg, keys, distinct);
    }

    /** A keyed {@code filters} agg: one bucket per selected member, scoped to that member only.
     *  The (missing) sentinel key is scoped by a must_not exists on the raw field, not a term. */
    private Aggregation keyedMemberTotals(String path, String rawField, FieldSpec spec, List<String> keys,
                                          boolean distinct, String distinctPath) {
        Map<String, Query> keyed = new LinkedHashMap<>();
        for (String key : keys) {
            if (MISSING_SENTINEL.equals(key)) {
                keyed.put(key, Query.of(q -> q.bool(BoolQuery.of(b -> b
                    .mustNot(Query.of(mn -> mn.exists(ExistsQuery.of(e -> e.field(rawField)))))))));
            } else {
                FieldValue fv = toFieldValue(spec, key);
                keyed.put(key, Query.of(q -> q.term(t -> t.field(path).value(fv))));
            }
        }
        if (distinct) {
            return Aggregation.of(a -> a
                .filters(f -> f.filters(b -> b.keyed(keyed)))
                .aggregations(SUB_DISTINCT, cardinalityAgg(distinctPath)));
        }
        return Aggregation.of(a -> a.filters(f -> f.filters(b -> b.keyed(keyed))));
    }

    /** Axis-aware bucket iteration: terms buckets or date_histogram buckets, unified as TermBucketView. */
    private static List<TermBucketView> axisBuckets(Aggregate agg, boolean histogram) {
        if (!histogram) {
            return termsBuckets(agg);
        }
        List<TermBucketView> out = new ArrayList<>();
        if (agg != null && agg.isDateHistogram()) {
            for (var b : agg.dateHistogram().buckets().array()) {
                out.add(new TermBucketView() {
                    public String key() { return b.keyAsString(); }
                    public long docCount() { return b.docCount(); }
                    public Map<String, Aggregate> aggregations() { return b.aggregations(); }
                });
            }
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private List<Long> readKeyedTotals(Aggregate agg, List<String> keys, boolean distinct) {
        List<Long> totals = new ArrayList<>(keys.size());
        Map<String, ? extends org.opensearch.client.opensearch._types.aggregations.FiltersBucket> buckets = Map.of();
        if (agg != null && agg.isFilters() && agg.filters().buckets().isKeyed()) {
            buckets = agg.filters().buckets().keyed();
        }
        for (String key : keys) {
            var bucket = buckets.get(key);
            if (bucket == null) {
                totals.add(0L);
            } else if (distinct) {
                totals.add(cardinalityValue(bucket.aggregations().get(SUB_DISTINCT)));
            } else {
                totals.add(bucket.docCount());
            }
        }
        return totals;
    }

    // ------------------------------------------------------------------ Stage C

    private void finalize(HuntCrosstabResponseDTO dto, CrosstabDefinition def, Measure measure,
                          boolean distinct, boolean timedOut, List<PartialFailureDTO> failures,
                          long startedNanos, int returnedCellCount) {
        boolean partial = timedOut || !failures.isEmpty();
        dto.setStatus(partial ? "PARTIAL" : "COMPLETE");
        dto.setPartialFailures(List.copyOf(failures));

        dto.setTotalSemantics(new TotalSemanticsDTO(
            distinct ? "approximate distinct(" + measure.field() + ") for row AND column member"
                     : "documents matching row AND column member",
            distinct ? "approximate distinct(" + measure.field() + ") for the row member in pivot-eligible scope"
                     : "documents matching the row member in pivot-eligible scope",
            distinct ? "approximate distinct(" + measure.field() + ") for the column member in pivot-eligible scope"
                     : "documents matching the column member in pivot-eligible scope",
            distinct ? "approximate distinct(" + measure.field() + ") over the pivot-eligible scope"
                     : "documents in the pivot-eligible scope",
            false));

        ExecutionDTO exec = new ExecutionDTO();
        exec.setTookMs((System.nanoTime() - startedNanos) / 1_000_000L);
        exec.setTimedOut(timedOut);
        exec.setReturnedCells(returnedCellCount);
        exec.setReturnedRows(dto.getRowKeys() == null ? 0 : dto.getRowKeys().size());
        exec.setReturnedColumns(dto.getColKeys() == null ? 0 : dto.getColKeys().size());
        exec.setTruncated(dto.isRowTruncated() || dto.isColTruncated());
        dto.setExecution(exec);
    }

    // ------------------------------------------------------------------ helpers

    private Query eligibleFilter(Query baseQuery, Dimension row, Dimension col) {
        // Only OMIT axes contribute an exists() guard; an INCLUDE axis keeps its field-absent docs in
        // scope so they land in the (missing) bucket. The denominator therefore reflects the ACTUAL
        // per-axis filter, not a fixed "both fields present".
        return Query.of(q -> q.bool(BoolQuery.of(b -> {
            b.must(baseQuery);
            if (row.missing() != CrosstabDefinition.MissingMode.INCLUDE) {
                b.filter(Query.of(f -> f.exists(ExistsQuery.of(e -> e.field(row.field())))));
            }
            if (col.missing() != CrosstabDefinition.MissingMode.INCLUDE) {
                b.filter(Query.of(f -> f.exists(ExistsQuery.of(e -> e.field(col.field())))));
            }
            return b;
        })));
    }

    private Query withTimeRange(Query userQuery, HuntSearchRequestDTO.TimeRangeDTO timeRange) {
        Query timeFilter = Query.of(q -> q.range(RangeQuery.of(r -> r
            .field("@timestamp")
            .gte(JsonData.of(timeRange.getFrom()))
            .lte(JsonData.of(timeRange.getTo())))));
        return Query.of(q -> q.bool(BoolQuery.of(b -> b.must(userQuery).filter(timeFilter))));
    }

    private List<String> resolveIndices(String requestedType) {
        if (requestedType == null || requestedType.isBlank() || "all".equalsIgnoreCase(requestedType)) {
            return List.of(indexResolver.resolveIndexPattern("log"), indexResolver.resolveAlertIndexPattern());
        }
        String normalized = requestedType.toLowerCase(Locale.ROOT);
        if ("alert".equals(normalized)) {
            return List.of(indexResolver.resolveAlertIndexPattern());
        }
        if (!ALLOWED_INDEX_TYPES.contains(normalized)) {
            throw new HuntQueryException("HUNT_INDEX_TYPE_UNSUPPORTED", "Unsupported hunt data source: " + requestedType, 0);
        }
        return List.of(indexResolver.resolveIndexPattern(normalized));
    }

    private Aggregation cardinalityAgg(String path) {
        int precision = costPolicy.getPrecisionThreshold();
        if (precision > 0) {
            return Aggregation.of(a -> a.cardinality(c -> c.field(path).precisionThreshold(precision)));
        }
        return Aggregation.of(a -> a.cardinality(c -> c.field(path)));
    }

    /** Per-axis plan: the physical path, whether it is a date_histogram, and its interval/timezone. */
    private record AxisPlan(String path, boolean histogram, String interval, String timezone, boolean includeMissing) {}

    private AxisPlan axisPlan(Dimension dim, FieldSpec spec) {
        boolean includeMissing = dim.missing() == CrosstabDefinition.MissingMode.INCLUDE;
        if (dim.isDateHistogram()) {
            // Date histograms bucket the raw date field (never .keyword). INCLUDE is rejected upstream.
            String tz = dim.bucket() == null ? null : dim.bucket().timezone();
            String interval = dim.bucket() == null ? null : dim.bucket().interval();
            return new AxisPlan(spec.name(), true, interval, tz, false);
        }
        return new AxisPlan(aggFieldPathFor(spec), false, null, null, includeMissing);
    }

    /** Build the discovery/agg for one axis: terms (with optional distinct order) or a date_histogram. */
    private Aggregation axisDiscoveryAgg(AxisPlan plan, int size, int shardSize,
                                         boolean distinct, String distinctPath) {
        if (plan.histogram()) {
            // A date_histogram over a fixed interval + bounded time range is deterministic and complete
            // (no top-N truncation, no doc-count error). Distinct ordering does not apply.
            return dateHistoAgg(plan, distinct, distinctPath);
        }
        if (distinct) {
            return Aggregation.of(a -> a.terms(t -> {
                t.field(plan.path()).size(size).shardSize(shardSize).order(Map.of(SUB_DISTINCT, SortOrder.Desc));
                if (plan.includeMissing()) t.missing(FieldValue.of(MISSING_SENTINEL));
                return t;
            }).aggregations(SUB_DISTINCT, cardinalityAgg(distinctPath)));
        }
        return Aggregation.of(a -> a.terms(t -> {
            t.field(plan.path()).size(size).shardSize(shardSize);
            if (plan.includeMissing()) t.missing(FieldValue.of(MISSING_SENTINEL));
            return t;
        }));
    }

    /** A date_histogram agg (fixed interval, optional tz), with an inner distinct sub-agg when needed. */
    private Aggregation dateHistoAgg(AxisPlan plan, boolean distinct, String distinctPath) {
        if (distinct) {
            return Aggregation.of(a -> a.dateHistogram(d -> {
                d.field(plan.path()).fixedInterval(i -> i.time(plan.interval()));
                if (plan.timezone() != null && !plan.timezone().isBlank()) d.timeZone(plan.timezone());
                return d;
            }).aggregations(SUB_DISTINCT, cardinalityAgg(distinctPath)));
        }
        return Aggregation.of(a -> a.dateHistogram(d -> {
            d.field(plan.path()).fixedInterval(i -> i.time(plan.interval()));
            if (plan.timezone() != null && !plan.timezone().isBlank()) d.timeZone(plan.timezone());
            return d;
        }));
    }

    /** Ordered ISO bucket-start keys of a date_histogram aggregate. */
    private static List<String> readHistoKeys(Aggregate agg) {
        List<String> keys = new ArrayList<>();
        if (agg != null && agg.isDateHistogram()) {
            agg.dateHistogram().buckets().array().forEach(b -> keys.add(b.keyAsString()));
        }
        return keys;
    }

    /** Read axis keys from either a terms or a date_histogram discovery aggregate. */
    private static RowKeys readAxisKeys(Aggregate agg, boolean histogram) {
        if (histogram) {
            return new RowKeys(readHistoKeys(agg), null);
        }
        return readTerms(agg);
    }

    private static String aggFieldPath(String fieldName) {
        return fieldName.endsWith(".keyword") ? fieldName : fieldName + ".keyword";
    }

    private static String aggFieldPathFor(FieldSpec field) {
        return switch (field.kind()) {
            case KEYWORD, TEXT -> aggFieldPath(field.name());
            case IP, NUMBER, DATE, BOOLEAN -> field.name();
        };
    }

    /** Type-safe FieldValue for a terms/term filter, so numeric/boolean/IP aren't forced to strings. */
    private static FieldValue toFieldValue(FieldSpec spec, String key) {
        if (spec.kind() == FieldKind.NUMBER) {
            try {
                if (key.contains(".") || key.contains("e") || key.contains("E")) {
                    return FieldValue.of(Double.parseDouble(key));
                }
                return FieldValue.of(Long.parseLong(key));
            } catch (NumberFormatException nfe) {
                return FieldValue.of(key);
            }
        }
        if (spec.kind() == FieldKind.BOOLEAN) {
            return FieldValue.of(Boolean.parseBoolean(key));
        }
        return FieldValue.of(key);
    }

    private static List<FieldValue> toFieldValues(FieldSpec spec, List<String> keys) {
        List<FieldValue> values = new ArrayList<>(keys.size());
        for (String key : keys) {
            values.add(toFieldValue(spec, key));
        }
        return values;
    }

    private record RowKeys(List<String> keys, Long docCountError) {}

    private static RowKeys readTerms(Aggregate agg) {
        List<String> keys = new ArrayList<>();
        Long error = null;
        if (agg == null) {
            return new RowKeys(keys, null);
        }
        if (agg.isSterms()) {
            error = agg.sterms().docCountErrorUpperBound();
            agg.sterms().buckets().array().forEach(b -> keys.add(b.key()));
        } else if (agg.isLterms()) {
            error = agg.lterms().docCountErrorUpperBound();
            agg.lterms().buckets().array().forEach(b -> keys.add(b.key()));
        } else if (agg.isDterms()) {
            agg.dterms().buckets().array().forEach(b -> keys.add(String.valueOf(b.key())));
        }
        return new RowKeys(keys, error);
    }

    /** A minimal term-bucket view over string/long/double terms buckets. */
    private interface TermBucketView {
        String key();
        long docCount();
        Map<String, Aggregate> aggregations();
    }

    private static List<TermBucketView> termsBuckets(Aggregate agg) {
        List<TermBucketView> out = new ArrayList<>();
        if (agg == null) {
            return out;
        }
        if (agg.isSterms()) {
            for (var b : agg.sterms().buckets().array()) {
                out.add(new TermBucketView() {
                    public String key() { return b.key(); }
                    public long docCount() { return b.docCount(); }
                    public Map<String, Aggregate> aggregations() { return b.aggregations(); }
                });
            }
        } else if (agg.isLterms()) {
            for (var b : agg.lterms().buckets().array()) {
                out.add(new TermBucketView() {
                    public String key() { return b.key(); }
                    public long docCount() { return b.docCount(); }
                    public Map<String, Aggregate> aggregations() { return b.aggregations(); }
                });
            }
        } else if (agg.isDterms()) {
            for (var b : agg.dterms().buckets().array()) {
                out.add(new TermBucketView() {
                    public String key() { return String.valueOf(b.key()); }
                    public long docCount() { return b.docCount(); }
                    public Map<String, Aggregate> aggregations() { return b.aggregations(); }
                });
            }
        }
        return out;
    }

    private static long cardinalityValue(Aggregate agg) {
        return agg != null && agg.isCardinality() ? agg.cardinality().value() : 0L;
    }

    private List<PartialFailureDTO> partialFailures(SearchResponse<?> response) {
        List<PartialFailureDTO> failures = new ArrayList<>();
        if (response.timedOut()) {
            failures.add(new PartialFailureDTO("opensearch", "HUNT_TIMEOUT",
                "The crosstab query timed out and may contain partial results"));
        }
        if (response.shards() != null && response.shards().failed().longValue() > 0) {
            response.shards().failures().stream().limit(5).forEach(failure -> failures.add(
                new PartialFailureDTO(failure.index(), "HUNT_SHARD_FAILURE", failure.reason().reason())));
        }
        return failures;
    }
}
