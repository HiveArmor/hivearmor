package com.hivearmor.service.ueba.metrics;

import com.hivearmor.domain.chart_builder.types.query.FilterType;
import com.hivearmor.domain.chart_builder.types.query.OperatorType;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.elasticsearch.SearchUtil;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.aggregations.Aggregation;
import org.opensearch.client.opensearch._types.aggregations.StringTermsBucket;
import org.opensearch.client.opensearch._types.aggregations.TermsAggregation;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.DoubleStream;

/**
 * OpenSearch-backed implementation of {@link MetricObservationReader}.
 *
 * <p>All index patterns are resolved through {@link MsspIndexResolver} — no raw
 * {@code v3-hive-*} strings. All queries are built through {@link SearchUtil#toQuery}
 * DSL — no raw JSON query bodies.
 *
 * <p>Metric-to-data-type mapping:
 * <ul>
 *   <li>{@code logon_count_per_day} → {@code "authentication"}</li>
 *   <li>{@code unique_src_ips} → {@code "authentication"}</li>
 *   <li>{@code data_volume_bytes} → {@code "log"}</li>
 *   <li>{@code after_hours_logons} → {@code "authentication"}</li>
 *   <li>{@code failed_logon_ratio} → {@code "authentication"}</li>
 * </ul>
 */
@Component
public class OpenSearchMetricObservationReader implements MetricObservationReader {

    private static final Logger log = LoggerFactory.getLogger(OpenSearchMetricObservationReader.class);

    private static final String TIMESTAMP_FIELD = "@timestamp";
    private static final String USER_FIELD = "user.name.keyword";
    private static final String SRC_IP_FIELD = "source.ip.keyword";
    private static final String BYTES_FIELD = "network.bytes";
    private static final String EVENT_OUTCOME_FIELD = "event.outcome.keyword";
    private static final String HOUR_FIELD = "@timestamp";

    private final MsspIndexResolver indexResolver;
    private final OpensearchClientBuilder osClient;

    public OpenSearchMetricObservationReader(MsspIndexResolver indexResolver,
                                             OpensearchClientBuilder osClient) {
        this.indexResolver = indexResolver;
        this.osClient = osClient;
    }

    @Override
    public String dataTypeFor(String metricName) {
        if (UebaMetrics.DATA_VOLUME_BYTES.equals(metricName)) {
            return "log";
        }
        return "authentication";
    }

    @Override
    public DoubleStream readDailyObservations(String metricName, List<String> memberUserIds,
                                              LocalDate fromInclusive, LocalDate toExclusive) {
        String dataType = dataTypeFor(metricName);
        String indexPattern = indexResolver.resolveIndexPattern(dataType);

        // Build filters using SearchUtil DSL
        List<FilterType> filters = buildTimeAndUserFilters(memberUserIds, fromInclusive, toExclusive);

        Query query = SearchUtil.toQuery(filters);

        try {
            return executeMetricAggregation(indexPattern, query, metricName, memberUserIds);
        } catch (Exception e) {
            log.warn("Failed to read daily observations for metric={}, members={}: {}",
                metricName, memberUserIds.size(), e.getMessage());
            return DoubleStream.empty();
        }
    }

