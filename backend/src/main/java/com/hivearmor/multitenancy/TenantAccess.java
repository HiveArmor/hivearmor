package com.hivearmor.multitenancy;

import com.hivearmor.web.rest.errors.HaResourceNotFoundException;
import org.springframework.security.access.AccessDeniedException;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

/**
 * P0A1-T16 — the single canonical place that expresses HiveArmor's tenant-isolation
 * error convention, so controllers and services stop hand-rolling {@code ResponseEntity
 * .notFound()} or picking a status ad hoc. Everything here maps onto the existing
 * RFC-7807 problem infrastructure (the global exception handler already maps
 * {@link HaResourceNotFoundException} → 404 and {@link AccessDeniedException} → 403).
 *
 * <p><b>The convention (do not deviate):</b>
 * <ul>
 *   <li><b>Cross-tenant object access → 404, never 403.</b> A resource that exists but
 *       belongs to another tenant is reported exactly like one that does not exist. A
 *       403 would confirm the resource IS there in some other tenant — an information
 *       disclosure. {@link #notFound} and {@link #crossTenantNotFound} are deliberately
 *       the same response for this reason.</li>
 *   <li><b>Missing authority → 403.</b> The caller is authenticated and in the right
 *       tenant but lacks the role/permission for the operation.</li>
 *   <li><b>Tenant-scoped lists → empty.</b> A list request never leaks another tenant's
 *       rows and never 403s for out-of-scope rows; it simply returns only the caller's
 *       own, which may be empty. Use {@link #emptyList()} for the canonical empty result.</li>
 * </ul>
 *
 * <p>None of these messages include a tenant id, another tenant's data, or any secret.
 */
public final class TenantAccess {

    private TenantAccess() { }

    /**
     * Report a resource as not found within the caller's tenant. Use this for BOTH a
     * genuine miss and a cross-tenant hit — by design they are indistinguishable to the
     * caller (no-disclosure rule). Throws {@link HaResourceNotFoundException} → 404.
     */
    public static HaResourceNotFoundException notFound(String resourceType, Object resourceId) {
        throw new HaResourceNotFoundException(resourceType, String.valueOf(resourceId));
    }

    /**
     * Alias for {@link #notFound} that documents the caller's intent at the call site:
     * the resource was found but is owned by another tenant, so we hide its existence.
     */
    public static HaResourceNotFoundException crossTenantNotFound(String resourceType, Object resourceId) {
        throw new HaResourceNotFoundException(resourceType, String.valueOf(resourceId));
    }

    /**
     * The caller is in the correct tenant but lacks authority for the operation.
     * Throws {@link AccessDeniedException} → 403. Never use this for a cross-tenant
     * object miss — that is a 404 ({@link #notFound}).
     */
    public static AccessDeniedException forbidden(String reason) {
        throw new AccessDeniedException(reason);
    }

    /**
     * Load-or-404 guard: return the present value, or report it not-found in the
     * caller's tenant. The common shape for "fetch a tenant-scoped record by id".
     */
    public static <T> T require(Optional<T> value, String resourceType, Object resourceId) {
        return value.orElseThrow(() -> new HaResourceNotFoundException(resourceType, String.valueOf(resourceId)));
    }

    /**
     * The canonical empty result for a tenant-scoped list whose caller has no rows in
     * scope. Immutable; never a partial/other-tenant list.
     */
    public static <T> List<T> emptyList() {
        return Collections.emptyList();
    }
}
