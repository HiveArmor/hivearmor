package com.hivearmor.opensearch.enums;

/**
 * HTTP scheme for OpenSearch connection.
 * Replaces com.hivearmor.opensearch_connector.enums.HttpScheme
 */
public enum HttpScheme {
    http, https;

    public String getValue() {
        return this.name();
    }
}
