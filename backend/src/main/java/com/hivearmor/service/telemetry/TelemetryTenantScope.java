package com.hivearmor.service.telemetry;

import com.hivearmor.multitenancy.TenantContext;

/**
 * Resolves the authorized tenant predicate for telemetry JDBC queries.
 */
public final class TelemetryTenantScope {

    private TelemetryTenantScope() {
    }

    public static long requireTenantId() {
        Long tenantId = TenantContext.getClientId();
        if (tenantId == null || tenantId <= 0L) {
            throw new TelemetryQueryException(
                "TELEMETRY_TENANT_REQUIRED",
                "An authorized tenant scope is required");
        }
        return tenantId;
    }
}
