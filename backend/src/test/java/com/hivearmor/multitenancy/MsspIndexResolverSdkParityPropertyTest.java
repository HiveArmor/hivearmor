package com.hivearmor.multitenancy;

import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import org.junit.jupiter.api.Tag;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based tests for {@link MsspIndexResolver} SDK format parity.
 *
 * <p><strong>Property 12: SDK format parity</strong>
 * — <strong>Validates: Requirements 9.8</strong>
 *
 * <h2>What is tested</h2>
 * <p>The Java {@link MsspIndexResolver} output MUST be byte-for-byte identical to the
 * Go SDK's builder function output. Because {@code sdk/os/} is Go code, the reference
 * SDK builder functions are transcribed as Java string constants in this test class
 * (per the task specification: do not modify {@code sdk/} or {@code go-sdk-main/}).
 *
 * <p>The four Go SDK functions being mirrored are:
 * <ul>
 *   <li>{@code BuildCurrentDayIndex(type)} → {@code "v3-hive-" + type + "-" + date}</li>
 *   <li>{@code BuildTenantIndex(type, prefix)} → {@code "v3-hive-" + type + "-" + prefix + "-" + date}</li>
 *   <li>{@code BuildIndexPattern(type)} → {@code "v3-hive-" + type + "-*"}</li>
 *   <li>{@code BuildTenantIndexPattern(type, prefix)} → {@code "v3-hive-" + type + "-" + prefix + "-*"}</li>
 * </ul>
 *
 * <h2>Assertions</h2>
 * <p>For each arbitrary {@code (type, prefix)} pair:
 * <ol>
 *   <li>{@code resolver.resolveCurrentDayIndex(type)} with no {@code TenantContext}
 *       equals {@code sdkBuildCurrentDayIndex(type, date)}</li>
 *   <li>{@code resolver.resolveCurrentDayIndex(type)} with {@code TenantContext.set(prefix)}
 *       equals {@code sdkBuildTenantIndex(type, prefix, date)}</li>
 *   <li>{@code resolver.resolveIndexPattern(type)} with no {@code TenantContext}
 *       equals {@code sdkBuildIndexPattern(type)}</li>
 *   <li>{@code resolver.resolveIndexPattern(type)} with {@code TenantContext.set(prefix)}
 *       equals {@code sdkBuildTenantIndexPattern(type, prefix)}</li>
 * </ol>
 *
 * <p>Where {@code date = LocalDate.now().format(MsspIndexResolver.INDEX_DATE_FORMAT)}.
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-21-mssp-schema, Property 12}
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-21-mssp-schema")
@Tag("Property 12")
class MsspIndexResolverSdkParityPropertyTest {

    /** The component under test — instantiated directly, no Spring context needed. */
    private final MsspIndexResolver resolver = new MsspIndexResolver();

    /**
     * Clears the {@code TenantContext} after every jqwik trial to prevent state
     * leakage between trials.
     */
    @AfterTry
    void afterTry() {
        TenantContext.clear();
    }

    // =========================================================================
    // Reference implementations of Go SDK functions (transcribed from sdk/os/)
    //
    // These four methods are Java transcriptions of the four builder functions in
    // sdk/os/ and must NOT be modified. They represent the canonical reference format
    // against which the Java resolver is verified.
    // =========================================================================

    /**
     * Java transcription of Go SDK {@code BuildCurrentDayIndex(type)}.
     * Returns {@code "v3-hive-" + type + "-" + date}.
     */
    private static String sdkBuildCurrentDayIndex(String type, String date) {
        return "v3-hive-" + type + "-" + date;
    }

    /**
     * Java transcription of Go SDK {@code BuildTenantIndex(type, prefix)}.
     * Returns {@code "v3-hive-" + type + "-" + prefix + "-" + date}.
     */
    private static String sdkBuildTenantIndex(String type, String prefix, String date) {
        return "v3-hive-" + type + "-" + prefix + "-" + date;
    }

    /**
     * Java transcription of Go SDK {@code BuildIndexPattern(type)}.
     * Returns {@code "v3-hive-" + type + "-*"}.
     */
    private static String sdkBuildIndexPattern(String type) {
        return "v3-hive-" + type + "-*";
    }

    /**
     * Java transcription of Go SDK {@code BuildTenantIndexPattern(type, prefix)}.
     * Returns {@code "v3-hive-" + type + "-" + prefix + "-*"}.
     */
    private static String sdkBuildTenantIndexPattern(String type, String prefix) {
        return "v3-hive-" + type + "-" + prefix + "-*";
    }

    // =========================================================================
    // Property 12-A: resolveCurrentDayIndex (no tenant) == sdkBuildCurrentDayIndex
    // Validates: Requirement 9.8
    // =========================================================================

