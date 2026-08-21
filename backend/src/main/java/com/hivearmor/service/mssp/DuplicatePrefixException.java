package com.hivearmor.service.mssp;

/**
 * Thrown by {@link MsspProvisioningService} when a tenant-provisioning request
 * arrives with a {@code clientPrefix} that already exists in the {@code ha_client}
 * table.
 *
 * <p>Mapped to {@code 409 Conflict} by {@code MsspProblemHandler} with
 * {@code field = "clientPrefix"} in the RFC-7807 problem-detail body.
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
public class DuplicatePrefixException extends RuntimeException {

    public DuplicatePrefixException(String prefix) {
        super("clientPrefix already exists: " + prefix);
    }
}
