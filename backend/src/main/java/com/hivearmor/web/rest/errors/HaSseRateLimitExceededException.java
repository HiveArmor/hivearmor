package com.hivearmor.web.rest.errors;

/**
 * Thrown when an SSE connection request exceeds the rate limit for the tenant,
 * resource, or endpoint.
 *
 * <p>The global exception handler maps this to a 429 RFC 7807 problem response
 * with retry-after and connection count metadata.
 *
 * <p>Requirements: REQ-6 (HAR-006)
 */
public class HaSseRateLimitExceededException extends RuntimeException {

    private final int retryAfter;
    private final int currentConnections;
    private final int maxConnections;

    /**
     * Creates a new SSE rate limit exceeded exception.
     *
     * @param retryAfter         seconds the client should wait before retrying
     * @param currentConnections the current number of active connections
     * @param maxConnections     the maximum allowed connections
     */
    public HaSseRateLimitExceededException(int retryAfter, int currentConnections, int maxConnections) {
        super("SSE connection limit exceeded: " + currentConnections + "/" + maxConnections);
        this.retryAfter = retryAfter;
        this.currentConnections = currentConnections;
        this.maxConnections = maxConnections;
    }

    public int getRetryAfter() {
        return retryAfter;
    }

    public int getCurrentConnections() {
        return currentConnections;
    }

    public int getMaxConnections() {
        return maxConnections;
    }
}
