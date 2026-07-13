package com.hivearmor.opensearch.parsers;

import com.hivearmor.opensearch.types.BucketAggregation;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.aggregations.StringTermsBucket;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Parses a terms aggregation Aggregate into a list of BucketAggregation objects.
 * Replaces com.hivearmor.opensearch_connector.parsers.TermAggregateParser
 *
 * Usage (all callers pass an Aggregate from response.aggregations().get(name)):
 *   List<BucketAggregation> buckets = TermAggregateParser.parse(aggregate);
 */
public final class TermAggregateParser {

    private TermAggregateParser() {}

    /**
     * Parses a terms aggregation from the OpenSearch response.
     *
     * @param aggregate the Aggregate object from response.aggregations().get(aggName)
     * @return list of buckets; empty list if aggregate is null or not a terms aggregation
     */
    public static List<BucketAggregation> parse(Aggregate aggregate) {
        if (aggregate == null) return Collections.emptyList();

        // sterms (string terms) — most common case
        if (aggregate.isSterms()) {
            return aggregate.sterms().buckets().array().stream()
                    .map(b -> new BucketAggregation(
                            b.key(),
                            b.docCount(),
                            b.aggregations()))
                    .collect(Collectors.toList());
        }

        // lterms (long/numeric terms)
        if (aggregate.isLterms()) {
            return aggregate.lterms().buckets().array().stream()
                    .map(b -> new BucketAggregation(
                            String.valueOf(b.key()),
                            b.docCount(),
                            b.aggregations()))
                    .collect(Collectors.toList());
        }

        // dterms (double terms)
        if (aggregate.isDterms()) {
            return aggregate.dterms().buckets().array().stream()
                    .map(b -> new BucketAggregation(
                            String.valueOf(b.key()),
                            b.docCount(),
                            b.aggregations()))
                    .collect(Collectors.toList());
        }

        // multi-terms
        if (aggregate.isMultiTerms()) {
            return aggregate.multiTerms().buckets().array().stream()
                    .map(b -> new BucketAggregation(
                            b.keyAsString(),
                            b.docCount(),
                            b.aggregations()))
                    .collect(Collectors.toList());
        }

        return Collections.emptyList();
    }
}
