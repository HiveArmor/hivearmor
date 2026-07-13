package com.hivearmor.opensearch.exceptions;

/**
 * Wraps OpenSearch client errors as a checked exception.
 * Replaces com.hivearmor.opensearch_connector.exceptions.OpenSearchException
 */
public class OpenSearchException extends Exception {

    public OpenSearchException(String message) {
        super(message);
    }

    public OpenSearchException(String message, Throwable cause) {
        super(message, cause);
    }
}
