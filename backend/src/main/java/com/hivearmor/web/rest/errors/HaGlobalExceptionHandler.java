package com.hivearmor.web.rest.errors;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Global exception handler that translates all exceptions into RFC 7807
 * {@code application/problem+json} responses using {@link HaProblemDetail}.
 *
 * <p>Every response includes the correlation ID from MDC ({@code ha.correlationId})
 * set by {@link com.hivearmor.web.filter.HaCorrelationIdFilter}.
 *
 * <p>Handler priority is set to {@link Ordered#HIGHEST_PRECEDENCE} + 10 to allow
 * more specific handlers (like {@link HaAiExceptionHandler}) to take precedence
 * when needed.
 *
 * <p>Requirements: REQ-2 (HAR-002)
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class HaGlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(HaGlobalExceptionHandler.class);

    private static final MediaType PROBLEM_JSON = MediaType.valueOf("application/problem+json");
    private static final String MDC_CORRELATION_ID = "ha.correlationId";

    // -------------------------------------------------------------------------
    // 400 — Validation errors (Spring MVC @Valid)
    // -------------------------------------------------------------------------

    /**
     * Handles {@link MethodArgumentNotValidException} thrown when a {@code @Valid}
     * annotated request body fails Jakarta Validation constraints.
     *
     * @return 400 with structured fieldErrors[]
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex,
            HttpServletRequest request) {

        String correlationId = getCorrelationId();
        List<HaFieldError> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(this::toHaFieldError)
                .collect(Collectors.toList());

        HaProblemDetail problem = HaProblemDetail.validationFailed(
                correlationId, fieldErrors, request.getRequestURI());

        log.warn("Validation failed [correlationId={}] {} field error(s) on {}",
                correlationId, fieldErrors.size(), request.getRequestURI());

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    // -------------------------------------------------------------------------
    // 400 — Constraint violations (Jakarta @Validated on path/query params)
    // -------------------------------------------------------------------------

    /**
     * Handles {@link ConstraintViolationException} thrown when Jakarta Validation
     * constraints fail on method parameters (path variables, query params).
     *
     * @return 400 with structured fieldErrors[]
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ProblemDetail> handleConstraintViolation(
            ConstraintViolationException ex,
            HttpServletRequest request) {

        String correlationId = getCorrelationId();
        List<HaFieldError> fieldErrors = ex.getConstraintViolations().stream()
                .map(this::toHaFieldError)
                .collect(Collectors.toList());

        HaProblemDetail problem = HaProblemDetail.validationFailed(
                correlationId, fieldErrors, request.getRequestURI());

        log.warn("Constraint violation [correlationId={}] {} violation(s) on {}",
                correlationId, fieldErrors.size(), request.getRequestURI());

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    // -------------------------------------------------------------------------
    // 401 — Authentication failures
    // -------------------------------------------------------------------------

    /**
     * Handles {@link AuthenticationException} for unauthenticated requests.
     *
     * @return 401 with standard problem envelope
     */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ProblemDetail> handleAuthenticationException(
            AuthenticationException ex,
            HttpServletRequest request) {

        String correlationId = getCorrelationId();

        HaProblemDetail problem = HaProblemDetail.forStatus(HttpStatus.UNAUTHORIZED);
        problem.setType(URI.create("https://hivearmor.io/problems/authentication-required"));
        problem.setTitle("Authentication Required");
        problem.setDetail("Full authentication is required to access this resource");
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.correlationId(correlationId);

        log.warn("Authentication failure [correlationId={}] on {}",
                correlationId, request.getRequestURI());

        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    // -------------------------------------------------------------------------
    // 403 — Access denied
    // -------------------------------------------------------------------------

    /**
     * Handles {@link AccessDeniedException} for authorized but insufficient-privilege requests.
     *
     * @return 403 with requiredRole extension
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ProblemDetail> handleAccessDenied(
            AccessDeniedException ex,
            HttpServletRequest request) {

        String correlationId = getCorrelationId();

        HaProblemDetail problem = HaProblemDetail.forStatus(HttpStatus.FORBIDDEN);
        problem.setType(URI.create("https://hivearmor.io/problems/access-denied"));
        problem.setTitle("Access Denied");
        problem.setDetail("You do not have sufficient permissions to access this resource");
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.correlationId(correlationId);
        problem.setProperty("requiredRole", extractRequiredRole(ex));

        log.warn("Access denied [correlationId={}] on {}",
                correlationId, request.getRequestURI());

        return ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    // -------------------------------------------------------------------------
    // 404 — Resource not found
    // -------------------------------------------------------------------------

    /**
     * Handles {@link HaResourceNotFoundException} for missing tenant-scoped resources.
     *
     * @return 404 with resourceType and resourceId extensions
     */
    @ExceptionHandler(HaResourceNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleResourceNotFound(
            HaResourceNotFoundException ex,
            HttpServletRequest request) {

        String correlationId = getCorrelationId();

        HaProblemDetail problem = HaProblemDetail.resourceNotFound(
                correlationId,
                ex.getResourceType(),
                ex.getResourceId(),
                request.getRequestURI());

        log.info("Resource not found [correlationId={}] type={} id={} on {}",
                correlationId, ex.getResourceType(), ex.getResourceId(), request.getRequestURI());

        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    // -------------------------------------------------------------------------
    // 409 — Idempotency conflict
    // -------------------------------------------------------------------------

    /**
     * Handles {@link HaIdempotencyConflictException} when an idempotency key is
     * reused for a different request.
     *
     * @return 409 with existingResourceId extension
     */
    @ExceptionHandler(HaIdempotencyConflictException.class)
    public ResponseEntity<ProblemDetail> handleIdempotencyConflict(
            HaIdempotencyConflictException ex,
            HttpServletRequest request) {

        String correlationId = getCorrelationId();

        HaProblemDetail problem = HaProblemDetail.idempotencyConflict(
                correlationId,
                ex.getIdempotencyKey(),
                ex.getExistingResourceId(),
                request.getRequestURI());

        log.warn("Idempotency conflict [correlationId={}] key={} on {}",
                correlationId, ex.getIdempotencyKey(), request.getRequestURI());

        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    // -------------------------------------------------------------------------
    // 429 — SSE rate limit exceeded
    // -------------------------------------------------------------------------

    /**
     * Handles {@link HaSseRateLimitExceededException} when SSE connection limits
     * are exceeded for a tenant, resource, or endpoint.
     *
     * @return 429 with retryAfter and connection count extensions
     */
    @ExceptionHandler(HaSseRateLimitExceededException.class)
    public ResponseEntity<ProblemDetail> handleSseRateLimitExceeded(
            HaSseRateLimitExceededException ex,
            HttpServletRequest request) {

        String correlationId = getCorrelationId();

        HaProblemDetail problem = HaProblemDetail.rateLimited(
                correlationId,
                ex.getRetryAfter(),
                ex.getCurrentConnections(),
                ex.getMaxConnections(),
                request.getRequestURI());

        log.warn("SSE rate limit exceeded [correlationId={}] connections={}/{} on {}",
                correlationId, ex.getCurrentConnections(), ex.getMaxConnections(),
                request.getRequestURI());

        HttpHeaders headers = new HttpHeaders();
        headers.set("Retry-After", String.valueOf(ex.getRetryAfter()));

        return ResponseEntity
                .status(HttpStatus.TOO_MANY_REQUESTS)
                .headers(headers)
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    // -------------------------------------------------------------------------
    // 500 — Generic catch-all (no stack trace exposed)
    // -------------------------------------------------------------------------

    /**
     * Catches any unhandled exception and returns a safe 500 response with only
     * the correlation ID. Stack traces are logged server-side but never exposed
     * to the client.
     *
     * @return 500 with correlationId only
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleGenericException(
            Exception ex,
            HttpServletRequest request) {

        String correlationId = getCorrelationId();

        HaProblemDetail problem = HaProblemDetail.internalError(
                correlationId, request.getRequestURI());

        log.error("Unhandled exception [correlationId={}] on {}: {}",
                correlationId, request.getRequestURI(), ex.getMessage(), ex);

        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Reads the correlation ID from MDC. Falls back to "unknown" if not set
     * (should not happen if HaCorrelationIdFilter is registered).
     */
    private String getCorrelationId() {
        String id = MDC.get(MDC_CORRELATION_ID);
        return id != null ? id : "unknown";
    }

    /**
     * Converts a Spring {@link FieldError} to an {@link HaFieldError}.
     */
    private HaFieldError toHaFieldError(FieldError fieldError) {
        return new HaFieldError(
                fieldError.getField(),
                fieldError.getDefaultMessage(),
                fieldError.getRejectedValue());
    }

    /**
     * Converts a Jakarta {@link ConstraintViolation} to an {@link HaFieldError}.
     */
    private HaFieldError toHaFieldError(ConstraintViolation<?> violation) {
        String propertyPath = violation.getPropertyPath().toString();
        // Strip method name prefix (e.g., "methodName.paramName" → "paramName")
        int dotIndex = propertyPath.indexOf('.');
        String field = dotIndex >= 0 ? propertyPath.substring(dotIndex + 1) : propertyPath;
        return new HaFieldError(
                field,
                violation.getMessage(),
                violation.getInvalidValue());
    }

    /**
     * Attempts to extract a required role from the AccessDeniedException message.
     * Spring Security often includes role information in the exception detail.
     * Falls back to "ROLE_USER" if not determinable.
     */
    private String extractRequiredRole(AccessDeniedException ex) {
        String message = ex.getMessage();
        if (message != null && message.contains("ROLE_")) {
            // Extract role from message like "Access Denied for role ROLE_ADMIN"
            int idx = message.indexOf("ROLE_");
            int end = message.indexOf(' ', idx);
            return end > idx ? message.substring(idx, end) : message.substring(idx);
        }
        return "insufficient_permissions";
    }
}
