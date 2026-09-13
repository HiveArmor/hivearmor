package com.hivearmor.multitenancy;

import org.springframework.security.access.AccessDeniedException;

/**
 * P0A1-T01 — single convention for resolving the authoritative tenant of the
 * current request when performing an endpoint-scoped read/write.
 *
 * <p>The tenant is always taken from {@link TenantContext} (populated from the
 * authenticated identity by {@link TenantContextFilter}), never from a request
 * parameter or payload. This is the one place callers should obtain the tenant
 * id to scope agent / command / EDR-event / collector / response operations.
 *
 * <p>Primary security invariant (P0-A1): every endpoint-scoped resource resolves
 * through {@code tenant_id + resource_id}, never {@code resource_id} alone.
 *
 * <p>Fail-closed: in an MSSP deployment ({@link TenantContext#isMssp()}), a request
 * that reaches an endpoint-scoped path without a resolved client id is denied
 * rather than defaulting to an unscoped ("all tenants") query.
 */
public final class TenantScope {

    private TenantScope() {
    }

    /**
     * Returns the authoritative tenant (client) id for the current request.
     *
     * @return the numeric client id from {@link TenantContext}
     * @throws AccessDeniedException when running in MSSP mode with no resolved
     *         client id — the caller must NOT fall back to an unscoped query.
     */
    public static long requireTenant() {
        Long clientId = TenantContext.getClientId();
        if (clientId == null) {
            if (TenantContext.isMssp()) {
                TenantAudit.crossTenantDenied("requireTenant", "tenant", null, "no-tenant-scope");
                throw new AccessDeniedException(
                    "tenant scope is required for this operation but no client id is resolved");
            }
            // Single-tenant (non-MSSP) deployment: no client id partitioning.
            // 0 signals "no tenant partition" and is only ever produced here,
            // never accepted from a client-supplied value.
            return 0L;
        }
        return clientId;
    }

    /**
     * Returns the current tenant id if one is resolved, otherwise {@code null}.
     * Use only for callers that legitimately operate without a tenant partition
     * (e.g. an explicitly-audited system context, P0A1-T14/T15). Prefer
     * {@link #requireTenant()} for all endpoint-scoped reads.
     *
     * @return the numeric client id, or {@code null} when none is set
     */
    public static Long currentTenantOrNull() {
        return TenantContext.getClientId();
    }
}
