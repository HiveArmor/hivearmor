package com.hivearmor.web.rest.elasticsearch;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;

/**
 * Handles {@link TenantScopeViolationException} thrown by
 * {@link ElasticsearchResource} when a tenant user requests an index pattern
 * outside their authorized scope.
 *
 * <p>Returns HTTP 403 with a problem+json body per RFC 7807:
 * <pre>
 * {
 *   "type": "about:blank",
 *   "title": "Forbidden",
 *   "status": 403,
 *   "detail": "Index pattern is outside the authorized tenant scope",
 *   "code": "TENANT_SCOPE_VIOLATION"
 * }
 * </pre>
 */
@RestControllerAdvice(basePackages = "com.hivearmor.web.rest.elasticsearch")
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ElasticsearchProblemHandler {

    @ExceptionHandler(TenantScopeViolationException.class)
    public ProblemDetail handleTenantScopeViolation(TenantScopeViolationException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.FORBIDDEN);
        pd.setType(URI.create("about:blank"));
        pd.setTitle("Forbidden");
        pd.setDetail("Index pattern is outside the authorized tenant scope");
        pd.setProperty("code", "TENANT_SCOPE_VIOLATION");
        return pd;
    }
}
