package com.hivearmor.multitenancy;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Example unit tests for {@link MsspIndexResolver}.
 *
 * <p>Plain JUnit 5 — no Spring context. The resolver is instantiated directly.
 * {@code TenantContext} is a {@code ThreadLocal}-backed static class, so tests
 * manipulate it directly and {@code @AfterEach} ensures the thread-local is
 * always cleaned up.
 *
 * <p>Both the test and the resolver call {@code LocalDate.now()} in the same JVM
 * invocation, so the formatted date strings will always match.
 *
 * <p>Satisfies Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8
 */
class MsspIndexResolverTest {

    private final MsspIndexResolver resolver = new MsspIndexResolver();

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    // -------------------------------------------------------------------------
    // Test 1 — resolveCurrentDayAlertIndex() with tenant context set
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("resolveCurrentDayAlertIndex() with TenantContext 'acme' → tenant-scoped alert index")
    void resolveCurrentDayAlertIndex_withTenantContext() {
        TenantContext.set("acme");

        String expected = "v3-hive-alert-acme-" + LocalDate.now().format(MsspIndexResolver.INDEX_DATE_FORMAT);
        String actual   = resolver.resolveCurrentDayAlertIndex();

        assertThat(actual)
                .as("resolveCurrentDayAlertIndex() must embed the tenant prefix when TenantContext is set")
                .isEqualTo(expected);
    }

    // -------------------------------------------------------------------------
    // Test 2 — resolveCurrentDayAlertIndex() with no tenant context
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("resolveCurrentDayAlertIndex() with no TenantContext → global alert index")
    void resolveCurrentDayAlertIndex_withoutTenantContext() {
        // TenantContext is intentionally NOT set

        String expected = "v3-hive-alert-" + LocalDate.now().format(MsspIndexResolver.INDEX_DATE_FORMAT);
        String actual   = resolver.resolveCurrentDayAlertIndex();

        assertThat(actual)
                .as("resolveCurrentDayAlertIndex() must omit the tenant segment when TenantContext is null")
                .isEqualTo(expected);
    }

    // -------------------------------------------------------------------------
    // Test 3 — resolveAlertIndexPattern() with tenant context set
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("resolveAlertIndexPattern() with TenantContext 'acme' → tenant-scoped alert pattern")
    void resolveAlertIndexPattern_withTenantContext() {
        TenantContext.set("acme");

        String actual = resolver.resolveAlertIndexPattern();

        assertThat(actual)
                .as("resolveAlertIndexPattern() must embed the tenant prefix when TenantContext is set")
                .isEqualTo("v3-hive-alert-acme-*");
    }

    // -------------------------------------------------------------------------
    // Test 4 — resolveAlertIndexPattern() with no tenant context
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("resolveAlertIndexPattern() with no TenantContext → global alert pattern")
    void resolveAlertIndexPattern_withoutTenantContext() {
        // TenantContext is intentionally NOT set

        String actual = resolver.resolveAlertIndexPattern();

        assertThat(actual)
                .as("resolveAlertIndexPattern() must omit the tenant segment when TenantContext is null")
                .isEqualTo("v3-hive-alert-*");
    }

    // -------------------------------------------------------------------------
    // Test 5 — resolveIndexPattern(type) with tenant context set
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("resolveIndexPattern('compliance') with TenantContext 'customer-b' → tenant-scoped compliance pattern")
    void resolveIndexPattern_customType_withTenantContext() {
        TenantContext.set("customer-b");

        String actual = resolver.resolveIndexPattern("compliance");

        assertThat(actual)
                .as("resolveIndexPattern('compliance') must embed the tenant prefix 'customer-b'")
                .isEqualTo("v3-hive-compliance-customer-b-*");
    }

    // -------------------------------------------------------------------------
    // Test 6 — resolveIndexPatternForPrefix() explicit prefix overrides TenantContext
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("resolveIndexPatternForPrefix('alert','another-tenant') overrides TenantContext 'acme'")
    void resolveIndexPatternForPrefix_explicitPrefixOverridesContext() {
        TenantContext.set("acme");

        String actual = resolver.resolveIndexPatternForPrefix("alert", "another-tenant");

        assertThat(actual)
                .as("resolveIndexPatternForPrefix() must use the explicit prefix and ignore TenantContext")
                .isEqualTo("v3-hive-alert-another-tenant-*");
    }
}
