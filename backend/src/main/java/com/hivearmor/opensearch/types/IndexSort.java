package com.hivearmor.opensearch.types;

import com.hivearmor.opensearch.enums.IndexSortableProperty;
import org.opensearch.client.opensearch._types.SortOrder;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Encapsulates sort criteria for index listing queries.
 * Replaces com.hivearmor.opensearch_connector.types.IndexSort
 *
 * Usage pattern (matches existing callers):
 *   IndexSort.unSorted()
 *   IndexSort.builder().with(IndexSortableProperty.CreationDate, SortOrder.Asc).build()
 */
public class IndexSort {

    /** A single sort field + direction pair. */
    public static class Entry {
        private final IndexSortableProperty property;
        private final SortOrder order;

        public Entry(IndexSortableProperty property, SortOrder order) {
            this.property = property;
            this.order = order;
        }

        public IndexSortableProperty getProperty() {
            return property;
        }

        public SortOrder getOrder() {
            return order;
        }
    }

    private final List<Entry> entries;

    private IndexSort(List<Entry> entries) {
        this.entries = Collections.unmodifiableList(entries);
    }

    /** Returns an unsorted IndexSort instance (no sort criteria applied). */
    public static IndexSort unSorted() {
        return new IndexSort(Collections.emptyList());
    }

    public boolean isUnsorted() {
        return entries.isEmpty();
    }

    public List<Entry> getEntries() {
        return entries;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private final List<Entry> entries = new ArrayList<>();

        public Builder with(IndexSortableProperty property, SortOrder order) {
            entries.add(new Entry(property, order));
            return this;
        }

        public IndexSort build() {
            return new IndexSort(entries);
        }
    }
}
