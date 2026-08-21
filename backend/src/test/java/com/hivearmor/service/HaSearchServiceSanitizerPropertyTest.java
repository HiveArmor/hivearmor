package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Property 1: NL sanitizer strips control characters, collapses whitespace,
 * and truncates to 500.
 *
 * <p><strong>Property 1: NL sanitizer strips control chars, collapses whitespace,
 * and truncates to 500</strong><br>
 * For any arbitrary {@link String} input, the output of
 * {@code HaSearchService.sanitizeNlQuery} must satisfy all three invariants:
 * <ol>
 *   <li>No control characters in the ranges {@code [0x00–0x08]}, {@code [0x0B–0x1F]},
 *       or {@code 0x7F} survive (tabs {@code 0x09} and newlines {@code 0x0A} are
 *       permitted).</li>
 *   <li>No two consecutive whitespace characters appear (the output never contains
 *       {@code \s\s}).</li>
 *   <li>{@code result.length() <= 500}.</li>
 * </ol>
 *
 * <p><strong>Validates: Requirements 2.4, 3.3</strong>
 */
@Label("Feature: sprint-26-nl-search, Property 1: NL sanitizer strips control chars, collapses whitespace, and truncates to 500")
class HaSearchServiceSanitizerPropertyTest {

    private HaSearchService service;

    @BeforeTry
    void setUp() {
        HaLlmService llmService = mock(HaLlmService.class);
        MsspIndexResolver msspIndexResolver = mock(MsspIndexResolver.class);
        ObjectMapper objectMapper = new ObjectMapper();
        service = new HaSearchService(llmService, objectMapper, msspIndexResolver);
    }

    // =========================================================================
    // Property 1-A: No forbidden control characters survive sanitization
    // =========================================================================

    /**
     * For any arbitrary string, the sanitized output must not contain any ASCII
     * control character in the ranges {@code [0x00–0x08]}, {@code [0x0B–0x1F]},
     * or the DEL character {@code 0x7F}.
     *
     * <p>Tab ({@code 0x09}) and newline ({@code 0x0A}) are permitted to pass through,
     * but because they are whitespace, consecutive occurrences will be collapsed to a
     * single space by the whitespace-collapse step.
     *
     * <p><strong>Validates: Requirements 2.4, 3.3</strong>
     */
    @Property(tries = 200)
    @Label("Property 1-A: no forbidden control characters survive sanitization")
    void property1a_noForbiddenControlChars(@ForAll String rawInput) {
        String result = service.sanitizeNlQueryForTesting(rawInput);

        for (int i = 0; i < result.length(); i++) {
            int cp = result.codePointAt(i);
            boolean isForbiddenControl =
                (cp <= 0x1F && cp != 0x09 && cp != 0x0A) || cp == 0x7F;
            assertThat(isForbiddenControl)
                .as("Char at index %d (codepoint 0x%02X) must not be a forbidden control character in output of sanitizeNlQuery(\"%s\")",
                    i, cp, abbrev(rawInput))
                .isFalse();
        }
    }

    // =========================================================================
    // Property 1-B: No consecutive whitespace survives sanitization
    // =========================================================================

    /**
     * For any arbitrary string, the sanitized output must not contain two or more
     * consecutive whitespace characters (i.e., it must not match {@code \s\s}).
     *
     * <p><strong>Validates: Requirements 2.4, 3.3</strong>
     */
    @Property(tries = 200)
    @Label("Property 1-B: no consecutive whitespace in sanitized output")
    void property1b_noConsecutiveWhitespace(@ForAll String rawInput) {
        String result = service.sanitizeNlQueryForTesting(rawInput);

        assertThat(result)
            .as("Sanitized output of \"%s\" must not contain consecutive whitespace", abbrev(rawInput))
            .doesNotMatch(".*\\s\\s.*");
    }

    // =========================================================================
    // Property 1-C: Result length is at most 500 characters
    // =========================================================================

    /**
     * For any arbitrary string, the sanitized output must be at most 500 characters
     * long (the {@code QUERY_MAX_LENGTH} constant defined in {@code HaSearchService}).
     *
     * <p><strong>Validates: Requirements 2.4, 3.3</strong>
     */
    @Property(tries = 200)
    @Label("Property 1-C: result length is at most 500")
    void property1c_lengthAtMost500(@ForAll String rawInput) {
        String result = service.sanitizeNlQueryForTesting(rawInput);

        assertThat(result.length())
            .as("Sanitized output of a %d-char input must have length <= 500", rawInput.length())
            .isLessThanOrEqualTo(500);
    }