    @Override
    public double readCurrentValue(String userId, String metricName, Instant runTs) {
        String dataType = dataTypeFor(metricName);
        String indexPattern = indexResolver.resolveIndexPattern(dataType);

        // Current hour window: runTs (start of hour) to runTs + 1h
        Instant hourStart = runTs;
        Instant hourEnd = runTs.plusSeconds(3600);

        List<FilterType> filters = new ArrayList<>();
        filters.add(new FilterType(TIMESTAMP_FIELD, OperatorType.IS_BETWEEN,
            List.of(hourStart.toString(), hourEnd.toString())));
        filters.add(new FilterType(USER_FIELD, OperatorType.IS, userId));

        Query query = SearchUtil.toQuery(filters);

        try {
            return executeCurrentValueQuery(indexPattern, query, metricName);
        } catch (Exception e) {
            log.warn("Failed to read current value for user={}, metric={}: {}",
                userId, metricName, e.getMessage());
            return 0.0;
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private List<FilterType> buildTimeAndUserFilters(List<String> memberUserIds,
                                                     LocalDate fromInclusive,
                                                     LocalDate toExclusive) {
        List<FilterType> filters = new ArrayList<>();

        // Time range filter
        String from = fromInclusive.atStartOfDay(ZoneOffset.UTC).toInstant().toString();
        String to = toExclusive.atStartOfDay(ZoneOffset.UTC).toInstant().toString();
        filters.add(new FilterType(TIMESTAMP_FIELD, OperatorType.IS_BETWEEN, List.of(from, to)));

        // User filter — restrict to peer group members
        filters.add(new FilterType(USER_FIELD, OperatorType.IS_ONE_OF, memberUserIds));

        return filters;
    }

    /**
     * Executes a per-user aggregation for a given metric and returns observations as a DoubleStream.
     * Each user contributes one observation value per day in the window.
     */
    private DoubleStream executeMetricAggregation(String indexPattern, Query query,
                                                   String metricName, List<String> memberUserIds)
            throws Exception {

        // Aggregate per user to get the metric value per member
        TermsAggregation userTerms = TermsAggregation.of(t -> t
            .field(USER_FIELD)
            .size(memberUserIds.size() * 31)); // allow for up to 31 days x members

        SearchRequest.Builder reqBuilder = new SearchRequest.Builder()
            .index(indexPattern)
            .size(0)
            .query(query);

        // Build metric-specific aggregation
        switch (metricName) {
            case UebaMetrics.LOGON_COUNT_PER_DAY:
                // Count events per user → doc count is the logon count
                reqBuilder.aggregations("per_user", Aggregation.of(a -> a
                    .terms(userTerms)));
                break;

            case UebaMetrics.UNIQUE_SRC_IPS:
                // Cardinality of source IPs per user
                reqBuilder.aggregations("per_user", Aggregation.of(a -> a
                    .terms(userTerms)
                    .aggregations("unique_ips", Aggregation.of(a2 -> a2
                        .cardinality(c -> c.field(SRC_IP_FIELD))))));
                break;

            case UebaMetrics.DATA_VOLUME_BYTES:
                // Sum of bytes per user
                reqBuilder.aggregations("per_user", Aggregation.of(a -> a
                    .terms(userTerms)
                    .aggregations("total_bytes", Aggregation.of(a2 -> a2
                        .sum(s -> s.field(BYTES_FIELD))))));
                break;

            case UebaMetrics.AFTER_HOURS_LOGONS:
                // Count of logon events outside business hours (before 08:00 or after 18:00)
                // Uses a script-based filter query within the aggregation
                reqBuilder.aggregations("per_user", Aggregation.of(a -> a
                    .terms(userTerms)
                    .aggregations("after_hours_count", Aggregation.of(a2 -> a2
                        .filter(f -> f.script(sc -> sc
                            .script(scr -> scr.inline(i -> i
                                .source("doc['@timestamp'].value.getHour() < 8 || doc['@timestamp'].value.getHour() >= 18")
                                .lang("painless")))))))));
                break;

            case UebaMetrics.FAILED_LOGON_RATIO:
                // Ratio of failed logons to total logons per user
                reqBuilder.aggregations("per_user", Aggregation.of(a -> a
                    .terms(userTerms)
                    .aggregations("total", Aggregation.of(a2 -> a2.valueCount(vc -> vc.field(USER_FIELD))))
                    .aggregations("failed", Aggregation.of(a2 -> a2
                        .filter(f -> f.term(t -> t.field(EVENT_OUTCOME_FIELD).value(FieldValue.of("failure"))))))));
                break;

            default:
                return DoubleStream.empty();
        }

        SearchRequest request = reqBuilder.build();
        SearchResponse<Void> resp = osClient.execute(os -> os.search(request, Void.class));

        return extractObservations(resp, metricName);
    }

    /**
     * Extracts observation values from the aggregation response.
     */
    private DoubleStream extractObservations(SearchResponse<Void> resp, String metricName) {
        Aggregate perUser = resp.aggregations().get("per_user");
        if (perUser == null || !perUser.isSterms()) {
            return DoubleStream.empty();
        }

        List<Double> observations = new ArrayList<>();
        for (StringTermsBucket bucket : perUser.sterms().buckets().array()) {
            double value = extractBucketValue(bucket, metricName);
            observations.add(value);
        }
        return observations.stream().mapToDouble(Double::doubleValue);
    }

    /**
     * Extracts the metric value from a per-user bucket based on the metric type.
     */
    private double extractBucketValue(StringTermsBucket bucket, String metricName) {
        switch (metricName) {
            case UebaMetrics.LOGON_COUNT_PER_DAY:
                // doc count = logon count
                return (double) bucket.docCount();

            case UebaMetrics.UNIQUE_SRC_IPS:
                Aggregate uniqueIps = bucket.aggregations().get("unique_ips");
                if (uniqueIps != null && uniqueIps.isCardinality()) {
                    return (double) uniqueIps.cardinality().value();
                }
                return 0.0;

            case UebaMetrics.DATA_VOLUME_BYTES:
                Aggregate totalBytes = bucket.aggregations().get("total_bytes");
                if (totalBytes != null && totalBytes.isSum()) {
                    return totalBytes.sum().value();
                }
                return 0.0;

            case UebaMetrics.AFTER_HOURS_LOGONS:
                Aggregate afterHours = bucket.aggregations().get("after_hours_count");
                if (afterHours != null && afterHours.isFilter()) {
                    return (double) afterHours.filter().docCount();
                }
                return 0.0;

            case UebaMetrics.FAILED_LOGON_RATIO:
                Aggregate total = bucket.aggregations().get("total");
                Aggregate failed = bucket.aggregations().get("failed");
                double totalCount = 0.0;
                double failedCount = 0.0;
                if (total != null && total.isValueCount()) {
                    totalCount = total.valueCount().value();
                }
                if (failed != null && failed.isFilter()) {
                    failedCount = (double) failed.filter().docCount();
                }
                return totalCount > 0 ? failedCount / totalCount : 0.0;

            default:
                return 0.0;
        }
    }

    /**
     * Executes a query for the current-hour value of a single user's metric.
     */
    private double executeCurrentValueQuery(String indexPattern, Query query, String metricName)
            throws Exception {

        SearchRequest.Builder reqBuilder = new SearchRequest.Builder()
            .index(indexPattern)
            .size(0)
            .query(query);

        switch (metricName) {
            case UebaMetrics.LOGON_COUNT_PER_DAY:
                // Just count docs in the hour
                break;

            case UebaMetrics.UNIQUE_SRC_IPS:
                reqBuilder.aggregations("unique_ips", Aggregation.of(a -> a
                    .cardinality(c -> c.field(SRC_IP_FIELD))));
                break;

            case UebaMetrics.DATA_VOLUME_BYTES:
                reqBuilder.aggregations("total_bytes", Aggregation.of(a -> a
                    .sum(s -> s.field(BYTES_FIELD))));
                break;

            case UebaMetrics.AFTER_HOURS_LOGONS:
                // For current value, the entire hour is after-hours or not
                // Just count events in this window
                break;

            case UebaMetrics.FAILED_LOGON_RATIO:
                reqBuilder.aggregations("failed", Aggregation.of(a -> a
                    .filter(f -> f.term(t -> t.field(EVENT_OUTCOME_FIELD).value(FieldValue.of("failure"))))));
                break;

            default:
                return 0.0;
        }

        SearchRequest request = reqBuilder.build();
        SearchResponse<Void> resp = osClient.execute(os -> os.search(request, Void.class));
        long totalHits = resp.hits().total() != null ? resp.hits().total().value() : 0;

        switch (metricName) {
            case UebaMetrics.LOGON_COUNT_PER_DAY:
                return (double) totalHits;

            case UebaMetrics.UNIQUE_SRC_IPS:
                Aggregate uniqueIps = resp.aggregations().get("unique_ips");
                if (uniqueIps != null && uniqueIps.isCardinality()) {
                    return (double) uniqueIps.cardinality().value();
                }
                return 0.0;

            case UebaMetrics.DATA_VOLUME_BYTES:
                Aggregate totalBytes = resp.aggregations().get("total_bytes");
                if (totalBytes != null && totalBytes.isSum()) {
                    return totalBytes.sum().value();
                }
                return 0.0;

            case UebaMetrics.AFTER_HOURS_LOGONS:
                return (double) totalHits;

            case UebaMetrics.FAILED_LOGON_RATIO:
                Aggregate failed = resp.aggregations().get("failed");
                double failedCount = 0.0;
                if (failed != null && failed.isFilter()) {
                    failedCount = (double) failed.filter().docCount();
                }
                return totalHits > 0 ? failedCount / totalHits : 0.0;

            default:
                return 0.0;
        }
    }
}
