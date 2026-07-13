package com.hivearmor.opensearch.types;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Request payload for OpenSearch SQL query endpoint (_plugins/_sql).
 * Replaces com.hivearmor.opensearch_connector.types.SqlQueryRequest
 *
 * Usage: new SqlQueryRequest(sqlString, null)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SqlQueryRequest {

    @JsonProperty("query")
    private final String query;

    @JsonProperty("filter")
    private final Object filter;

    public SqlQueryRequest(String query, Object filter) {
        this.query  = query;
        this.filter = filter;
    }

    public String getQuery()  { return query; }
    public Object getFilter() { return filter; }
}