    // =========================================================================
    // Property 1-D: All three invariants hold simultaneously
    // =========================================================================

    /**
     * Combined property: for any arbitrary string the sanitized output satisfies
     * all three invariants simultaneously (no forbidden control chars, no consecutive
     * whitespace, length ≤ 500).
     *
     * <p>This is a composite assertion that confirms the three sub-properties are not
     * accidentally interfering with each other.
     *
     * <p><strong>Validates: Requirements 2.4, 3.3</strong>
     */
    @Property(tries = 200)
    @Label("Property 1-D: all three invariants hold simultaneously")
    void property1d_allInvariantsHoldSimultaneously(@ForAll String rawInput) {
        String result = service.sanitizeNlQueryForTesting(rawInput);

        // Invariant 1: no forbidden control characters
        for (int i = 0; i < result.length(); i++) {
            int cp = result.codePointAt(i);
            boolean isForbiddenControl =
                (cp <= 0x1F && cp != 0x09 && cp != 0x0A) || cp == 0x7F;
            assertThat(isForbiddenControl)
                .as("Char at index %d (codepoint 0x%02X) must not be a forbidden control character",
                    i, cp)
                .isFalse();
        }

        // Invariant 2: no consecutive whitespace
        assertThat(result)
            .as("Sanitized output must not contain consecutive whitespace")
            .doesNotMatch(".*\\s\\s.*");

        // Invariant 3: length <= 500
        assertThat(result.length())
            .as("Sanitized output must have length <= 500")
            .isLessThanOrEqualTo(500);
    }

    // =========================================================================
    // Property 1-E: Null input always returns empty string (edge case)
    // =========================================================================

    /**
     * The sanitizer must treat a {@code null} input as an empty string rather than
     * throwing a {@code NullPointerException}. This single-value edge-case property
     * confirms the null guard is present.
     *
     * <p><strong>Validates: Requirements 3.3</strong>
     */
    @Property(tries = 20)
    @Label("Property 1-E: null input returns empty string")
    void property1e_nullInputReturnsEmpty() {
        String result = service.sanitizeNlQueryForTesting(null);

        assertThat(result)
            .as("sanitizeNlQuery(null) must return an empty string, not throw")
            .isNotNull()
            .isEmpty();
    }

    // =========================================================================
    // Property 1-F: High-density control-character strings are fully stripped
    // =========================================================================

    /**
     * For strings composed entirely of forbidden control characters (generated by
     * the {@code controlCharStrings} provider), the sanitized output must be empty
     * or consist only of permitted characters.
     *
     * <p><strong>Validates: Requirements 2.4, 3.3</strong>
     */
    @Property(tries = 200)
    @Label("Property 1-F: strings of forbidden control chars are fully stripped")
    void property1f_controlCharStringsFullyStripped(
            @ForAll("controlCharStrings") String controlInput) {
        String result = service.sanitizeNlQueryForTesting(controlInput);

        // After stripping all forbidden control chars, only whitespace may remain
        // (tabs 0x09 and newlines 0x0A), but these get collapsed to a single space
        // and trimmed — so the result is either empty or a single space that gets trimmed.
        assertThat(result.trim())
            .as("Input composed only of forbidden control chars must sanitize to empty (after trim)")
            .isEmpty();
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates strings composed entirely of forbidden ASCII control characters
     * (code points in {@code [0x00–0x08] ∪ [0x0B–0x1F] ∪ {0x7F}}), so that
     * Property 1-F can verify they are completely stripped.
     */
    @Provide
    Arbitrary<String> controlCharStrings() {
        // Forbidden codepoints: 0x00–0x08, 0x0B–0x1F, 0x7F
        // Expressed as individual chars joined into a string of length 1–30
        Arbitrary<Character> range1 = Arbitraries.chars().range('\u0000', '\u0008');
        Arbitrary<Character> range2 = Arbitraries.chars().range('\u000B', '\u001F');
        Arbitrary<Character> delChar = Arbitraries.just('\u007F');
        Arbitrary<Character> forbiddenChar = Arbitraries.oneOf(range1, range2, delChar);
        return forbiddenChar.list().ofMinSize(1).ofMaxSize(30)
            .map(chars -> {
                StringBuilder sb = new StringBuilder(chars.size());
                for (char c : chars) sb.append(c);
                return sb.toString();
            });
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Abbreviates a string for display in assertion messages to avoid huge output. */
    private static String abbrev(String s) {
        if (s == null) return "<null>";
        return s.length() > 40 ? s.substring(0, 40) + "…" : s;
    }
}
