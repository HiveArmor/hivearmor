package com.hivearmor.security;

/**
 * Constants for Spring Security authorities.
 */
public final class AuthoritiesConstants {

    public static final String ADMIN = "ROLE_ADMIN";

    /**
     * Platform (MSSP operator) administrator. Distinct from {@link #ADMIN}, which in an MSSP
     * deployment is a per-tenant role every managed tenant has its own instance of. GLOBAL,
     * cross-tenant-readable agent-policy templates are writable only by this role so a single
     * tenant admin cannot author policy every other tenant inherits (BE-POL-GLOBAL-ADMIN).
     * In single-tenant / on-prem deployments {@link #ADMIN} is treated as equivalent via a
     * config flag — see {@code hivearmor.multitenancy.single-tenant-admin-global-write}.
     */
    public static final String PLATFORM_ADMIN = "ROLE_PLATFORM_ADMIN";

    public static final String USER = "ROLE_USER";

    public static final String ANONYMOUS = "ROLE_ANONYMOUS";

    public static final String PRE_VERIFICATION_USER = "ROLE_PRE_VERIFICATION_USER";

    public static final String ANALYST = "ROLE_ANALYST";

    public static final String SOC_MANAGER = "ROLE_SOC_MANAGER";

    public static final String READ_ONLY = "ROLE_READ_ONLY";

    private AuthoritiesConstants() {
    }
}