    /**
     * For any arbitrary {@code type} string matching {@code [a-z]+}:
     * <p>When no {@code TenantContext} is set, {@code resolver.resolveCurrentDayIndex(type)}
     * MUST produce a string byte-for-byte identical to
     * {@code sdkBuildCurrentDayIndex(type, date)}.
     *
     * <p>This mirrors Go SDK's {@code BuildCurrentDayIndex(type)}.
     *
     * <p><strong>Validates: Requirement 9.8</strong>
     */
    @Property(tries = 100)
    void property12A_resolveCurrentDayIndex_noTenant_matchesSdkBuildCurrentDayIndex(
            @ForAll("indexTypes") String type) {

        // Pre-condition: no tenant context
        assertThat(TenantContext.get())
                .as("Pre-condition: TenantContext must be null before trial")
                .isNull();

        // Capture the date at the same instant as the resolver will use it.
        // Both calls happen within the same test invocation so they always agree.
        String date     = LocalDate.now().format(MsspIndexResolver.INDEX_DATE_FORMAT);
        String expected = sdkBuildCurrentDayIndex(type, date);
        String actual   = resolver.resolveCurrentDayIndex(type);

        assertThat(actual)
                .as("resolveCurrentDayIndex('%s') with no TenantContext must equal "
                        + "sdkBuildCurrentDayIndex('%s', '%s')", type, type, date)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 12-B: resolveCurrentDayIndex (with tenant) == sdkBuildTenantIndex
    // Validates: Requirement 9.8
    // =========================================================================

    /**
     * For any arbitrary {@code type} string matching {@code [a-z]+} and any
     * {@code prefix} matching the client-prefix regex
     * {@code ^[a-z0-9][a-z0-9-]{1,19}$}:
     * <p>When {@code TenantContext.set(prefix)} has been called,
     * {@code resolver.resolveCurrentDayIndex(type)} MUST produce a string byte-for-byte
     * identical to {@code sdkBuildTenantIndex(type, prefix, date)}.
     *
     * <p>This mirrors Go SDK's {@code BuildTenantIndex(type, prefix)}.
     *
     * <p><strong>Validates: Requirement 9.8</strong>
     */
    @Property(tries = 100)
    void property12B_resolveCurrentDayIndex_withTenant_matchesSdkBuildTenantIndex(
            @ForAll("indexTypes") String type,
            @ForAll("validClientPrefixes") String prefix) {

        TenantContext.set(prefix);

        String date     = LocalDate.now().format(MsspIndexResolver.INDEX_DATE_FORMAT);
        String expected = sdkBuildTenantIndex(type, prefix, date);
        String actual   = resolver.resolveCurrentDayIndex(type);

        assertThat(actual)
                .as("resolveCurrentDayIndex('%s') with TenantContext '%s' must equal "
                        + "sdkBuildTenantIndex('%s', '%s', '%s')", type, prefix, type, prefix, date)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 12-C: resolveIndexPattern (no tenant) == sdkBuildIndexPattern
    // Validates: Requirement 9.8
    // =========================================================================

    /**
     * For any arbitrary {@code type} string matching {@code [a-z]+}:
     * <p>When no {@code TenantContext} is set, {@code resolver.resolveIndexPattern(type)}
     * MUST produce a string byte-for-byte identical to {@code sdkBuildIndexPattern(type)}.
     *
     * <p>This mirrors Go SDK's {@code BuildIndexPattern(type)}.
     *
     * <p><strong>Validates: Requirement 9.8</strong>
     */
    @Property(tries = 100)
    void property12C_resolveIndexPattern_noTenant_matchesSdkBuildIndexPattern(
            @ForAll("indexTypes") String type) {

        // Pre-condition: no tenant context
        assertThat(TenantContext.get())
                .as("Pre-condition: TenantContext must be null before trial")
                .isNull();

        String expected = sdkBuildIndexPattern(type);
        String actual   = resolver.resolveIndexPattern(type);

        assertThat(actual)
                .as("resolveIndexPattern('%s') with no TenantContext must equal "
                        + "sdkBuildIndexPattern('%s')", type, type)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 12-D: resolveIndexPattern (with tenant) == sdkBuildTenantIndexPattern
    // Validates: Requirement 9.8
    // =========================================================================

    /**
     * For any arbitrary {@code type} string matching {@code [a-z]+} and any
     * {@code prefix} matching the client-prefix regex
     * {@code ^[a-z0-9][a-z0-9-]{1,19}$}:
     * <p>When {@code TenantContext.set(prefix)} has been called,
     * {@code resolver.resolveIndexPattern(type)} MUST produce a string byte-for-byte
     * identical to {@code sdkBuildTenantIndexPattern(type, prefix)}.
     *
     * <p>This mirrors Go SDK's {@code BuildTenantIndexPattern(type, prefix)}.
     *
     * <p><strong>Validates: Requirement 9.8</strong>
     */
    @Property(tries = 100)
    void property12D_resolveIndexPattern_withTenant_matchesSdkBuildTenantIndexPattern(
            @ForAll("indexTypes") String type,
            @ForAll("validClientPrefixes") String prefix) {

        TenantContext.set(prefix);

        String expected = sdkBuildTenantIndexPattern(type, prefix);
        String actual   = resolver.resolveIndexPattern(type);

        assertThat(actual)
                .as("resolveIndexPattern('%s') with TenantContext '%s' must equal "
                        + "sdkBuildTenantIndexPattern('%s', '%s')", type, prefix, type, prefix)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 12-E: Combined parity across all four SDK functions in a single trial
    // Validates: Requirement 9.8
    // =========================================================================

    /**
     * For any arbitrary {@code (type, prefix)} pair, verifies all four SDK function
     * equivalences within a single trial:
     * <ol>
     *   <li>No-tenant current-day index matches {@code sdkBuildCurrentDayIndex}.</li>
     *   <li>Tenant current-day index matches {@code sdkBuildTenantIndex}.</li>
     *   <li>No-tenant index pattern matches {@code sdkBuildIndexPattern}.</li>
     *   <li>Tenant index pattern matches {@code sdkBuildTenantIndexPattern}.</li>
     * </ol>
     *
     * <p>Changing {@code TenantContext} mid-trial also confirms the resolver reads it
     * fresh on every call (no caching), per Requirement 9.7.
     *
     * <p><strong>Validates: Requirement 9.8</strong>
     */
    @Property(tries = 100)
    void property12E_allFourSdkFunctions_parityCombined(
            @ForAll("indexTypes") String type,
            @ForAll("validClientPrefixes") String prefix) {

        String date = LocalDate.now().format(MsspIndexResolver.INDEX_DATE_FORMAT);

        // --- 1. No-tenant: resolveCurrentDayIndex == sdkBuildCurrentDayIndex ---
        assertThat(TenantContext.get()).as("context must start null").isNull();
        assertThat(resolver.resolveCurrentDayIndex(type))
                .as("[no-tenant] resolveCurrentDayIndex('%s') must match sdkBuildCurrentDayIndex", type)
                .isEqualTo(sdkBuildCurrentDayIndex(type, date));

        // --- 2. With tenant: resolveCurrentDayIndex == sdkBuildTenantIndex ---
        TenantContext.set(prefix);
        assertThat(resolver.resolveCurrentDayIndex(type))
                .as("[with-tenant='%s'] resolveCurrentDayIndex('%s') must match sdkBuildTenantIndex",
                        prefix, type)
                .isEqualTo(sdkBuildTenantIndex(type, prefix, date));

        // --- 3. No-tenant: resolveIndexPattern == sdkBuildIndexPattern ---
        TenantContext.clear();
        assertThat(TenantContext.get()).as("context must be null after clear").isNull();
        assertThat(resolver.resolveIndexPattern(type))
                .as("[no-tenant] resolveIndexPattern('%s') must match sdkBuildIndexPattern", type)
                .isEqualTo(sdkBuildIndexPattern(type));

        // --- 4. With tenant: resolveIndexPattern == sdkBuildTenantIndexPattern ---
        TenantContext.set(prefix);
        assertThat(resolver.resolveIndexPattern(type))
                .as("[with-tenant='%s'] resolveIndexPattern('%s') must match sdkBuildTenantIndexPattern",
                        prefix, type)
                .isEqualTo(sdkBuildTenantIndexPattern(type, prefix));
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Generates arbitrary OpenSearch index type strings matching {@code [a-z]+}.
     * These correspond to the {@code type} argument used by the Go SDK builders
     * (e.g. {@code "alert"}, {@code "compliance"}, {@code "incident"}).
     * Minimum length 1, maximum length 20.
     */
    @Provide
    Arbitrary<String> indexTypes() {
        return Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz")
                .ofMinLength(1)
                .ofMaxLength(20);
    }

    /**
     * Generates arbitrary tenant prefix strings matching the client-prefix regex
     * {@code ^[a-z0-9][a-z0-9-]{1,19}$}: total length 2–20, starting with an
     * alphanumeric character, followed by alphanumerics and hyphens.
     *
     * <p>These are the values that may appear as the {@code prefix} segment in
     * {@code sdkBuildTenantIndex} and {@code sdkBuildTenantIndexPattern}.
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
                .as((f, r) -> f + r);
    }
}
