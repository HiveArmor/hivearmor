package com.hivearmor.web.rest.errors;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonIgnore;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;

import java.net.URI;
import java.util.List;

/**
 * HiveArmor extension of Spring's RFC 7807 {@link ProblemDetail}.
 *
 * <p>Adds platform-specific fields such as correlation ID, structured validation
 * errors, resource identifiers for 404 responses, and rate-limit metadata for 429
 * responses. Null fields are omitted from serialization via Jackson.
 *
 * <p>Extension fields are stored using {@link ProblemDetail#setProperty(String, Object)}
 * so they serialize as top-level JSON properties alongside the standard RFC 7807 members.
 *
 * <p>Requirements: REQ-2 (HAR-002)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HaProblemDetail extends ProblemDetail {

    /**
     * Creates an {@code HaProblemDetail} for the given HTTP status.
     *
     * @param status the HTTP status code
     */
    public HaProblemDetail(HttpStatusCode status) {
        super(status.value());
    }

    // -------------------------------------------------------------------------
    // Correlation ID — present on all error responses
    // -------------------------------------------------------------------------

    /**
     * Sets the request correlation UUID.
     *
     * @param correlationId the correlation ID (UUID format)
     * @return this instance for fluent chaining
     */
    public HaProblemDetail correlationId(String correlationId) {
        setProperty("correlationId", correlationId);
        return this;
    }

    /**
     * Returns the correlation ID.
     */
    @JsonIgnore
    public String getCorrelationId() {
        Object val = getProperties() != null ? getProperties().get("correlationId") : null;
        return val instanceof String s ? s : null;
    }

    // -------------------------------------------------------------------------
    // Field errors — for 400 validation responses
    // -------------------------------------------------------------------------

    /**
     * Sets structured validation field errors.
     *
     * @param fieldErrors the list of field-level errors
     * @return this instance for fluent chaining
     */
    public HaProblemDetail fieldErrors(List<HaFieldError> fieldErrors) {
        setProperty("fieldErrors", fieldErrors);
        return this;
    }

    /**
     * Returns the field errors list, or null if not set.
     */
    @SuppressWarnings("unchecked")
    @JsonIgnore
    public List<HaFieldError> getFieldErrors() {
        Object val = getProperties() != null ? getProperties().get("fieldErrors") : null;
        return val instanceof List<?> list ? (List<HaFieldError>) list : null;
    }

    // -------------------------------------------------------------------------
    // Resource identifiers — for 404 responses
    // -------------------------------------------------------------------------

    /**
     * Sets the resource type for 404 not-found responses.
     *
     * @param resourceType the type of resource that was not found (e.g., "alert", "incident")
     * @return this instance for fluent chaining
     */
    public HaProblemDetail resourceType(String resourceType) {
        setProperty("resourceType", resourceType);
        return this;
    }

    /**
     * Returns the resource type.
     */
    @JsonIgnore
    public String getResourceType() {
        Object val = getProperties() != null ? getProperties().get("resourceType") : null;
        return val instanceof String s ? s : null;
    }

    /**
     * Sets the resource ID for 404 not-found responses.
     *
     * @param resourceId the ID of the resource that was not found
     * @return this instance for fluent chaining
     */
    public HaProblemDetail resourceId(String resourceId) {
        setProperty("resourceId", resourceId);
        return this;
    }

    /**
     * Returns the resource ID.
     */
    @JsonIgnore
    public String getResourceId() {
        Object val = getProperties() != null ? getProperties().get("resourceId") : null;
        return val instanceof String s ? s : null;
    }

    // -------------------------------------------------------------------------
    // Rate limiting — for 429 responses
    // -------------------------------------------------------------------------

    /**
     * Sets the retry-after duration in seconds for 429 responses.
     *
     * @param retryAfter seconds the client should wait before retrying
     * @return this instance for fluent chaining
     */
    public HaProblemDetail retryAfter(Integer retryAfter) {
        setProperty("retryAfter", retryAfter);
        return this;
    }

    /**
     * Returns the retry-after value in seconds.
     */
    @JsonIgnore
    public Integer getRetryAfter() {
        Object val = getProperties() != null ? getProperties().get("retryAfter") : null;
        return val instanceof Integer i ? i : null;
    }

    /**
     * Sets the current SSE connection count for the tenant (429 responses).
     *
     * @param currentConnections the current number of active connections
     * @return this instance for fluent chaining
     */
    public HaProblemDetail currentConnections(Integer currentConnections) {
        setProperty("currentConnections", currentConnections);
        return this;
    }

    /**
     * Returns the current connection count.
     */
    @JsonIgnore
    public Integer getCurrentConnections() {
        Object val = getProperties() != null ? getProperties().get("currentConnections") : null;
        return val instanceof Integer i ? i : null;
    }

    /**
     * Sets the maximum allowed SSE connections for the tenant (429 responses).
     *
     * @param maxConnections the maximum connection limit
     * @return this instance for fluent chaining
     */
    public HaProblemDetail maxConnections(Integer maxConnections) {
        setProperty("maxConnections", maxConnections);
        return this;
    }

    /**
     * Returns the maximum connection limit.
     */
    @JsonIgnore
    public Integer getMaxConnections() {
        Object val = getProperties() != null ? getProperties().get("maxConnections") : null;
        return val instanceof Integer i ? i : null;
    }

    // -------------------------------------------------------------------------
    // Idempotency conflict — for 409 responses
    // -------------------------------------------------------------------------

    /**
     * Sets the idempotency key that caused the conflict (409 responses).
     *
     * @param idempotencyKey the conflicting key
     * @return this instance for fluent chaining
     */
    public HaProblemDetail idempotencyKey(String idempotencyKey) {
        setProperty("idempotencyKey", idempotencyKey);
        return this;
    }

    /**
     * Returns the idempotency key.
     */
    @JsonIgnore
    public String getIdempotencyKey() {
        Object val = getProperties() != null ? getProperties().get("idempotencyKey") : null;
        return val instanceof String s ? s : null;
    }

    /**
     * Sets the existing resource ID for 409 conflict responses.
     *
     * @param existingResourceId the ID of the already-existing resource
     * @return this instance for fluent chaining
     */
    public HaProblemDetail existingResourceId(String existingResourceId) {
        setProperty("existingResourceId", existingResourceId);
        return this;
    }

    /**
     * Returns the existing resource ID.
     */
    @JsonIgnore
    public String getExistingResourceId() {
        Object val = getProperties() != null ? getProperties().get("existingResourceId") : null;
        return val instanceof String s ? s : null;
    }

    // -------------------------------------------------------------------------
    // Static factory methods
    // -------------------------------------------------------------------------

    /**
     * Creates a new {@code HaProblemDetail} for the given status code.
     *
     * @param status HTTP status code
     * @return a new instance
     */
    public static HaProblemDetail forStatus(HttpStatusCode status) {
        return new HaProblemDetail(status);
    }

    /**
     * Creates a new {@code HaProblemDetail} for the given integer status.
     *
     * @param status HTTP status code as int
     * @return a new instance
     */
    public static HaProblemDetail forStatus(int status) {
        return new HaProblemDetail(HttpStatusCode.valueOf(status));
    }

    /**
     * Creates a validation-failed problem detail (400).
     *
     * @param correlationId the request correlation ID
     * @param fieldErrors   the structured field errors
     * @param instance      the request URI
     * @return a fully populated problem detail for validation errors
     */
    public static HaProblemDetail validationFailed(String correlationId,
                                                   List<HaFieldError> fieldErrors,
                                                   String instance) {
        HaProblemDetail problem = forStatus(400);
        problem.setType(URI.create("https://hivearmor.io/problems/validation-failed"));
        problem.setTitle("Validation Failed");
        problem.setDetail("Request body contains " + fieldErrors.size() + " invalid field"
                + (fieldErrors.size() == 1 ? "" : "s"));
        problem.setInstance(URI.create(instance));
        problem.correlationId(correlationId);
        problem.fieldErrors(fieldErrors);
        return problem;
    }

    /**
     * Creates a resource-not-found problem detail (404).
     *
     * @param correlationId the request correlation ID
     * @param resourceType  the type of resource (e.g., "alert")
     * @param resourceId    the resource identifier
     * @param instance      the request URI
     * @return a fully populated problem detail for not-found errors
     */
    public static HaProblemDetail resourceNotFound(String correlationId,
                                                   String resourceType,
                                                   String resourceId,
                                                   String instance) {
        HaProblemDetail problem = forStatus(404);
        problem.setType(URI.create("https://hivearmor.io/problems/resource-not-found"));
        problem.setTitle("Resource Not Found");
        problem.setDetail(capitalize(resourceType) + " with ID '" + resourceId + "' not found");
        problem.setInstance(URI.create(instance));
        problem.correlationId(correlationId);
        problem.resourceType(resourceType);
        problem.resourceId(resourceId);
        return problem;
    }

    /**
     * Creates a rate-limited problem detail (429) for SSE connections.
     *
     * @param correlationId      the request correlation ID
     * @param retryAfter         seconds to wait before retrying
     * @param currentConnections current active connection count
     * @param maxConnections     maximum allowed connections
     * @param instance           the request URI
     * @return a fully populated problem detail for rate-limit errors
     */
    public static HaProblemDetail rateLimited(String correlationId,
                                              int retryAfter,
                                              int currentConnections,
                                              int maxConnections,
                                              String instance) {
        HaProblemDetail problem = forStatus(429);
        problem.setType(URI.create("https://hivearmor.io/problems/rate-limited"));
        problem.setTitle("Too Many Connections");
        problem.setDetail("SSE connection limit exceeded for tenant");
        problem.setInstance(URI.create(instance));
        problem.correlationId(correlationId);
        problem.retryAfter(retryAfter);
        problem.currentConnections(currentConnections);
        problem.maxConnections(maxConnections);
        return problem;
    }

    /**
     * Creates an idempotency-conflict problem detail (409).
     *
     * @param correlationId      the request correlation ID
     * @param idempotencyKey     the conflicting key
     * @param existingResourceId the existing resource created by the original request
     * @param instance           the request URI
     * @return a fully populated problem detail for idempotency conflicts
     */
    public static HaProblemDetail idempotencyConflict(String correlationId,
                                                      String idempotencyKey,
                                                      String existingResourceId,
                                                      String instance) {
        HaProblemDetail problem = forStatus(409);
        problem.setType(URI.create("https://hivearmor.io/problems/idempotency-conflict"));
        problem.setTitle("Idempotency Key Conflict");
        problem.setDetail("Idempotency key already used for a different request");
        problem.setInstance(URI.create(instance));
        problem.correlationId(correlationId);
        problem.idempotencyKey(idempotencyKey);
        problem.existingResourceId(existingResourceId);
        return problem;
    }

    /**
     * Creates an internal-error problem detail (500).
     *
     * @param correlationId the request correlation ID
     * @param instance      the request URI
     * @return a fully populated problem detail for internal errors (no stack trace)
     */
    public static HaProblemDetail internalError(String correlationId, String instance) {
        HaProblemDetail problem = forStatus(500);
        problem.setType(URI.create("https://hivearmor.io/problems/internal-error"));
        problem.setTitle("Internal Server Error");
        problem.setDetail("An unexpected error occurred. Reference this correlation ID when contacting support.");
        problem.setInstance(URI.create(instance));
        problem.correlationId(correlationId);
        return problem;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
