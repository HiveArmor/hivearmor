package com.hivearmor.opensearch.types;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Response from OpenSearch SQL query endpoint (_plugins/_sql).
 * Replaces com.hivearmor.opensearch_connector.types.SearchSqlResponse
 *
 * Callers access:
 *   - getData()   — list of row maps
 *   - getSchema() — column definitions (optional, may be null)
 *
 * OpenSearch SQL response format:
 * {
 *   "schema": [{"name": "col", "type": "text"}, ...],
 *   "datarows": [[val1, val2], ...],
 *   "total": 100,
 *   "size": 10,
 *   "status": 200
 * }
 *
 * The connector maps datarows + schema into a List<T> (data field).
 * For Map.class callers, each row becomes a Map<String, Object> keyed by column name.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class SearchSqlResponse<T> {

    @JsonProperty("schema")
    private List<Map<String, String>> schema;

    @JsonProperty("datarows")
    private List<List<Object>> datarows;

    @JsonProperty("total")
    private long total;

    @JsonProperty("size")
    private long size;

    @JsonProperty("status")
    private int status;

    /**
     * Returns rows as typed objects. For Map.class callers each row is a
     * Map<String, Object> where keys are column names from the schema.
     *
     * NOTE: This method performs schema-based mapping at access time. The
     * connector performed this mapping during deserialization; we replicate
     * the same behaviour here to maintain compatibility with all callers.
     */
    @SuppressWarnings("unchecked")
    public List<T> getData() {
        if (datarows == null || datarows.isEmpty()) return Collections.emptyList();
        if (schema == null || schema.isEmpty()) return Collections.emptyList();

        List<String> columnNames = schema.stream()
                .map(col -> col.getOrDefault("name", ""))
                .collect(java.util.stream.Collectors.toList());

        return datarows.stream()
                .map(row -> {
                    java.util.LinkedHashMap<String, Object> map = new java.util.LinkedHashMap<>();
                    for (int i = 0; i < columnNames.size() && i < row.size(); i++) {
                        map.put(columnNames.get(i), row.get(i));
                    }
                    return (T) map;
                })
                .collect(java.util.stream.Collectors.toList());
    }

    public List<Map<String, String>> getSchema()   { return schema; }
    public List<List<Object>>        getDatarows() { return datarows; }
    public long   getTotal()  { return total; }
    public long   getSize()   { return size; }
    public int    getStatus() { return status; }

    // Setters for Jackson deserialization
    public void setSchema(List<Map<String, String>> schema)   { this.schema = schema; }
    public void setDatarows(List<List<Object>> datarows)       { this.datarows = datarows; }
    public void setTotal(long total)   { this.total = total; }
    public void setSize(long size)     { this.size = size; }
    public void setStatus(int status)  { this.status = status; }
}
