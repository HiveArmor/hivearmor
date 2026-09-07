package com.hivearmor.service.detection;

import com.hivearmor.multitenancy.TenantContext;

import java.util.NoSuchElementException;

/**
 * DET-MSSP-001 — visibility for tenant-scoped detection packs and exceptions.
 *
 * <p>Platform / shared content uses {@code null} or {@code 0}. Tenant-owned rows
 * are visible only to that tenant. A missing tenant context never lists another
 * tenant's custom pack (fail closed).
 */
public final class DetectionPackScope {

    public static final long PLATFORM_TENANT_ID = 0L;

    public static final String HONESTY =
        "STAGING CANDIDATE — detection rules and exception packs are tenant-scoped. "
            + "Platform pack (tenant_id null/0) is shared. Tenant-owned rows never leak to another tenant. "
            + "The config plugin syncs only platform (null tenant_id) YAML into the shared event-processor workdir; "
            + "per-tenant engine partitions remain deferred. OpenSearch index pattern is unchanged.";

    private DetectionPackScope() {}

    public static boolean isPlatform(Long tenantId) {
        return tenantId == null || tenantId == PLATFORM_TENANT_ID;
    }

    public static Long requestTenantId() {
        return TenantContext.getClientId();
    }

    /**
     * Platform content is visible to every caller. Tenant-owned content is visible
     * only when the request tenant matches.
     */
    public static boolean isVisible(Long resourceTenantId, Long requestTenantId) {
        if (isPlatform(resourceTenantId)) {
            return true;
        }
        if (isPlatform(requestTenantId)) {
            return false;
        }
        return resourceTenantId.equals(requestTenantId);
    }

    public static void requireVisible(Long resourceTenantId, Long requestTenantId) {
        if (!isVisible(resourceTenantId, requestTenantId)) {
            throw new NoSuchElementException("Detection content not found");
        }
    }

    /** Stamp for NOT NULL columns such as {@code detection_rules.tenant_id}. */
    public static long stampNotNull(Long requestTenantId) {
        return isPlatform(requestTenantId) ? PLATFORM_TENANT_ID : requestTenantId;
    }

    /** Stamp for nullable pack columns ({@code hive_correlation_rules}, exceptions). */
    public static Long stampNullable(Long requestTenantId) {
        return isPlatform(requestTenantId) ? null : requestTenantId;
    }
}
