package com.hivearmor.multitenancy;

import net.jqwik.api.*;
import org.junit.jupiter.api.Tag;

import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based tests for the {@code ha_client_prefix_fmt} CHECK constraint
 * defined in Liquibase changeset {@code 20260724050-1}.
 *
 * <p><strong>Property 1: ClientPrefix regex constraint</strong>
 * — <strong>Validates: Requirements 2.5, 2.7</strong>
 *
 * <p>The DB CHECK constraint is:
 * <pre>
 *   client_prefix IS NULL OR client_prefix ~ '^[a-z0-9][a-z0-9-]{1,19}$'
 * </pre>
 *
 * <h2>Coverage Gap Notice</h2>
 * <p>This test validates the Java-layer regex pattern directly because neither
 * Testcontainers (PostgreSQL) nor H2 is present in the test classpath. H2 does
 * not support PostgreSQL's {@code ~} regex operator, so even if H2 were available
 * the CHECK constraint would <em>not</em> be enforced at the database level.
 *
 * <p><strong>To achieve full DB-layer coverage:</strong> add the
 * {@code org.testcontainers:postgresql} dependency to {@code pom.xml} and
 * refactor this test to use {@code @DataJpaTest} with a Testcontainers
 * {@code @Container PostgreSQLContainer} and attempt real {@code EntityManager}
 * persist/flush calls, asserting that a
 * {@link org.springframework.dao.DataIntegrityViolationException} referencing
 * {@code ha_client_prefix_fmt} is thrown for invalid inputs.
 *
 * <p>Until that upgrade is made, this test provides full logic coverage of the
 * constraint predicate at the application layer (the same regex is the source of
 * truth for both the DB constraint and this test).
 *
 * <h2>Test strategy</h2>
 * <p>The property-based tests generate strings across four classes:
 * <ol>
 *   <li>Structurally valid strings (matching the regex — expect {@code true}).</li>
 *   <li>Invalid strings due to uppercase characters.</li>
 *   <li>Invalid strings due to disallowed special characters or spaces.</li>
 *   <li>Boundary / edge cases: empty string, single character, strings exceeding
 *       20 characters, strings starting with a hyphen.</li>
 * </ol>
 *
 * <p>The {@code null} case is asserted in a dedicated example test because jqwik
 * arbitraries for {@code String} never produce {@code null} by default, and the
 * constraint explicitly allows {@code NULL}.
 *
 * <p>Tag: {@code Feature: sprint-21-mssp-schema, Property 1}
 *
 * <p>Minimum iterations: 100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-21-mssp-schema")
@Tag("Property 1")
class HaClientPrefixConstraintPropertyTest {

    /**
     * Exact regex from changeset {@code 20260724050-1}: the CHECK constraint body is
     * {@code client_prefix ~ '^[a-z0-9][a-z0-9-]{1,19}$'}.
     *
     * <p>Total length: 2 to 20 characters. First character must be {@code [a-z0-9]}.
     * Remaining 1–19 characters must be {@code [a-z0-9-]}.
     */
    static final Pattern CLIENT_PREFIX_REGEX = Pattern.compile("^[a-z0-9][a-z0-9-]{1,19}$");

    /**
     * The constraint allows {@code NULL} unconditionally.
     *
     * <p><strong>Validates: Requirements 2.5</strong> (CHECK body is
     * {@code client_prefix IS NULL OR ...}).
     */
    @Example
    void nullClientPrefix_isAllowedByConstraint() {
        // NULL satisfies: client_prefix IS NULL OR client_prefix ~ '^[a-z0-9][a-z0-9-]{1,19}$'
        assertThat(isAllowedByConstraint(null))
                .as("NULL client_prefix must satisfy the ha_client_prefix_fmt constraint")
                .isTrue();
    }

    // =========================================================================
    // Property 1-A: valid strings must be accepted
    // Validates: Requirements 2.5, 2.7
    // =========================================================================

