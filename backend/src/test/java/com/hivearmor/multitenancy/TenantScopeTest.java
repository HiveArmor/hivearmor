package com.hivearmor.multitenancy;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * P0A1-T01 — unit tests for {@link TenantScope}.
 *
 * <p>Verifies the fail-closed tenant-resolution convention:
 * MSSP + resolved id returns it; MSSP + missing id denies; single-tenant returns 0.
 */
class TenantScopeTest {

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @Test
    @DisplayName("MSSP request with a resolved client id returns that id")
    void requireTenant_mssp_withClientId_returnsId() {
        TenantContext.set(101L, "acme");
        assertEquals(101L, TenantScope.requireTenant());
    }

    @Test
    @DisplayName("MSSP request without a resolved client id is denied (fail-closed)")
    void requireTenant_mssp_withoutClientId_denied() {
        // prefix set (MSSP) but no numeric client id resolved
        TenantContext.set("acme");
        assertThrows(AccessDeniedException.class, TenantScope::requireTenant);
    }

    @Test
    @DisplayName("Single-tenant (non-MSSP) request returns 0 (no tenant partition)")
    void requireTenant_singleTenant_returnsZero() {
        // no prefix, no client id => not MSSP
        assertEquals(0L, TenantScope.requireTenant());
    }

    @Test
    @DisplayName("currentTenantOrNull reflects the resolved id, or null when unset")
    void currentTenantOrNull_reflectsContext() {
        assertNull(TenantScope.currentTenantOrNull());
        TenantContext.set(202L, "globex");
        assertEquals(202L, TenantScope.currentTenantOrNull());
    }
}
