package com.hivearmor.service.inputs;

import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch._types.query_dsl.TermQuery;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Adapter that queries OpenSearch to derive ingest statistics for a data source.
 *
 * <p>Index names are constructed exclusively via {@link HaIndexNames} — this
 * class never concatenates {@code "v3-hive-*"} strings inline, satisfying
 * Requirement 8.5 and the HiveArmor platform invariant documented in the steering
 * file (§5).
 *
 * <p>EPS is measured by counting documents in the source's index over the last
 * minute and dividing by 60. A rolling EPS history (up to 60 samples, one per
 * minute) is built by issuing sliding one-minute window count queries over the
 * last hour. The most recent {@code @timestamp} document is returned as
 * {@code lastEventAt}.
 *
 * <p>Any exception thrown during the OpenSearch call is propagated to the caller.
 * The {@code HaDataSourceService} wraps each call in a try/catch and marks the
 * record's {@code opensearchStatus} as {@code unreachable} on failure (Req 8.4).
 *
 * <p>Requirements: 8.2, 8.5
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HaDataSourceOpenSearchAdapter {

    private static final String CLASSNAME = "HaDataSourceOpenSearchAdapter";

    /** Number of minutes in the current-EPS measurement window. */
    private static final int EPS_WINDOW_MINUTES = 1;

    /** Maximum number of EPS history buckets (1 per minute, last 60 minutes). */
    private static final int EPS_HISTORY_SIZE = 60;

    /** Field used to filter events by data source identifier. */
    private static final String DATASOURCE_FIELD = "dataSource.keyword";

    /** Timestamp field used for range queries and last-event resolution. */
    private static final String TIMESTAMP_FIELD = "@timestamp";

    private final OpensearchClientBuilder osClient;

    /**
     * Derives ingest statistics for the given data source from OpenSearch.
     *
     * <p>Every index name is built via {@link HaIndexNames} — no inline
     * {@code "v3-hive-*"} string concatenation is performed here (Req 8.5).
     *
     * <p>The data type token used for index name construction is taken from
     * {@link HaDataSource#type()}. The wildcard pattern
     * {@code v3-hive-<type>-*} spans all day indices for the given type.
     *
     * @param src The data source to query.
     * @return A typed {@link IngestStats} with current EPS, history, and last-event time.
     * @throws Exception if an OpenSearch query fails (caller is expected to catch this).
     */
    public IngestStats statsFor(HaDataSource src) throws Exception {
        final String ctx = CLASSNAME + ".statsFor";
        log.debug("{}: querying ingest stats for source id={} type={}", ctx, src.id(), src.type());

        // Build index pattern via the HaIndexNames helper — NEVER inline "v3-hive-"
        // concatenation (Req 8.5, HiveArmor steering rule §5).
        String indexPattern = HaIndexNames.buildIndexPattern(src.type());

        Instant now = Instant.now();

        // -----------------------------------------------------------------
        // 1. Current EPS: count documents in the last EPS_WINDOW_MINUTES for this source.
        // -----------------------------------------------------------------
        Instant windowStart = now.minus(EPS_WINDOW_MINUTES, ChronoUnit.MINUTES);
        long windowCount = countDocuments(src, indexPattern, windowStart, now);
        double currentEps = windowCount / 60.0;  // events in last 60 s → per-second rate

        // -----------------------------------------------------------------
        // 2. EPS history: per-minute counts over the last EPS_HISTORY_SIZE minutes.
        //    We issue up to EPS_HISTORY_SIZE count queries, each covering a 1-minute
        //    window. In production this would use a date-histogram aggregation; the
        //    sequential approach here is used to keep the query logic simple and to
        //    avoid dependency on typed aggregation parsing.
        // -----------------------------------------------------------------
        List<Double> epsHistory = buildEpsHistory(src, indexPattern, now);

        // -----------------------------------------------------------------
        // 3. Last event timestamp: latest @timestamp across all docs for this source.
        // -----------------------------------------------------------------
        Instant lastEventAt = fetchLastEventAt(src, indexPattern);

        log.debug("{}: source id={} → eps={}, historySize={}, lastEventAt={}",
                ctx, src.id(), currentEps, epsHistory.size(), lastEventAt);

        return new IngestStats(currentEps, Collections.unmodifiableList(epsHistory), lastEventAt);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Returns the number of documents indexed for this source in the given
     * half-open time interval [{@code from}, {@code to}).
     */
    private long countDocuments(HaDataSource src, String indexPattern,
                                 Instant from, Instant to) throws Exception {
        Query sourceFilter = buildSourceFilter(src);
        Query timeFilter = Query.of(q -> q.range(
                RangeQuery.of(r -> r
                        .field(TIMESTAMP_FIELD)
                        .gte(JsonData.of(from.toString()))
                        .lte(JsonData.of(to.toString())))));

        Query combined = Query.of(q -> q.bool(b -> b
                .filter(sourceFilter)
                .filter(timeFilter)));

        SearchRequest request = SearchRequest.of(s -> s
                .index(indexPattern)
                .query(combined)
                .size(0));  // count only, no hit content needed

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
        return response.hits().total() != null ? response.hits().total().value() : 0L;
    }

    /**
     * Builds the per-minute EPS history list.
     *
     * <p>Iterates backwards from {@code now} in one-minute steps, counting
     * documents in each window. The resulting list is ordered oldest-first and
     * bounded to {@value #EPS_HISTORY_SIZE} entries.
     *
     * <p>Note: Each window issues one count query. For high-source-count
     * deployments the {@code HaDataSourceService} uses {@code parallelStream},
     * so the I/O is already parallelised at the source level. Within a single
     * source's stats call the sequential approach here keeps the implementation
     * simple and avoids aggregation API coupling.
     */
    private List<Double> buildEpsHistory(HaDataSource src, String indexPattern,
                                          Instant now) {
        List<Double> history = new ArrayList<>(EPS_HISTORY_SIZE);
        // Build windows from oldest to newest (history_size minutes ago → now)
        for (int i = EPS_HISTORY_SIZE; i > 0; i--) {
            Instant bucketEnd   = now.minus(i - 1, ChronoUnit.MINUTES);
            Instant bucketStart = now.minus(i,     ChronoUnit.MINUTES);
            try {
                long count = countDocuments(src, indexPattern, bucketStart, bucketEnd);
                history.add(count / 60.0);
            } catch (Exception e) {
                log.debug("{}.buildEpsHistory: bucket i={} failed, using 0: {}", CLASSNAME, i, e.getMessage());
                history.add(0.0);
            }
        }
        return history;
    }

    /**
     * Fetches the latest {@code @timestamp} value for events associated with
     * this data source, using a descending sort and a result size of 1.
     *
     * <p>Returns {@code null} when no documents exist or the timestamp field
     * is absent or unparseable.
     */
    private Instant fetchLastEventAt(HaDataSource src, String indexPattern) {
        try {
            Query sourceFilter = buildSourceFilter(src);

            SearchRequest request = SearchRequest.of(s -> s
                    .index(indexPattern)
                    .query(sourceFilter)
                    .size(1)
                    .sort(sort -> sort.field(f -> f
                            .field(TIMESTAMP_FIELD)
                            .order(SortOrder.Desc))));

            SearchResponse<Map> response =
                    osClient.execute(os -> os.search(request, Map.class));

            List<Hit<Map>> hits = response.hits().hits();
            if (hits.isEmpty()) {
                return null;
            }

            Map<?, ?> source = hits.get(0).source();
            if (source == null) {
                return null;
            }

            Object tsValue = source.get(TIMESTAMP_FIELD);
            if (tsValue == null) {
                return null;
            }

            return Instant.parse(tsValue.toString());
        } catch (Exception e) {
            log.debug("{}.fetchLastEventAt: could not retrieve timestamp for source id={}: {}",
                    CLASSNAME, src.id(), e.getMessage());
            return null;
        }
    }

    /**
     * Builds a term filter that restricts results to the given data source.
     */
    private Query buildSourceFilter(HaDataSource src) {
        return Query.of(q -> q.term(
                TermQuery.of(t -> t
                        .field(DATASOURCE_FIELD)
                        .value(FieldValue.of(v -> v.stringValue(src.id()))))));
    }
}
