package com.hivearmor.multitenancy;

import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import org.junit.jupiter.api.Tag;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based tests for {@link MsspIndexResolver} index format determinism.
 *
 * <p><strong>Property 10: MsspIndexResolver index format determinism</strong>
 * — <strong>Validates: Requirements 9.2, 9.3, 9.4, 9.5, 9.7</strong>
 *
 * <h2>What is tested</h2>
 * <p>For arbitrary {@code type} strings matching {@code [a-z]+} and arbitrary
 * {@code prefix} values (null or matching {@code ^[a-z0-9][a-z0-9-]{1,19}$}), the
 * following invariants must hold:
 *
 * <ol>
 *   <li>With prefix set: {@code resolveCurrentDayIndex(type)} returns
 *       {@code "v3-hive-" + type + "-" + prefix + "-" + date}</li>
 *   <li>Without prefix: {@code resolveCurrentDayIndex(type)} returns
 *       {@code "v3-hive-" + type + "-" + date}</li>
 *   <li>With prefix set: {@code resolveIndexPattern(type)} returns
 *       {@code "v3-hive-" + type + "-" + prefix + "-*"}</li>
 *   <li>Without prefix: {@code resolveIndexPattern(type)} returns
 *       {@code "v3-hive-" + type + "-*"}</li>
 *   <li>No caching: changing {@code TenantContext} between two calls changes the
 *       returned value (the resolver reads {@code TenantContext} fresh each time).</li>
 * </ol>
 *
 * <h2>Design note — no Spring context</h2>
 * <p>{@link MsspIndexResolver} is instantiated directly as
 * {@code new MsspIndexResolver()} — no Spring bootstrap required. The component
 * reads {@link TenantContext} via static calls and has no other dependencies.
 *
 * <h2>Date freezing</h2>
 * <p>{@code LocalDate.now()} is captured once at the start of each property method
 * and the expected value is formatted using {@link MsspIndexResolver#INDEX_DATE_FORMAT}
 * so that tests are resilient to midnight rollover within a single trial.
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-21-mssp-schema, Property 10}
 *
 * <h2>Minimum iterations</h2>
 * <p>100 per property (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-21-mssp-schema")
@Tag("Property 10")
class MsspIndexResolverFormatPropertyTest {

    /**
     * The component under test. Instantiated directly — no Spring context needed.
     */
    private final MsspIndexResolver resolver = new MsspIndexResolver();

    /**
     * After every trial: clear TenantContext to prevent state leaking between trials.
     */
    @AfterTry
    void afterTry() {
        TenantContext.clear();
    }

    // =========================================================================
    // Property 10-A: resolveCurrentDayIndex(type) with prefix set
    // Validates: Requirements 9.2, 9.3
    // =========================================================================

    /**
     * When {@link TenantContext} holds a valid {@code prefix}, {@code resolveCurrentDayIndex(type)}
     * MUST return {@code "v3-hive-" + type + "-" + prefix + "-" + date}.
     *
     * <p><strong>Validates: Requirements 9.2, 9.3</strong>
     */
    @Property(tries = 100)
    void property10A_resolveCurrentDayIndex_withPrefix_returnsExpectedFormat(
            @ForAll("lowerAlphaTypes") String type,
            @ForAll("validClientPrefixes") String prefix) {

        // Freeze the expected date before calling the resolver to avoid midnight races.
        String expectedDate = LocalDate.now().format(MsspIndexResolver.INDEX_DATE_FORMAT);
        String expected = "v3-hive-" + type + "-" + prefix + "-" + expectedDate;

        TenantContext.set(prefix);
        String actual = resolver.resolveCurrentDayIndex(type);

        assertThat(actual)
                .as("resolveCurrentDayIndex('%s') with TenantContext='%s' must equal '%s'",
                        type, prefix, expected)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 10-B: resolveCurrentDayIndex(type) without prefix
    // Validates: Requirements 9.2, 9.3
    // =========================================================================

    /**
     * When no {@link TenantContext} is set, {@code resolveCurrentDayIndex(type)}
     * MUST return {@code "v3-hive-" + type + "-" + date} (no tenant segment).
     *
     * <p><strong>Validates: Requirements 9.2, 9.3</strong>
     */
    @Property(tries = 100)
    void property10B_resolveCurrentDayIndex_withoutPrefix_returnsGlobalFormat(
            @ForAll("lowerAlphaTypes") String type) {

        // No TenantContext.set() call — context is null (cleared in @AfterTry).
        String expectedDate = LocalDate.now().format(MsspIndexResolver.INDEX_DATE_FORMAT);
        String expected = "v3-hive-" + type + "-" + expectedDate;

        String actual = resolver.resolveCurrentDayIndex(type);

        assertThat(actual)
                .as("resolveCurrentDayIndex('%s') with no TenantContext must equal '%s'",
                        type, expected)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 10-C: resolveIndexPattern(type) with prefix set
    // Validates: Requirements 9.4, 9.5
    // =========================================================================

    /**
     * When {@link TenantContext} holds a valid {@code prefix}, {@code resolveIndexPattern(type)}
     * MUST return {@code "v3-hive-" + type + "-" + prefix + "-*"}.
     *
     * <p><strong>Validates: Requirements 9.4, 9.5</strong>
     */
    @Property(tries = 100)
    void property10C_resolveIndexPattern_withPrefix_returnsExpectedFormat(
            @ForAll("lowerAlphaTypes") String type,
            @ForAll("validClientPrefixes") String prefix) {

        String expected = "v3-hive-" + type + "-" + prefix + "-*";

        TenantContext.set(prefix);
        String actual = resolver.resolveIndexPattern(type);

        assertThat(actual)
                .as("resolveIndexPattern('%s') with TenantContext='%s' must equal '%s'",
                        type, prefix, expected)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 10-D: resolveIndexPattern(type) without prefix
    // Validates: Requirements 9.4, 9.5
    // =========================================================================

    /**
     * When no {@link TenantContext} is set, {@code resolveIndexPattern(type)}
     * MUST return {@code "v3-hive-" + type + "-*"} (no tenant segment).
     *
     * <p><strong>Validates: Requirements 9.4, 9.5</strong>
     */
    @Property(tries = 100)
    void property10D_resolveIndexPattern_withoutPrefix_returnsGlobalFormat(
            @ForAll("lowerAlphaTypes") String type) {

        String expected = "v3-hive-" + type + "-*";

        String actual = resolver.resolveIndexPattern(type);

        assertThat(actual)
                .as("resolveIndexPattern('%s') with no TenantContext must equal '%s'",
                        type, expected)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 10-E: no caching — changing TenantContext changes the result
    // Validates: Requirement 9.7
    // =========================================================================

    /**
     * When {@link TenantContext} is changed between two calls to the same method,
     * the second call MUST reflect the new context value (i.e., the resolver reads
     * {@link TenantContext#get()} fresh on every invocation and does not cache it).
     *
     * <p>This property tests both {@code resolveCurrentDayIndex} and
     * {@code resolveIndexPattern} to cover both method families.
     *
     * <p><strong>Validates: Requirement 9.7</strong>
     */
    @Property(tries = 100)
    void property10E_noCaching_contextChangeIsReflectedInNextCall(
            @ForAll("lowerAlphaTypes") String type,
            @ForAll("validClientPrefixes") String prefix1,
            @ForAll("validClientPrefixes") String prefix2) {

        // Skip trials where both prefixes are identical — the property is trivially
        // satisfied for equal prefixes since the output would be equal regardless.
        Assume.that(!prefix1.equals(prefix2));

        // --- resolveCurrentDayIndex ---
        String date = LocalDate.now().format(MsspIndexResolver.INDEX_DATE_FORMAT);

        TenantContext.set(prefix1);
        String result1 = resolver.resolveCurrentDayIndex(type);

        TenantContext.set(prefix2);
        String result2 = resolver.resolveCurrentDayIndex(type);

        assertThat(result1)
                .as("resolveCurrentDayIndex('%s') result1 with prefix='%s' should differ from result2 with prefix='%s'",
                        type, prefix1, prefix2)
                .isNotEqualTo(result2);

        // Verify exact content of each result against the expected format.
        assertThat(result1)
                .as("result1 must embed prefix1='%s' in correct position", prefix1)
                .isEqualTo("v3-hive-" + type + "-" + prefix1 + "-" + date);

        assertThat(result2)
                .as("result2 must embed prefix2='%s' in correct position", prefix2)
                .isEqualTo("v3-hive-" + type + "-" + prefix2 + "-" + date);

        // --- resolveIndexPattern ---
        TenantContext.set(prefix1);
        String pat1 = resolver.resolveIndexPattern(type);

        TenantContext.set(prefix2);
        String pat2 = resolver.resolveIndexPattern(type);

        assertThat(pat1)
                .as("resolveIndexPattern('%s') pat1 with prefix='%s' should differ from pat2 with prefix='%s'",
                        type, prefix1, prefix2)
                .isNotEqualTo(pat2);

        assertThat(pat1)
                .as("pat1 must embed prefix1='%s' in correct position", prefix1)
                .isEqualTo("v3-hive-" + type + "-" + prefix1 + "-*");

        assertThat(pat2)
                .as("pat2 must embed prefix2='%s' in correct position", prefix2)
                .isEqualTo("v3-hive-" + type + "-" + prefix2 + "-*");
    }

    // =========================================================================
    // Property 10-F: context cleared between calls — second call uses new context
    // Validates: Requirement 9.7
    // =========================================================================

    /**
     * When {@link TenantContext} is cleared between two calls (simulating end of
     * request), the second call MUST fall back to the global (no-tenant) format.
     *
     * <p>This complements Property 10-E by verifying that clearing (not just
     * changing) the context is also reflected immediately.
     *
     * <p><strong>Validates: Requirement 9.7</strong>
     */
    @Property(tries = 100)
    void property10F_contextClearedBetweenCalls_secondCallUsesGlobalFormat(
            @ForAll("lowerAlphaTypes") String type,
            @ForAll("validClientPrefixes") String prefix) {

        String date = LocalDate.now().format(MsspIndexResolver.INDEX_DATE_FORMAT);

        // First call: with prefix.
        TenantContext.set(prefix);
        String withPrefix = resolver.resolveCurrentDayIndex(type);
        assertThat(withPrefix)
                .isEqualTo("v3-hive-" + type + "-" + prefix + "-" + date);

        // Clear context (simulates finally block in TenantContextFilter).
        TenantContext.clear();

        // Second call: no prefix — must use global format.
        String withoutPrefix = resolver.resolveCurrentDayIndex(type);
        assertThat(withoutPrefix)
                .as("After TenantContext.clear(), resolveCurrentDayIndex must fall back to global format")
                .isEqualTo("v3-hive-" + type + "-" + date);
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Produces arbitrary lowercase-alpha {@code type} strings matching {@code [a-z]+},
     * with length 1–20 characters. These represent OpenSearch document types like
     * {@code "alert"}, {@code "compliance"}, {@code "incident"}.
     */
    @Provide
    Arbitrary<String> lowerAlphaTypes() {
        return Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz")
                .ofMinLength(1)
                .ofMaxLength(20);
    }

    /**
     * Produces valid {@code client_prefix} strings matching the regex
     * {@code ^[a-z0-9][a-z0-9-]{1,19}$} — total length 2–20 characters,
     * lowercase alphanumerics and hyphens, first character alphanumeric.
     *
     * <p>The generator mirrors the DB CHECK constraint so that every generated
     * prefix would be accepted by PostgreSQL's {@code ha_client_prefix_fmt} check.
     */
    @Provide
    Arbitrary<String> validClientPrefixes() {
        Arbitrary<Character> firstChar = Arbitraries.chars()
                .with("abcdefghijklmnopqrstuvwxyz0123456789");
        Arbitrary<String> rest = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(19);
        return Combinators.combine(firstChar, rest)
                .as((first, tail) -> first + tail);
    }
}
