package com.hivearmor.multitenancy;

import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import org.junit.jupiter.api.Tag;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based tests for {@link MsspIndexResolver} behavior in the compliance module.
 *
 * <p><strong>Property P1 — Index pattern is a pure function of tenant scope + data type</strong>
 * — <strong>Validates: Requirements 1.4, 1.5</strong>
 *
 * <h2>What is tested</h2>
 * <ol>
 *   <li><strong>P1a</strong> — For any prefix {@code p} in {@code [a-z0-9-]{1,32}}, when
 *       {@code TenantContext.set(1L, p)} is called, {@code resolveIndexPattern("compliance")}
 *       returns exactly {@code "v3-hive-compliance-" + p + "-*"}.</li>
 *   <li><strong>P1b</strong> — When {@code TenantContext.clear()} is called (no tenant set),
 *       {@code resolveIndexPattern("compliance")} returns exactly
 *       {@code "v3-hive-compliance-*"}.</li>
 *   <li><strong>P1c</strong> (edge) — When {@code TenantContext.set("")} (empty string) or
 *       {@code TenantContext.set(null)} is called, {@code resolveIndexPattern("compliance")}
 *       returns {@code "v3-hive-compliance-*"} (no tenant segment).</li>
 * </ol>
 *
 * <h2>Design note — no Spring context</h2>
 * <p>{@link MsspIndexResolver} is instantiated directly as {@code new MsspIndexResolver()}.
 * The component reads {@link TenantContext} via static calls and has no other dependencies.
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-24-per-tenant-compliance, Property P1}
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-24-per-tenant-compliance")
@Tag("Property P1")
class MsspIndexResolverPropertyTest {

    private static final String COMPLIANCE_DATA_TYPE = "compliance";
    private static final String EXPECTED_GLOBAL_PATTERN = "v3-hive-compliance-*";

    /**
     * The component under test. Instantiated directly — no Spring context needed.
     */
    private final MsspIndexResolver resolver = new MsspIndexResolver();

    /**
     * After every trial: clear {@link TenantContext} to prevent state leaking between trials.
     * <p>This is the MSSP tenant-scope hygiene requirement: every code path that sets
     * TenantContext must clear it afterward.
     */
    @AfterTry
    void afterTry() {
        TenantContext.clear();
    }

    // =========================================================================
    // Property P1a — with tenant scope set, returns tenant-scoped pattern
    // Validates: Requirements 1.4, 1.5
    // =========================================================================

    /**
     * For any tenant prefix {@code p} matching {@code [a-z0-9-]{1,32}}, when
     * {@code TenantContext.set(1L, p)} is called, {@code resolveIndexPattern("compliance")}
     * MUST return exactly {@code "v3-hive-compliance-" + p + "-*"}.
     *
     * <p>This verifies that the resolver is a pure function of (tenant scope, data type) —
     * changing the tenant prefix always changes the returned pattern deterministically.
     *
     * <p><strong>Validates: Requirements 1.4, 1.5</strong>
     */
    @Property(tries = 100)
    void propertyP1a_withTenantScope_returnsComplianceTenantPattern(
            @ForAll("complianceTenantPrefixes") String prefix) {

        String expected = "v3-hive-compliance-" + prefix + "-*";

        TenantContext.set(1L, prefix);
        String actual = resolver.resolveIndexPattern(COMPLIANCE_DATA_TYPE);

        assertThat(actual)
                .as("resolveIndexPattern(\"%s\") with TenantContext prefix='%s' must equal '%s'",
                        COMPLIANCE_DATA_TYPE, prefix, expected)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property P1b — without tenant scope, returns global pattern
    // Validates: Requirements 1.4, 1.5
    // =========================================================================

    /**
     * When {@link TenantContext} is cleared (no tenant set),
     * {@code resolveIndexPattern("compliance")} MUST return exactly
     * {@code "v3-hive-compliance-*"} with no tenant segment.
     *
     * <p>The {@code @AfterTry} hook ensures TenantContext is clear before each trial.
     * This property verifies the global (no-tenant) branch returns the expected value.
     *
     * <p><strong>Validates: Requirements 1.4, 1.5</strong>
     */
    @Property(tries = 1)
    void propertyP1b_withNoTenantScope_returnsGlobalCompliancePattern() {

        // TenantContext is clear (afterTry ensures this between trials).
        String actual = resolver.resolveIndexPattern(COMPLIANCE_DATA_TYPE);

        assertThat(actual)
                .as("resolveIndexPattern(\"%s\") with no TenantContext must equal '%s'",
                        COMPLIANCE_DATA_TYPE, EXPECTED_GLOBAL_PATTERN)
                .isEqualTo(EXPECTED_GLOBAL_PATTERN);
    }

    // =========================================================================
    // Property P1c (edge) — empty or null prefix returns global pattern
    // Validates: Requirements 1.4, 1.5
    // =========================================================================

    /**
     * When {@code TenantContext.set("")} (empty string) is called,
     * {@code resolveIndexPattern("compliance")} MUST return {@code "v3-hive-compliance-*"}.
     *
     * <p>An empty prefix is not a valid MSSP tenant scope and MUST NOT produce a
     * tenant-scoped index pattern. The spec requires the global pattern to be returned
     * whenever the tenant prefix is absent or blank.
     *
     * <p><strong>Validates: Requirements 1.4, 1.5</strong>
     */
    @Property(tries = 1)
    void propertyP1c_emptyStringPrefix_returnsGlobalCompliancePattern() {

        TenantContext.set("");
        String actual = resolver.resolveIndexPattern(COMPLIANCE_DATA_TYPE);

        assertThat(actual)
                .as("resolveIndexPattern(\"%s\") with empty-string prefix must equal '%s' "
                        + "(empty prefix must not produce a tenant-scoped pattern)",
                        COMPLIANCE_DATA_TYPE, EXPECTED_GLOBAL_PATTERN)
                .isEqualTo(EXPECTED_GLOBAL_PATTERN);
    }

    /**
     * When {@code TenantContext.set(null)} is called (prefix is null),
     * {@code resolveIndexPattern("compliance")} MUST return {@code "v3-hive-compliance-*"}.
     *
     * <p>{@link TenantContext#set(String)} with a {@code null} argument stores {@code null}
     * in the ThreadLocal, which means {@link TenantContext#isMssp()} returns {@code false},
     * so the resolver MUST use the global pattern.
     *
     * <p><strong>Validates: Requirements 1.4, 1.5</strong>
     */
    @Property(tries = 1)
    void propertyP1c_nullPrefix_returnsGlobalCompliancePattern() {

        // set(null) — prefix stored as null; isMssp() returns false.
        TenantContext.set((String) null);
        String actual = resolver.resolveIndexPattern(COMPLIANCE_DATA_TYPE);

        assertThat(actual)
                .as("resolveIndexPattern(\"%s\") with null prefix must equal '%s'",
                        COMPLIANCE_DATA_TYPE, EXPECTED_GLOBAL_PATTERN)
                .isEqualTo(EXPECTED_GLOBAL_PATTERN);
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Produces valid tenant prefix strings matching {@code [a-z0-9-]{1,32}}.
     *
     * <p>The character set is lowercase alphanumerics and hyphens, covering the full
     * range of valid MSSP {@code ha_client.client_prefix} values used for compliance
     * index routing.
     */
    @Provide
    Arbitrary<String> complianceTenantPrefixes() {
        return Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(32);
    }
}