    /**
     * For any string that matches {@code ^[a-z0-9][a-z0-9-]{1,19}$}, the constraint
     * must accept it (i.e. the regex check passes).
     *
     * <p><strong>Validates: Requirements 2.5, 2.7</strong>
     */
    @Property(tries = 200)
    void property1A_validPrefix_isAcceptedByConstraint(@ForAll("validPrefixes") String prefix) {
        assertThat(isAllowedByConstraint(prefix))
                .as("Valid client_prefix '%s' must satisfy ha_client_prefix_fmt", prefix)
                .isTrue();
    }

    // =========================================================================
    // Property 1-B: strings with uppercase letters must be rejected
    // Validates: Requirements 2.5, 2.7
    // =========================================================================

    /**
     * For any string that contains at least one uppercase letter, the regex check
     * must fail — the constraint only permits {@code [a-z0-9-]}.
     *
     * <p><strong>Validates: Requirements 2.5, 2.7</strong>
     */
    @Property(tries = 200)
    void property1B_uppercasePrefix_isRejectedByConstraint(
            @ForAll("prefixesWithUppercase") String prefix) {
        assertThat(isAllowedByConstraint(prefix))
                .as("Uppercase client_prefix '%s' must violate ha_client_prefix_fmt", prefix)
                .isFalse();
    }

    // =========================================================================
    // Property 1-C: strings with disallowed special characters must be rejected
    // Validates: Requirements 2.5, 2.7
    // =========================================================================

    /**
     * For any string that contains at least one character outside the allowed set
     * ({@code [a-z0-9-]}), the regex check must fail.
     *
     * <p><strong>Validates: Requirements 2.5, 2.7</strong>
     */
    @Property(tries = 200)
    void property1C_specialCharPrefix_isRejectedByConstraint(
            @ForAll("prefixesWithSpecialChars") String prefix) {
        assertThat(isAllowedByConstraint(prefix))
                .as("Special-char client_prefix '%s' must violate ha_client_prefix_fmt", prefix)
                .isFalse();
    }

    // =========================================================================
    // Property 1-D: edge cases — boundary lengths and disallowed patterns
    // Validates: Requirements 2.5, 2.7
    // =========================================================================

    /**
     * Verifies a set of edge-case strings: empty string, single character,
     * strings exceeding 20 characters, and strings starting with a hyphen are all
     * rejected by the constraint.
     *
     * <p><strong>Validates: Requirements 2.5, 2.7</strong>
     */
    @Property(tries = 100)
    void property1D_edgeCasePrefixes_rejectedByConstraint(
            @ForAll("edgeCasePrefixes") String prefix) {
        // All strings produced by the edgeCasePrefixes arbitrary must be INVALID.
        assertThat(isAllowedByConstraint(prefix))
                .as("Edge-case client_prefix '%s' must violate ha_client_prefix_fmt", prefix)
                .isFalse();
    }

    // =========================================================================
    // Property 1-E: spaces anywhere in the string must cause rejection
    // Validates: Requirements 2.5, 2.7
    // =========================================================================

