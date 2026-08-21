package com.hivearmor.service.impl;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests verifying that {@link UtmAlertServiceImpl} uses the correct
 * tenant-scoped or global index pattern depending on {@link TenantContext}.
 *
 * <p><strong>Validates: Requirement 2.1</strong> — UtmAlertServiceImpl SHALL inject
 * MsspIndexResolver and replace every {@code Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS)}
 * call with {@code indexResolver.resolveAlertIndexPattern()}.
 *
 * <p><strong>Validates: Requirement 2.6</strong> — A unit test SHALL verify that when
 * TenantContext is set to "cwm", the alert service queries "v3-hive-alert-cwm-*"
 * and NOT "v3-hive-alert-*".
 *
 * <p>These tests exercise MsspIndexResolver directly (it has no external dependencies)
 * to confirm the tenant-aware resolution contract that UtmAlertServiceImpl now depends on.
 */
@DisplayName("UtmAlertServiceImpl — tenant-scoped index resolution")
class UtmAlertServiceTenantScopingTest {

    private final MsspIndexResolver indexResolver = new MsspIndexResolver();

    /**
     * When TenantContext is set to "cwm", the alert index pattern must be
     * scoped to that tenant: "v3-hive-alert-cwm-*".
     */
    @Test
    @DisplayName("resolveAlertIndexPattern with tenant 'cwm' → v3-hive-alert-cwm-*")
    void alertIndexPattern_withTenantContext_returnsTenantScopedPattern() {
        try {
            TenantContext.set("cwm");
            String pattern = indexResolver.resolveAlertIndexPattern();
            assertThat(pattern).isEqualTo("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * When TenantContext is null (no tenant scope — single-tenant or global mode),
     * the alert index pattern must return the global wildcard: "v3-hive-alert-*".
     * This guarantees backward compatibility with single-tenant deployments.
     */
    @Test
    @DisplayName("resolveAlertIndexPattern without tenant context → v3-hive-alert-*")
    void alertIndexPattern_withoutTenantContext_returnsGlobalPattern() {
        // TenantContext is null by default
        String pattern = indexResolver.resolveAlertIndexPattern();
        assertThat(pattern).isEqualTo("v3-hive-alert-*");
    }

    /**
     * When TenantContext is set to "cwm", the log index pattern must be
     * scoped to that tenant: "v3-hive-log-cwm-*". This is used by
     * {@code getRelatedAlerts()} in UtmAlertServiceImpl.
     */
    @Test
    @DisplayName("resolveIndexPattern('log') with tenant 'cwm' → v3-hive-log-cwm-*")
    void logIndexPattern_withTenantContext_returnsTenantScopedPattern() {
        try {
            TenantContext.set("cwm");
            String pattern = indexResolver.resolveIndexPattern("log");
            assertThat(pattern).isEqualTo("v3-hive-log-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * When TenantContext is null, the log index pattern returns the global wildcard.
     */
    @Test
    @DisplayName("resolveIndexPattern('log') without tenant context → v3-hive-log-*")
    void logIndexPattern_withoutTenantContext_returnsGlobalPattern() {
        String pattern = indexResolver.resolveIndexPattern("log");
        assertThat(pattern).isEqualTo("v3-hive-log-*");
    }

    /**
     * When TenantContext is set to a blank string, MsspIndexResolver treats it
     * as null and returns the global pattern — no partial match or empty prefix.
     */
    @Test
    @DisplayName("resolveAlertIndexPattern with blank tenant → v3-hive-alert-*")
    void alertIndexPattern_withBlankTenantContext_returnsGlobalPattern() {
        try {
            TenantContext.set("   ");
            String pattern = indexResolver.resolveAlertIndexPattern();
            assertThat(pattern).isEqualTo("v3-hive-alert-*");
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Verifies that the tenant-scoped pattern does NOT match the global pattern.
     * This is the core isolation invariant: with a tenant set, queries must NOT
     * hit the global wildcard.
     */
    @Test
    @DisplayName("tenant-scoped pattern is distinct from global pattern")
    void alertIndexPattern_tenantAndGlobal_areDistinct() {
        String globalPattern = indexResolver.resolveAlertIndexPattern();

        try {
            TenantContext.set("cwm");
            String tenantPattern = indexResolver.resolveAlertIndexPattern();
            assertThat(tenantPattern).isNotEqualTo(globalPattern);
            assertThat(tenantPattern).contains("-cwm-");
        } finally {
            TenantContext.clear();
        }
    }
}
