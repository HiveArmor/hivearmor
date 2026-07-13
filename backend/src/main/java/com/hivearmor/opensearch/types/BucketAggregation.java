package com.hivearmor.opensearch.types;

import org.opensearch.client.opensearch._types.aggregations.Aggregate;

import java.util.Map;

/**
 * Represents a single bucket from a terms or date-histogram aggregation response.
 * Replaces com.hivearmor.opensearch_connector.types.BucketAggregation
 *
 * Fields accessed by callers:
 *   - getKey()               — the bucket key (string representation)
 *   - getDocCount()          — document count for this bucket
 *   - getSubAggregations()   — nested aggregations keyed by aggregation name
 */
public class BucketAggregation {

    private String key;
    private final long docCount;
    private final Map<String, Aggregate> subAggregations;

    public BucketAggregation(String key, long docCount, Map<String, Aggregate> subAggregations) {
        this.key = key;
        this.docCount = docCount;
        this.subAggregations = subAggregations;
    }

    /** Bucket key — string label (term value, or date string for date-histogram buckets). */
    public String getKey() {
        return key;
    }

    /** Allows callers to override the key (e.g. replace empty string with "UNKNOWN"). */
    public void setKey(String key) {
        this.key = key;
    }

    /** Number of documents in this bucket. */
    public long getDocCount() {
        return docCount;
    }

    /**
     * Nested aggregations for this bucket.
     * Keys are the aggregation names defined in the request.
     */
    public Map<String, Aggregate> getSubAggregations() {
        return subAggregations;
    }
}
