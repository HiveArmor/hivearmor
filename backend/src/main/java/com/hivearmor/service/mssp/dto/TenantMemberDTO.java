package com.hivearmor.service.mssp.dto;

/**
 * Read model returned by every membership endpoint.
 *
 * <p>{@code tenantUserId} is the {@code ha_tenant_user.id} primary key.
 * {@code userId} is the {@code jhi_user.id} foreign key.
 *
 * <p>Sprint 23 — tenant user management (S23-T05).
 */
public record TenantMemberDTO(
    Long tenantUserId,
    Long userId,
    String login,
    String email,
    String tenantRole,
    boolean userActivated
) {}
