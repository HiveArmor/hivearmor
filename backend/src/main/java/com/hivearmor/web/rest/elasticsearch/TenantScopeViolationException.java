package com.hivearmor.web.rest.elasticsearch;

/**
 * Thrown when a tenant-scoped user attempts to query an index pattern
 * outside their authorized scope.
 *
 * <p>Handled by {@link ElasticsearchProblemHandler} to return HTTP 403
 * with a problem+json body.
 */
public class TenantScopeViolationException extends RuntimeException {

    public TenantScopeViolationException(String requestedPattern) {
        super("Index pattern '" + requestedPattern + "' is outside tenant scope");
    }
}
