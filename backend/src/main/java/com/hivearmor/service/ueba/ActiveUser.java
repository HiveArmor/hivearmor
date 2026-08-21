package com.hivearmor.service.ueba;

/**
 * Represents an active user within a tenant for UEBA processing.
 *
 * <p>Provides the attributes needed for peer-group assignment:
 * <ul>
 *   <li>{@link #getUserId()} — unique user identifier</li>
 *   <li>{@link #getTenantId()} — tenant the user belongs to</li>
 *   <li>{@link #getAdDepartment()} — Active Directory department (may be null or blank)</li>
 *   <li>{@link #getMostRecentSrcIp()} — the user's most recent source IPv4 address</li>
 * </ul>
 */
public interface ActiveUser {

    /** Returns the unique user identifier. */
    String getUserId();

    /** Returns the tenant identifier this user belongs to. */
    String getTenantId();

    /**
     * Returns the Active Directory department attribute for this user,
     * or {@code null} if the attribute is unavailable.
     */
    String getAdDepartment();

    /**
     * Returns the most recent source IPv4 address observed for this user.
     * Used as a fallback for peer-group assignment when AD department is absent.
     */
    String getMostRecentSrcIp();
}
