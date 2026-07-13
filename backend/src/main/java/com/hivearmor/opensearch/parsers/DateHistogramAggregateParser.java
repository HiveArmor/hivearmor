package com.hivearmor.opensearch.parsers;

import com.hivearmor.opensearch.types.BucketAggregation;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Parses a date_histogram aggregation Aggregate into a list of BucketAggregation objects.
 * Replaces com.hivearmor.opensearch_connector.parsers.DateHistogramAggregateParser
 *
 * Usage:
 *   List<BucketAggregation> buckets = DateHistogramAggregateParser.parse(aggregate);
 *
 * The bucket key is the ISO-8601 date string representation of the bucket.
 * Sub-aggregations are preserved for callers that drill into nested aggregations.
 */
public final class DateHistogramAggregateParser {

    private DateHistogramAggregateParser() {}

    /**
     * Parses a date_histogram aggregation.
     *
     * @param aggregate the Aggregate object from response.aggregations().get(aggName)
     * @return list of buckets; empty list if aggregate is null or not a date_histogram
     */
    public static List<BucketAggregation> parse(Aggregate aggregate) {
        if (aggregate == null) return Collections.emptyList();

        if (!aggregate.isDateHistogram()) return Collections.emptyList();

        return aggregate.dateHistogram().buckets().array().stream()
                .map(b -> new BucketAggregation(
                        // keyAsString gives the human-readable date (e.g. "2024-01-01T00:00:00.000Z")
                        b.keyAsString() != null ? b.keyAsString() : String.valueOf(b.key()),
                        b.docCount(),
                        b.aggregations()))
                .collect(Collectors.toList());
    }
}
