package com.hivearmor.web.rest.errors;

/**
 * Thrown when an idempotency key has already been used for a different request
 * (same key, different request hash).
 *
 * <p>The global exception handler maps this to a 409 RFC 7807 problem response
 * with the conflicting key and existing resource ID.
 *
 * <p>Requirements: REQ-3 (HAR-003)
 */
public class HaIdempotencyConflictException extends RuntimeException {

    private final String idempotencyKey;
    private final String existingResourceId;

    /**
     * Creates a new idempotency conflict exception.
     *
     * @param idempotencyKey     the conflicting idempotency key
     * @param existingResourceId the ID of the resource created by the original request
     */
    public HaIdempotencyConflictException(String idempotencyKey, String existingResourceId) {
        super("Idempotency key '" + idempotencyKey + "' already used for a different request");
        this.idempotencyKey = idempotencyKey;
        this.existingResourceId = existingResourceId;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getExistingResourceId() {
        return existingResourceId;
    }
}
