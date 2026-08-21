package com.hivearmor.multitenancy;

import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import org.junit.jupiter.api.Tag;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based tests for {@link MsspIndexResolver#resolveIndexPatternForPrefix(String, String)}.
 *
 * <p><strong>Property 11: MsspIndexResolver explicit prefix override</strong>
 * — <strong>Validates: Requirements 9.6</strong>
 *
 * <h2>What is tested</h2>
 * <p>For arbitrary {@code (contextPrefix, explicitPrefix)} pairs where
 * {@code contextPrefix} is null or a valid client-prefix string, and
 * {@code explicitPrefix} is any string (including null, blank, and non-blank values):
 *
 * <ul>
 *   <li>When {@code explicitPrefix} is {@code null} or {@code isBlank()},
 *       {@code resolveIndexPatternForPrefix(type, explicitPrefix)} MUST equal
 *       {@code resolveIndexPattern(type)}, i.e. it falls back to the
 *       {@code TenantContext}-based resolution.</li>
 *   <li>When {@code explicitPrefix} is non-null and non-blank,
 *       {@code resolveIndexPatternForPrefix(type, explicitPrefix)} MUST equal
 *       {@code "v3-hive-" + type + "-" + explicitPrefix.trim() + "-*"} regardless
 *       of the current {@code contextPrefix} value — the explicit argument overrides
 *       the thread-local tenant context entirely.</li>
 * </ul>
 *
 * <h2>Design note — no Spring context needed</h2>
 * <p>{@link MsspIndexResolver} has no constructor dependencies; it only reads from
 * {@link TenantContext} (a static {@code ThreadLocal}). The resolver is instantiated
 * directly with {@code new MsspIndexResolver()} and the thread-local is set/cleared
 * per trial via {@link TenantContext#set(String)} and {@link TenantContext#clear()}.
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-21-mssp-schema, Property 11}
 *
 * <h2>Minimum iterations</h2>
 * <p>100 per property (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-21-mssp-schema")
@Tag("Property 11")
class MsspIndexResolverExplicitPrefixPropertyTest {

    /** Resolver under test — no Spring context required. */
    private final MsspIndexResolver resolver = new MsspIndexResolver();

    /**
     * Clears {@link TenantContext} after every jqwik trial so that no residual
     * thread-local value leaks into the next trial.
     */
    @AfterTry
    void afterTry() {
        TenantContext.clear();
    }

    // =========================================================================
    // Property 11-A: null explicitPrefix falls back to TenantContext resolution
    // Validates: Requirements 9.6
    // =========================================================================

    /**
     * When {@code explicitPrefix} is {@code null}, the method MUST delegate to
     * {@link MsspIndexResolver#resolveIndexPattern(String)} and therefore honour
     * whatever prefix (or absence thereof) is currently stored in
     * {@link TenantContext}.
     *
     * <p><strong>Validates: Requirements 9.6</strong>
     */
    @Property(tries = 100)
    void property11A_nullExplicitPrefix_fallsBackToTenantContext(
            @ForAll("optionalContextPrefixes") String contextPrefix,
            @ForAll("indexTypes") String type) {

        // Set up TenantContext with the generated contextPrefix (or clear it if null).
        if (contextPrefix != null) {
            TenantContext.set(contextPrefix);
        }

        String result   = resolver.resolveIndexPatternForPrefix(type, null);
        String expected = resolver.resolveIndexPattern(type);

        assertThat(result)
                .as("resolveIndexPatternForPrefix(type='%s', null) must equal resolveIndexPattern(type) "
                        + "when contextPrefix='%s'", type, contextPrefix)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 11-B: blank explicitPrefix falls back to TenantContext resolution
    // Validates: Requirements 9.6
    // =========================================================================

    /**
     * When {@code explicitPrefix} is non-null but blank (whitespace-only or empty),
     * the method MUST delegate to {@link MsspIndexResolver#resolveIndexPattern(String)}
     * and honour the current {@link TenantContext} value.
     *
     * <p><strong>Validates: Requirements 9.6</strong>
     */
    @Property(tries = 100)
    void property11B_blankExplicitPrefix_fallsBackToTenantContext(
            @ForAll("optionalContextPrefixes") String contextPrefix,
            @ForAll("blankStrings") String blankPrefix,
            @ForAll("indexTypes") String type) {

        if (contextPrefix != null) {
            TenantContext.set(contextPrefix);
        }

        String result   = resolver.resolveIndexPatternForPrefix(type, blankPrefix);
        String expected = resolver.resolveIndexPattern(type);

        assertThat(result)
                .as("resolveIndexPatternForPrefix(type='%s', blankPrefix='%s') must equal "
                        + "resolveIndexPattern(type) when contextPrefix='%s'",
                        type, blankPrefix, contextPrefix)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 11-C: non-blank explicitPrefix overrides TenantContext
    // Validates: Requirements 9.6
    // =========================================================================

    /**
     * When {@code explicitPrefix} is non-null and non-blank, the method MUST return
     * the exact string {@code "v3-hive-" + type + "-" + explicitPrefix.trim() + "-*"},
     * regardless of what is currently stored in {@link TenantContext}.
     *
     * <p>This is the core contract of Requirement 9.6: the explicit argument takes
     * unconditional precedence over the thread-local context prefix.
     *
     * <p><strong>Validates: Requirements 9.6</strong>
     */
    @Property(tries = 100)
    void property11C_nonBlankExplicitPrefix_overridesTenantContext(
            @ForAll("optionalContextPrefixes") String contextPrefix,
            @ForAll("nonBlankExplicitPrefixes") String explicitPrefix,
            @ForAll("indexTypes") String type) {

        if (contextPrefix != null) {
            TenantContext.set(contextPrefix);
        }

        String result   = resolver.resolveIndexPatternForPrefix(type, explicitPrefix);
        String expected = "v3-hive-" + type + "-" + explicitPrefix.trim() + "-*";

        assertThat(result)
                .as("resolveIndexPatternForPrefix(type='%s', explicitPrefix='%s') must equal "
                        + "'%s' regardless of contextPrefix='%s'",
                        type, explicitPrefix, expected, contextPrefix)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Property 11-D: non-blank explicitPrefix overrides even when context is set
    // Validates: Requirements 9.6 (explicit pair test — both non-null context and explicit)
    // =========================================================================

    /**
     * A focused variant of property 11-C that ensures a non-null, non-blank
     * {@code contextPrefix} is silently overridden by a distinct non-blank
     * {@code explicitPrefix}. The result must reflect only {@code explicitPrefix}.
     *
     * <p>This guards against an implementation that combines or prefers the
     * context prefix when both values are non-null/non-blank.
     *
     * <p><strong>Validates: Requirements 9.6</strong>
     */
    @Property(tries = 100)
    void property11D_explicitOverridesNonNullContext(
            @ForAll("validContextPrefixes") String contextPrefix,
            @ForAll("nonBlankExplicitPrefixes") String explicitPrefix,
            @ForAll("indexTypes") String type) {

        // Guarantee both are set so the override is meaningful.
        TenantContext.set(contextPrefix);

        String result   = resolver.resolveIndexPatternForPrefix(type, explicitPrefix);
        String expected = "v3-hive-" + type + "-" + explicitPrefix.trim() + "-*";

        assertThat(result)
                .as("resolveIndexPatternForPrefix(type='%s', explicitPrefix='%s') must equal "
                        + "'%s' regardless of contextPrefix='%s'",
                        type, explicitPrefix, expected, contextPrefix)
                .isEqualTo(expected);
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Produces arbitrary index type strings using only lowercase ASCII letters.
     * Examples: "alert", "compliance", "incident", "a", "zz".
     * Restricted to {@code [a-z]+} to match the OpenSearch index grammar defined
     * in the design document.
     */
    @Provide
    Arbitrary<String> indexTypes() {
        return Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz")
                .ofMinLength(1)
                .ofMaxLength(20);
    }

    /**
     * Produces either {@code null} or a valid {@code client_prefix} string matching
     * {@code ^[a-z0-9][a-z0-9-]{1,19}$} (total length 2–20 characters).
     *
     * <p>A null value represents the case where no tenant is active in
     * {@link TenantContext} for the current request.
     */
    @Provide
    Arbitrary<String> optionalContextPrefixes() {
        return Arbitraries.oneOf(
                Arbitraries.just(null),
                validContextPrefixes()
        );
    }

    /**
     * Produces valid {@code client_prefix} strings matching the regex
     * {@code ^[a-z0-9][a-z0-9-]{1,19}$}.
     *
     * <p>First character is drawn from {@code [a-z0-9]}; remaining characters
     * are drawn from {@code [a-z0-9-]}; total length 2–20.
     */
    @Provide
    Arbitrary<String> validContextPrefixes() {
        Arbitrary<Character> firstChar = Arbitraries.chars()
                .with("abcdefghijklmnopqrstuvwxyz0123456789");

        Arbitrary<String> rest = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(19);

        return Combinators.combine(firstChar, rest)
                .as((first, tail) -> first + tail);
    }

    /**
     * Produces blank strings: the empty string and strings consisting entirely of
     * ASCII whitespace characters (space, tab, newline, carriage return).
     *
     * <p>Both {@code null} and blank explicit prefixes trigger the fallback to
     * {@link MsspIndexResolver#resolveIndexPattern(String)}. Null is tested
     * separately in property 11-A; this provider covers the non-null blank case.
     */
    @Provide
    Arbitrary<String> blankStrings() {
        return Arbitraries.oneOf(
                Arbitraries.just(""),
                Arbitraries.strings()
                        .withChars(" \t\n\r")
                        .ofMinLength(1)
                        .ofMaxLength(10)
        );
    }

    /**
     * Produces non-null, non-blank strings suitable for use as explicit tenant
     * prefix arguments. These are not constrained to the {@code client_prefix}
     * regex because {@link MsspIndexResolver#resolveIndexPatternForPrefix} trims
     * the value and uses it verbatim without regex validation — only the DB
     * {@code CHECK} constraint enforces the format.
     *
     * <p>The strings include leading/trailing whitespace variants to exercise the
     * {@code explicitPrefix.trim()} call inside the resolver.
     */
    @Provide
    Arbitrary<String> nonBlankExplicitPrefixes() {
        // Core non-blank strings: printable ASCII, length 1–20, at least one
        // non-whitespace character.
        Arbitrary<String> core = Arbitraries.strings()
                .withCharRange(' ', '~')   // printable ASCII
                .ofMinLength(1)
                .ofMaxLength(20)
                .filter(s -> !s.isBlank());

        // Variants with surrounding whitespace to exercise trim().
        Arbitrary<String> paddedLeft = core.map(s -> "  " + s);
        Arbitrary<String> paddedRight = core.map(s -> s + "  ");
        Arbitrary<String> paddedBoth = core.map(s -> " " + s + " ");

        return Arbitraries.oneOf(core, paddedLeft, paddedRight, paddedBoth);
    }
}
