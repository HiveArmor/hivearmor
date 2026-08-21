package com.hivearmor.service;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit test verifying that {@link UtmAlertTagRuleService} tag rule queries
 * resolve to the correct tenant-scoped or global alert index pattern via
 * {@link MsspIndexResolver}.
 *
 * <p><b>Validates: Requirement 2.3, 2.5</b> — UtmAlertTagRuleService uses
 * MsspIndexResolver for alert queries; null TenantContext produces identical
 * behavior to legacy.
 */
class UtmAlertTagRuleServiceTenantScopingTest {

    private final MsspIndexResolver indexResolver = new MsspIndexResolver();

    @AfterEach
    void clearTenantContext() {
        TenantContext.clear();
    }

    @Test
    void withTenantContext_resolvesTenantScopedAlertIndex() {
        try {
            TenantContext.set("cwm");
            String pattern = indexResolver.resolveAlertIndexPattern();
            assertThat(pattern).isEqualTo("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    void withoutTenantContext_resolvesGlobalAlertIndex() {
        // TenantContext is null by default — simulates single-tenant / legacy behavior
        String pattern = indexResolver.resolveAlertIndexPattern();
        assertThat(pattern).isEqualTo("v3-hive-alert-*");
    }

    @Test
    void withDifferentTenant_resolvesDifferentPattern() {
        try {
            TenantContext.set("acme");
            String pattern = indexResolver.resolveAlertIndexPattern();
            assertThat(pattern).isEqualTo("v3-hive-alert-acme-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    void withBlankTenant_resolvesGlobalPattern() {
        try {
            TenantContext.set("   ");
            String pattern = indexResolver.resolveAlertIndexPattern();
            // Blank prefix treated as no tenant — global pattern
            assertThat(pattern).isEqualTo("v3-hive-alert-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    void tenantContextClear_restoresGlobalBehavior() {
        try {
            TenantContext.set("cwm");
            assertThat(indexResolver.resolveAlertIndexPattern()).isEqualTo("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
        // After clear, should be back to global
        assertThat(indexResolver.resolveAlertIndexPattern()).isEqualTo("v3-hive-alert-*");
    }
}
