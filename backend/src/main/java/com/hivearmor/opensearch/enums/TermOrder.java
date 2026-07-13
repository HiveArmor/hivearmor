package com.hivearmor.opensearch.enums;

/**
 * Controls ordering of terms aggregation buckets.
 * Replaces com.hivearmor.opensearch_connector.enums.TermOrder
 */
public enum TermOrder {
    /** Order by document count (most frequent first when combined with SortOrder.Desc) */
    Count,
    /** Order alphabetically by bucket key */
    Key
}