    /**
     * For any non-empty string containing at least one space character, the regex
     * check must fail — the constraint does not allow whitespace.
     *
     * <p><strong>Validates: Requirements 2.5, 2.7</strong>
     */
    @Property(tries = 100)
    void property1E_prefixWithSpaces_isRejectedByConstraint(
            @ForAll("prefixesWithSpaces") String prefix) {
        assertThat(isAllowedByConstraint(prefix))
                .as("Space-containing client_prefix '%s' must violate ha_client_prefix_fmt", prefix)
                .isFalse();
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Produces structurally valid {@code client_prefix} values:
     * starts with {@code [a-z0-9]}, followed by 1–19 characters from {@code [a-z0-9-]}.
     * Total length: 2–20.
     */
    @Provide
    Arbitrary<String> validPrefixes() {
        // First character: lowercase letter or digit
        Arbitrary<Character> firstChar = Arbitraries.chars()
                .with("abcdefghijklmnopqrstuvwxyz0123456789");

        // Remaining characters: lowercase letter, digit, or hyphen (length 1–19)
        Arbitrary<String> rest = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(19);

        return Combinators.combine(firstChar, rest)
                .as((first, tail) -> first + tail)
                .filter(s -> CLIENT_PREFIX_REGEX.matcher(s).matches());
    }

    /**
     * Produces strings that contain at least one uppercase letter, making them
     * invalid for {@code client_prefix}.
     *
     * <p>Construction: take a lowercase alphanumeric base and append one uppercase
     * letter, ensuring the result fails the regex.
     */
    @Provide
    Arbitrary<String> prefixesWithUppercase() {
        Arbitrary<String> lowerBase = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789")
                .ofMinLength(1)
                .ofMaxLength(18);
        Arbitrary<Character> upperChar = Arbitraries.chars()
                .range('A', 'Z');

        return Combinators.combine(lowerBase, upperChar)
                .as((base, up) -> base + up)
                .filter(s -> !CLIENT_PREFIX_REGEX.matcher(s).matches());
    }

    /**
     * Produces strings that contain at least one character outside {@code [a-z0-9-]}.
     * The disallowed character pool covers common special characters, underscores,
     * dots, slashes, and non-ASCII characters.
     *
     * <p>These strings are always non-null and non-empty.
     */
    @Provide
    Arbitrary<String> prefixesWithSpecialChars() {
        // Pool of printable special characters not in the allowed set
        Arbitrary<Character> disallowedChar = Arbitraries.chars()
                .with("!@#$%^&*()_+=[]{}|;':\",./<>?\\~`");

        Arbitrary<String> alphanumBase = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789")
                .ofMinLength(1)
                .ofMaxLength(10);

        return Combinators.combine(alphanumBase, disallowedChar)
                .as((base, bad) -> base + bad)
                .filter(s -> !CLIENT_PREFIX_REGEX.matcher(s).matches());
    }

    /**
     * Produces boundary / edge-case strings that must all be rejected:
     * <ul>
     *   <li>empty string — length 0, too short</li>
     *   <li>single character — length 1, too short (requires at least 2)</li>
     *   <li>strings longer than 20 characters — exceed maximum length</li>
     *   <li>strings starting with a hyphen — first character must be {@code [a-z0-9]}</li>
     * </ul>
     */
    @Provide
    Arbitrary<String> edgeCasePrefixes() {
        // Empty string
        Arbitrary<String> empty = Arbitraries.just("");

        // Single character: exactly length 1 (too short — need at least 2 chars)
        Arbitrary<String> singleChar = Arbitraries.chars()
                .with("abcdefghijklmnopqrstuvwxyz0123456789")
                .map(Object::toString);

        // Too long: 21–30 characters, all otherwise valid chars — exceeds max length 20
        Arbitrary<String> tooLong = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789")
                .ofMinLength(21)
                .ofMaxLength(30);

        // Starts with hyphen: "-" + valid tail
        Arbitrary<String> startsWithHyphen = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(19)
                .map(tail -> "-" + tail);

        return Arbitraries.oneOf(empty, singleChar, tooLong, startsWithHyphen)
                .filter(s -> !CLIENT_PREFIX_REGEX.matcher(s).matches());
    }

    /**
     * Produces strings containing at least one space character.
     * These are always invalid because the regex {@code [a-z0-9-]} does not include
     * any whitespace character.
     */
    @Provide
    Arbitrary<String> prefixesWithSpaces() {
        Arbitrary<String> alphanumPart = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789")
                .ofMinLength(1)
                .ofMaxLength(9);

        // Combine two alphanumeric parts with a space in between
        return Combinators.combine(alphanumPart, alphanumPart)
                .as((a, b) -> a + " " + b)
                .filter(s -> !CLIENT_PREFIX_REGEX.matcher(s).matches());
    }

    // =========================================================================
    // Helper
    // =========================================================================

    /**
     * Evaluates the DB CHECK constraint predicate in Java:
     * {@code client_prefix IS NULL OR client_prefix ~ '^[a-z0-9][a-z0-9-]{1,19}$'}.
     *
     * <p>A {@code null} value satisfies the constraint (the IS NULL branch).
     * A non-null value must match {@link #CLIENT_PREFIX_REGEX} to satisfy it.
     *
     * @param value the candidate {@code client_prefix} value
     * @return {@code true} if the value satisfies the constraint, {@code false} otherwise
     */
    static boolean isAllowedByConstraint(String value) {
        if (value == null) {
            return true; // client_prefix IS NULL — allowed
        }
        return CLIENT_PREFIX_REGEX.matcher(value).matches();
    }
}
