package com.hivearmor.multitenancy;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Resolves the OpenSearch index pattern a request may read, baking the MSSP
 * tenant prefix into the pattern (v3-hive-&lt;type&gt;-&lt;prefix&gt;-*) so a query can
 * only ever hit the caller's own tenant indices.
 *
 * <p><b>SPEC-04 (W1b) fail-closed contract.</b> The previous behaviour returned
 * the all-tenant wildcard (v3-hive-&lt;type&gt;-*) whenever the prefix holder was
 * blank. That is correct for a single-tenant (non-MSSP) deployment, where there
 * is no tenant partition, but in an MSSP deployment a request that reaches a
 * tenant-scoped read WITHOUT a resolved prefix would silently read EVERY
 * tenant's data. This resolver now mirrors {@link TenantScope#requireTenant()}:
 *
 * <ul>
 *   <li><b>Single-tenant</b> (no client id resolved, no prefix): return the
 *       unscoped {@code v3-hive-<type>-*} — there is no partition to enforce.</li>
 *   <li><b>MSSP, prefix resolved</b>: return the tenant-scoped pattern.</li>
 *   <li><b>MSSP, prefix UNSET but a client id IS resolved</b> (the fail-open
 *       hole): {@link #resolveIndexPattern} and {@link #resolveIndexPatternForPrefix}
 *       now throw {@link AccessDeniedException} rather than widen to all tenants.</li>
 * </ul>
 *
 * <p>Legitimate all-tenant reads (MSSP aggregate dashboards) must use the
 * EXPLICIT {@link #resolveAllTenantIndexPattern(String)} escape hatch, which is
 * self-documenting at the call site and audited, rather than relying on a blank
 * prefix defaulting to the wildcard.
 */
@Component
public class MsspIndexResolver {

    static final DateTimeFormatter INDEX_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy.MM.dd");
    private static final String INDEX_ROOT = "v3-hive-";

    public String resolveCurrentDayAlertIndex() {
        return resolveCurrentDayIndex("alert");
    }

    public String resolveCurrentDayIndex(String type) {
        String prefix = TenantContext.get();
        String date   = LocalDate.now().format(INDEX_DATE_FORMAT);
        if (prefix != null && !prefix.isBlank()) {
            return INDEX_ROOT + type + "-" + prefix + "-" + date;
        }
        requireResolvableTenantScope(type);
        return INDEX_ROOT + type + "-" + date;
    }

    public String resolveAlertIndexPattern() {
        return resolveIndexPattern("alert");
    }

    /**
     * Resolves the index pattern for a tenant-scoped read.
     *
     * <p>SPEC-04: fails closed when the request is an MSSP request whose tenant
     * prefix did not resolve (a client id is present but the prefix holder is
     * blank) — see {@link #requireResolvableTenantScope(String)}. Single-tenant
     * requests (no client id) keep the unscoped wildcard.
     */
    public String resolveIndexPattern(String type) {
        String prefix = TenantContext.get();
        if (prefix != null && !prefix.isBlank()) {
            return INDEX_ROOT + type + "-" + prefix + "-*";
        }
        requireResolvableTenantScope(type);
        return INDEX_ROOT + type + "-*";
    }

    public String resolveIndexPatternForPrefix(String type, String tenantPrefix) {
        if (tenantPrefix == null || tenantPrefix.isBlank()) {
            return resolveIndexPattern(type);
        }
        return INDEX_ROOT + type + "-" + tenantPrefix.trim() + "-*";
    }

    /**
     * Explicit, audited all-tenant index pattern for legitimate MSSP aggregate
     * reads (e.g. cross-tenant overview dashboards). Use this instead of relying
     * on a blank prefix falling through to the wildcard — it makes the intent
     * unmistakable at the call site and is not subject to the fail-closed guard.
     *
     * @param type the OpenSearch index type (e.g. {@code "alert"})
     * @return the unscoped {@code v3-hive-<type>-*} pattern spanning every tenant
     */
    public String resolveAllTenantIndexPattern(String type) {
        return INDEX_ROOT + type + "-*";
    }

    /**
     * Explicit fail-closed resolver for a tenant-scoped read. Identical to
     * {@link #resolveIndexPattern(String)} but named to make the intent obvious
     * at security-sensitive EDR call sites: it never returns an all-tenant
     * pattern for an MSSP request.
     */
    public String resolveTenantScopedIndexPattern(String type) {
        return resolveIndexPattern(type);
    }

    /**
     * Fail-closed guard mirroring {@link TenantScope#requireTenant()}. When a
     * client id is resolved for the current request but no tenant prefix is set,
     * the request is a genuine MSSP request whose scope could not be established
     * — deny it rather than fall back to an all-tenant query. A request with no
     * client id at all is a single-tenant (non-MSSP) deployment and is allowed
     * to use the unscoped pattern (there is no partition).
     */
    private void requireResolvableTenantScope(String type) {
        Long clientId = TenantContext.getClientId();
        if (clientId != null) {
            TenantAudit.crossTenantDenied(
                "MsspIndexResolver.resolveIndexPattern", type, null, "prefix-unresolved-for-tenant");
            throw new AccessDeniedException(
                "tenant scope is required for this index read but the tenant prefix is unresolved");
        }
    }
}
