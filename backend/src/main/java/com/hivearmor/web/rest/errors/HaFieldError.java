package com.hivearmor.web.rest.errors;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Structured field-level validation error for RFC 7807 problem responses.
 *
 * <p>Used within {@link HaProblemDetail#fieldErrors(java.util.List)} to provide
 * clients with machine-readable information about which request fields failed
 * validation and why.
 *
 * <p>Requirements: REQ-2 (HAR-002)
 *
 * @param field         the field path that failed validation (e.g., "severity" or "options.hopDepth")
 * @param message       the human-readable validation message
 * @param rejectedValue the value that was rejected (may be null for missing fields)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record HaFieldError(
        String field,
        String message,
        Object rejectedValue
) {
}
