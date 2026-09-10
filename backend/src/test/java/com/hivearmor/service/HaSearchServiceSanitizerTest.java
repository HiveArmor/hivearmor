package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import net.jqwik.api.*;
import net.jqwik.api.constraints.StringLength;
import net.jqwik.api.lifecycle.BeforeTry;
import org.assertj.core.api.SoftAssertions;

import static org.mockito.Mockito.mock;

/**
 * Property 1: NL sanitizer strips control chars, collapses whitespace, and truncates to 500.
 *
 * <p><strong>Validates: Requirements 2.4, 3.3</strong>
 *
 * <p>For any arbitrarily generated {@link String} input, the output of
 * {@link HaSearchService#sanitizeNlQueryForTesting} must satisfy all three conditions:
 * <ol>
 *   <li>No control characters outside {@code \t} (0x09) and {@code \n} (0x0A) —
 *       i.e. no code points in [0x00, 0x1F] except 0x09 and 0x0A, and no 0x7F (DEL).</li>
 *   <li>No consecutive whitespace — no two adjacent characters both matching {@code \s}.</li>
 *   <li>Length is ≤ 500.</li>
 * </ol>
 *
 * <p>The service is constructed with Mockito mocks for {@link HaLlmService} and
 * {@link MsspIndexResolver}, and a real {@link ObjectMapper}. The private
 * {@code sanitizeNlQuery} method is exercised via the package-private
 * {@link HaSearchService#sanitizeNlQueryForTesting} accessor, avoiding reflection.
 *
 * <p>Tests live in {@code src/main/java/} per the project convention (no {@code src/test/} dir).
 */
@Label("Feature: sprint-26-nl-search, Property 1: NL sanitizer strips control chars, collapses whitespace, truncates to 500")
class HaSearchServiceSanitizerTest {

    private HaSearchService service;

    /** Construct a fresh service instance before each property try. */
    @BeforeTry
    void setUp() {
        service = new HaSearchService(
            mock(HaLlmService.class),
            new ObjectMapper(),
            mock(MsspIndexResolver.class)
        );
    }

    // =========================================================================
    // Property 1 — three assertions on arbitrary string inputs
    // =========================================================================

    /**
     * For any arbitrarily generated {@link String}:
     * <ol>
     *   <li>The sanitized output contains no forbidden control characters.</li>
     *   <li>The sanitized output has no consecutive whitespace.</li>
     *   <li>The sanitized output length is ≤ 500.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 2.4, 3.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 1: sanitized output has no control chars outside \\t/\\n, no consecutive whitespace, length ≤ 500")
    void property1_sanitizer_stripsControlChars_collapsesWhitespace_truncatesTo500(
            @ForAll String rawQuery) {

        String sanitized = service.sanitizeNlQueryForTesting(rawQuery);

        SoftAssertions softly = new SoftAssertions();

        // Assertion 1: no forbidden control characters
        int forbiddenAt = indexOfForbiddenControlChar(sanitized);
        softly.assertThat(forbiddenAt)
            .as("Sanitized output must not contain forbidden control characters. " +
                "Found 0x%02X at index %d.\n  rawQuery=%s\n  sanitized=%s",
                forbiddenAt >= 0 ? (int) sanitized.charAt(forbiddenAt) : 0,
                forbiddenAt,
                escape(rawQuery),
                escape(sanitized))
            .isEqualTo(-1);

        // Assertion 2: no consecutive whitespace
        int consecutiveAt = indexOfConsecutiveWhitespace(sanitized);
        softly.assertThat(consecutiveAt)
            .as("Sanitized output must not contain consecutive whitespace. " +
                "Found adjacent whitespace at index %d.\n  rawQuery=%s\n  sanitized=%s",
                consecutiveAt,
                escape(rawQuery),
                escape(sanitized))
            .isEqualTo(-1);

        // Assertion 3: length ≤ 500
        softly.assertThat(sanitized.length())
            .as("Sanitized output length must be ≤ 500.\n  rawQuery=%s\n  sanitized=%s",
                escape(rawQuery),
                escape(sanitized))
            .isLessThanOrEqualTo(500);

        softly.assertAll();
    }

    // =========================================================================
    // Targeted property — long inputs are always truncated
    // =========================================================================

    /**
     * For inputs longer than 500 characters the sanitized output must be ≤ 500.
     *
     * <p><strong>Validates: Requirements 2.4</strong>
     */
    @Property(tries = 100)
    @Label("Property 1b: long inputs (>500 chars) are always truncated to ≤ 500")
    void property1b_longInput_alwaysTruncatedTo500(
            @ForAll @StringLength(min = 501, max = 2000) String rawQuery) {

        String sanitized = service.sanitizeNlQueryForTesting(rawQuery);

        SoftAssertions softly = new SoftAssertions();

        softly.assertThat(sanitized.length())
            .as("Sanitized output length must be ≤ 500 for input of length %d.\n  rawQuery=%s",
                rawQuery.length(), escape(rawQuery))
            .isLessThanOrEqualTo(500);

        softly.assertAll();
    }

    // =========================================================================
    // Example — null input guard
    // =========================================================================

    /**
     * Null input must produce an empty string and never throw.
     *
     * <p><strong>Validates: Requirements 3.3</strong>
     */
    @Example
    @Label("Example: null input returns empty string")
    void example_nullInput_returnsEmpty() {
        String result = service.sanitizeNlQueryForTesting(null);

        org.assertj.core.api.Assertions.assertThat(result)
            .as("Null input should produce an empty string")
            .isEmpty();
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Returns the index of the first forbidden control character in {@code s},
     * or {@code -1} if none is found.
     *
     * <p>Forbidden means: code point ≤ 0x1F <em>and</em> not 0x09 (tab) and not
     * 0x0A (newline), or code point == 0x7F (DEL).
     */
    private static int indexOfForbiddenControlChar(String s) {
        for (int i = 0; i < s.length(); i++) {
            int cp = s.charAt(i);
            if ((cp <= 0x1F && cp != 0x09 && cp != 0x0A) || cp == 0x7F) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Returns the index of the first character that forms a consecutive whitespace
     * pair with its successor, or {@code -1} if no such pair exists.
     *
     * <p>Two adjacent characters form a forbidden consecutive whitespace pair when
     * both match {@link Character#isWhitespace(char)}.
     */
    private static int indexOfConsecutiveWhitespace(String s) {
        for (int i = 0; i < s.length() - 1; i++) {
            if (Character.isWhitespace(s.charAt(i)) && Character.isWhitespace(s.charAt(i + 1))) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Returns a printable representation of {@code s} for failure messages,
     * escaping non-printable characters as {@code \xNN} and truncating at 120 chars.
     */
    private static String escape(String s) {
        if (s == null) return "<null>";
        StringBuilder sb = new StringBuilder();
        int limit = Math.min(s.length(), 120);
        for (int i = 0; i < limit; i++) {
            char c = s.charAt(i);
            if (c < 0x20 || c == 0x7F) {
                sb.append(String.format("\\x%02X", (int) c));
            } else {
                sb.append(c);
            }
        }
        if (s.length() > 120) {
            sb.append("...[").append(s.length()).append(" chars]");
        }
        return sb.toString();
    }
}
