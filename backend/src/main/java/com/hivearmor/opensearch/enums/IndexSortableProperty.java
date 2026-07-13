package com.hivearmor.opensearch.enums;

/**
 * Properties by which index listings can be sorted.
 * Replaces com.hivearmor.opensearch_connector.enums.IndexSortableProperty
 */
public enum IndexSortableProperty {
    CreationDate("creation.date"),
    IndexName("index"),
    DocsCount("docs.count"),
    StoreSize("store.size"),
    PrimaryStoreSize("pri.store.size");

    private final String jsonValue;

    IndexSortableProperty(String jsonValue) {
        this.jsonValue = jsonValue;
    }

    public String getJsonValue() {
        return jsonValue;
    }

    /**
     * Resolve from the JSON/query-param value (e.g. "creation.date" → CreationDate).
     * Falls back to IndexName when the value is unrecognised.
     */
    public static IndexSortableProperty fromJsonValue(String value) {
        if (value == null) return IndexName;
        for (IndexSortableProperty p : values()) {
            if (p.jsonValue.equalsIgnoreCase(value) || p.name().equalsIgnoreCase(value)) {
                return p;
            }
        }
        return IndexName;
    }
}
