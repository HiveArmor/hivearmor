package com.hivearmor.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Binds {@code hivearmor.multitenancy.*} — single-tenant / on-prem equivalence policy for
 * GLOBAL agent-policy-template writes (BE-POL-GLOBAL-ADMIN).
 *
 * <p>GLOBAL, cross-tenant-readable templates are writable only by {@code ROLE_PLATFORM_ADMIN}
 * (the MSSP operator). In a single-tenant / on-prem deployment the one {@code ROLE_ADMIN} IS the
 * operator, so forcing a separate platform role there would be a needless regression. When
 * {@link #isSingleTenantAdminGlobalWrite()} is {@code true} (the default) AND the request is not
 * MSSP-scoped ({@code TenantContext.isMssp() == false}), {@code ROLE_ADMIN} is accepted for GLOBAL
 * writes. Set it to {@code false} to require {@code ROLE_PLATFORM_ADMIN} unconditionally.
 */
@Component
@ConfigurationProperties(prefix = "hivearmor.multitenancy")
@Getter
@Setter
public class GlobalTemplateWriteProperties {

    /**
     * When {@code true} (default), a single-tenant / on-prem {@code ROLE_ADMIN} is treated as
     * equivalent to {@code ROLE_PLATFORM_ADMIN} for GLOBAL-template writes, but ONLY on a
     * non-MSSP-scoped request. Has no effect on an MSSP-scoped request, where only
     * {@code ROLE_PLATFORM_ADMIN} may write GLOBAL.
     */
    private boolean singleTenantAdminGlobalWrite = true;
}
