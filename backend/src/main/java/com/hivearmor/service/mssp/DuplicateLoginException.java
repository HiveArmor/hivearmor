package com.hivearmor.service.mssp;

/**
 * Thrown by {@link MsspProvisioningService} when a tenant-provisioning request
 * arrives with an {@code adminLogin} that already exists in the {@code jhi_user}
 * table.
 *
 * <p>Mapped to {@code 409 Conflict} by {@code MsspProblemHandler} with
 * {@code field = "adminLogin"} in the RFC-7807 problem-detail body.
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
public class DuplicateLoginException extends RuntimeException {

    public DuplicateLoginException(String login) {
        super("login already exists: " + login);
    }
}
