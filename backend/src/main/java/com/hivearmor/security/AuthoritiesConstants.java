package com.hivearmor.security;

/**
 * Constants for Spring Security authorities.
 */
public final class AuthoritiesConstants {

    public static final String ADMIN = "ROLE_ADMIN";

    public static final String USER = "ROLE_USER";

    public static final String ANONYMOUS = "ROLE_ANONYMOUS";

    public static final String PRE_VERIFICATION_USER = "ROLE_PRE_VERIFICATION_USER";

    public static final String ANALYST = "ROLE_ANALYST";

    public static final String SOC_MANAGER = "ROLE_SOC_MANAGER";

    public static final String READ_ONLY = "ROLE_READ_ONLY";

    private AuthoritiesConstants() {
    }
}
