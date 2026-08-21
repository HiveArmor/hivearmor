package com.hivearmor.multitenancy;

/**
 * Thread-local carrier for the current request's MSSP tenant scope.
 *
 * <p>Two independent {@code ThreadLocal} values are stored:
 * <ul>
 *   <li>{@code PREFIX_HOLDER} — the {@code ha_client.client_prefix} string (e.g. {@code "acme"})</li>
 *   <li>{@code CLIENT_ID_HOLDER} — the {@code ha_client.id} {@code Long} value</li>
 * </ul>
 *
 * <p>Either can be {@code null} independently; {@link #isMssp()} returns {@code true}
 * only when the prefix holder is non-null (matching the original Sprint 21 contract).
 *
 * <p>Every call site that sets the context MUST pair it with a matching {@code clear()}
 * inside a {@code finally} block.
 *
 * <p>Sprint 24 — S24-T01: added {@link #set(Long, String)} overload and
 * {@link #getClientId()} to support the {@code client_id} PostgreSQL filter.
 */
public final class TenantContext {

    private static final ThreadLocal<String> PREFIX_HOLDER = new ThreadLocal<>();
    private static final ThreadLocal<Long>   CLIENT_ID_HOLDER = new ThreadLocal<>();

    private TenantContext() { }

    // -------------------------------------------------------------------------
    // Setters
    // -------------------------------------------------------------------------

    /**
     * Sets the current tenant scope from a prefix string only (no client id).
     * Introduced by Sprint 21; preserved for backward compatibility with
     * {@link TenantContextFilter} which resolves only the prefix from the JWT.
     *
     * @param prefix the {@code ha_client.client_prefix} value; must not be {@code null}
     *               when the intent is to establish MSSP scope
     */
    public static void set(String prefix) {
        PREFIX_HOLDER.set(prefix);
        CLIENT_ID_HOLDER.remove();   // ensure no stale clientId from a previous set(Long, String)
    }

    /**
     * Sets both the tenant prefix and the numeric client id in the current thread's scope.
     * Used by service-layer code that has already loaded the {@code ha_client} row and
     * needs to propagate both identifiers for PostgreSQL {@code client_id} filtering.
     *
     * @param clientId the {@code ha_client.id} value; may be {@code null}
     * @param prefix   the {@code ha_client.client_prefix} value; may be {@code null}
     */
    public static void set(Long clientId, String prefix) {
        PREFIX_HOLDER.set(prefix);
        if (clientId != null) {
            CLIENT_ID_HOLDER.set(clientId);
        } else {
            CLIENT_ID_HOLDER.remove();
        }
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    /**
     * Returns the current tenant's {@code client_prefix}, or {@code null} when no
     * tenant scope is active.
     *
     * @return prefix string, or {@code null}
     */
    public static String get() {
        return PREFIX_HOLDER.get();
    }

    /**
     * Alias for {@link #get()} that returns the tenant's {@code client_prefix}.
     *
     * @return prefix string, or {@code null}
     */
    public static String getClientPrefix() {
        return PREFIX_HOLDER.get();
    }

    /**
     * Returns the current tenant's {@code ha_client.id}, or {@code null} when no
     * client id has been set via {@link #set(Long, String)}.
     *
     * @return numeric client id, or {@code null}
     */
    public static Long getClientId() {
        return CLIENT_ID_HOLDER.get();
    }

    // -------------------------------------------------------------------------
    // State query
    // -------------------------------------------------------------------------

    /**
     * Returns {@code true} when a non-null tenant prefix is present in the current
     * thread's scope, indicating that the request is scoped to a specific
     * MSSP-managed tenant.
     *
     * @return {@code true} iff a tenant prefix has been set
     */
    public static boolean isMssp() {
        return PREFIX_HOLDER.get() != null;
    }

    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------

    /**
     * Removes all tenant-scope values from the current thread's {@code ThreadLocal}
     * storage. MUST be called in a {@code finally} block whenever {@link #set} has
     * been called.
     *
     * <p>Uses {@code remove()} rather than {@code set(null)} to drop the
     * {@code ThreadLocalMap} entry entirely and avoid memory leaks in thread pools.
     */
    public static void clear() {
        PREFIX_HOLDER.remove();
        CLIENT_ID_HOLDER.remove();
    }
}
