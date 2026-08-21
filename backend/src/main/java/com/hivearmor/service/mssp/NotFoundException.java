package com.hivearmor.service.mssp;

/**
 * Thrown when a requested resource cannot be found (or is found but does not meet
 * the caller's access criteria, such as {@code mssp_managed = false} on a tenant
 * lookup).
 *
 * <p>Mapped to {@code 404 Not Found} by {@code MsspProblemHandler} via an
 * RFC-7807 problem-detail body.
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String resource, Object id) {
        super(resource + " not found: " + id);
    }
}
