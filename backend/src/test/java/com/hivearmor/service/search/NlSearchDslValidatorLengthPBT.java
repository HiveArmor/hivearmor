package com.hivearmor.service.search;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Random;

import org.junit.jupiter.api.Test;

/**
 * Property-based test — HiveArmor NL-Search DSL validator length bound (Sprint 11 PBT-5).
 *
 * <p><b>Property 16 (design.md) — Validator soundness (length branch).</b>
 * For every string {@code d} with {@code d.length() > 10000},
 * {@link NlSearchDslValidator#validate(String)} must throw
 * {@link NlSearchSecurityException}. The length check is the first of the
 * four DM-5 validation gates and short-circuits before JSON parsing,
 * required-key inspection, or blocklist scanning — so any input above
 * the 10 000-character cap is rejected regardless of its structural
 * validity or content.</p>
 *
 * <p><b>Validates: Requirements 5.10</b> — the LLM-generated OpenSearch DSL
 * is rejected before it can reach the OpenSearch cluster when its length
 * exceeds 10 000 characters, protecting the search subsystem against
 * denial-of-service via oversized queries.</p>
 *
 * <p>jqwik is not a dependency of the HiveArmor backend (verified against
 * {@code backend/pom.xml}), and Sprint 11 tasks.md explicitly defers the
 * library choice to execution time. This test therefore uses a hand-rolled
 * JUnit 5 loop driven by a seeded {@link Random}, mirroring
 * {@link NlSearchSanitizerLengthPBT} for consistency across the PBT suite.</p>
 *
 * <p>The random loop draws each iteration's DSL from four buckets so the
 * property is exercised against a broad content distribution:</p>
 * <ol start="0">
 *   <li>syntactically valid JSON padded with ASCII filler,</li>
 *   <li>syntactically valid JSON padded with unicode filler,</li>
 *   <li>random ASCII garbage that never parses as JSON,</li>
 *   <li>random unicode garbage.</li>
 * </ol>
 * Every iteration produces a string whose length lies in
 * {@code [10001, 50000]}, i.e. strictly above {@code MAX_DSL_LENGTH}.
 * Because the length check is DM-5 gate&nbsp;1, all four buckets must
 * throw regardless of downstream JSON, key-presence, or blocklist state.
 *
 * <p>Two deterministic boundary cases are covered in addition to the
 * randomised loop:</p>
 * <ul>
 *   <li>Length exactly {@code 10001} must throw.</li>
 *   <li>Length exactly {@code 10000} — a syntactically valid DSL — must
 *       not throw, confirming the length gate is inclusive-below and
 *       exclusive-above (i.e. uses strict {@code >}).</li>
 * </ul>
 *
 * <p>The seed ({@code 42L}) is fixed so any counterexample observed by CI
 * is deterministically reproducible on a developer's machine.</p>
 */
class NlSearchDslValidatorLengthPBT {

    /**
     * Maximum accepted DSL length asserted by the validator. Mirrors the
     * private {@code MAX_DSL_LENGTH} constant in {@link NlSearchDslValidator}.
     * Duplicated here rather than exposed publicly to keep the production
     * API narrow.
     */
    private static final int MAX_DSL_LENGTH = 10000;

    /**
     * Number of randomised iterations. 300 comfortably exceeds the tasks.md
     * lower bound of 200 while keeping the test well under one second.
     */
    private static final int ITERATIONS = 300;

    private static final long SEED = 42L;

    /** Upper bound (inclusive) of generated oversize DSL lengths. */
    private static final int MAX_GENERATED_LENGTH = 50_000;

    private final NlSearchDslValidator validator = new NlSearchDslValidator();

    /**
     * Property: for every string {@code d} with {@code d.length() > 10000},
     * {@code validator.validate(d)} throws {@link NlSearchSecurityException}.
     *
     * <p>Also asserts the two boundary cases at exactly {@code 10001}
     * (must throw) and exactly {@code 10000} with a syntactically valid
     * DSL (must not throw).</p>
     */
    @Test
    void validate_rejectsOversizeDsl() {
        Random rng = new Random(SEED);

        // ------------------------------------------------------------------
        // Randomised property loop — 300 iterations, four content buckets.
        // ------------------------------------------------------------------
        for (int i = 0; i < ITERATIONS; i++) {
            String dsl = generateOversizeDsl(rng, i);

            int iteration = i;
            int len = dsl.length();

            // Sanity check on the generator itself — every input MUST have
            // length > MAX_DSL_LENGTH; otherwise the property is being
            // tested against the wrong domain.
            assertTrue(
                len > MAX_DSL_LENGTH,
                () -> "Generator invariant broken (seed=" + SEED
                    + ", iteration=" + iteration + "): expected length > "
                    + MAX_DSL_LENGTH + ", got " + len
            );

            assertThrows(
                NlSearchSecurityException.class,
                () -> validator.validate(dsl),
                () -> "Expected NlSearchSecurityException for oversize DSL "
                    + "(seed=" + SEED + ", iteration=" + iteration
                    + ", length=" + len + ", head=" + escape(head(dsl, 80)) + ")"
            );
        }

        // ------------------------------------------------------------------
        // Boundary 1 — length exactly MAX_DSL_LENGTH + 1 must throw.
        // ------------------------------------------------------------------
        String justOver = "a".repeat(MAX_DSL_LENGTH + 1);
        int justOverLen = justOver.length();
        assertEquals(
            MAX_DSL_LENGTH + 1, justOverLen,
            () -> "Boundary generator invariant broken: expected length "
                + (MAX_DSL_LENGTH + 1) + ", got " + justOverLen
        );
        assertThrows(
            NlSearchSecurityException.class,
            () -> validator.validate(justOver),
            () -> "Expected NlSearchSecurityException for boundary DSL of length "
                + justOverLen + " (one over MAX_DSL_LENGTH=" + MAX_DSL_LENGTH + ")"
        );

        // ------------------------------------------------------------------
        // Boundary 2 — length exactly MAX_DSL_LENGTH must NOT throw for a
        // syntactically valid DSL. This confirms the length gate uses
        // strict `>` (exclusive) rather than `>=` (inclusive) at the cap.
        // ------------------------------------------------------------------
        String validAtCap = buildValidJsonDslOfLength(MAX_DSL_LENGTH);
        int validAtCapLen = validAtCap.length();
        assertEquals(
            MAX_DSL_LENGTH, validAtCapLen,
            () -> "Boundary generator invariant broken: expected length "
                + MAX_DSL_LENGTH + ", got " + validAtCapLen
        );
        assertDoesNotThrow(
            () -> validator.validate(validAtCap),
            () -> "Expected valid DSL of length " + validAtCapLen
                + " to pass validation (length gate must be exclusive at MAX_DSL_LENGTH="
                + MAX_DSL_LENGTH + ")"
        );
    }

    // ---------------------------------------------------------------------
    // Generators
    // ---------------------------------------------------------------------

    /**
     * Picks a bucket uniformly at random and generates an oversize DSL
     * (length &gt; {@link #MAX_DSL_LENGTH}) from that bucket.
     */
    private String generateOversizeDsl(Random rng, int iteration) {
        // Draw a length in [MAX_DSL_LENGTH + 1, MAX_GENERATED_LENGTH].
        int span = MAX_GENERATED_LENGTH - MAX_DSL_LENGTH;
        int length = MAX_DSL_LENGTH + 1 + rng.nextInt(span);

        int bucket = rng.nextInt(4);
        switch (bucket) {
            case 0:
                return buildValidJsonDslOfLength(length);
            case 1:
                return buildValidJsonDslWithUnicodePadding(length, rng);
            case 2:
                return generateRandomAscii(length, rng);
            case 3:
                return generateRandomUnicode(length, rng);
            default:
                // Unreachable — nextInt(4) is bounded to [0, 4).
                throw new IllegalStateException("Unexpected bucket " + bucket
                    + " at iteration " + iteration);
        }
    }

    /**
     * Builds a syntactically valid DSL string of exactly {@code length}
     * characters whose content contains no DM-5 Blocklist terms.
     *
     * <p>Shape: {@code {"query":"aaa...aaa"}} — an object with the
     * required {@code "query"} key whose value is an ASCII padding string.
     * The validator accepts this shape (length check, JSON parse, has
     * {@code "query"}, no blocklist term) so returning it at exactly the
     * cap length is a valid negative-control for the length gate.</p>
     *
     * @param length target string length, must be at least the length of
     *     the fixed prefix+suffix ({@code 12} characters).
     */
    private String buildValidJsonDslOfLength(int length) {
        final String prefix = "{\"query\":\"";  // 10 chars
        final String suffix = "\"}";             // 2 chars
        int padLen = length - prefix.length() - suffix.length();
        if (padLen < 0) {
            throw new IllegalArgumentException(
                "length " + length + " is below fixed overhead of "
                    + (prefix.length() + suffix.length())
            );
        }
        StringBuilder sb = new StringBuilder(length);
        sb.append(prefix);
        for (int i = 0; i < padLen; i++) {
            sb.append('a');
        }
        sb.append(suffix);
        return sb.toString();
    }

    /**
     * Builds a syntactically valid DSL of exactly {@code length} characters
     * whose padding contains BMP unicode code points (no supplementary
     * pairs, so char-count equals code-point-count for a stable length).
     * Avoids the ten Blocklist terms and the double-quote / backslash
     * characters that would break the enclosing JSON string.
     */
    private String buildValidJsonDslWithUnicodePadding(int length, Random rng) {
        final String prefix = "{\"query\":\"";
        final String suffix = "\"}";
        int padLen = length - prefix.length() - suffix.length();
        if (padLen < 0) {
            throw new IllegalArgumentException("length too small: " + length);
        }
        StringBuilder sb = new StringBuilder(length);
        sb.append(prefix);
        // BMP code points in a safe range that avoids ASCII controls,
        // the double-quote (0x22), and the backslash (0x5C). Range
        // [0x00A1, 0x024F] gives Latin-1 Supplement + Latin Extended,
        // all of which round-trip as single Java chars.
        for (int i = 0; i < padLen; i++) {
            int cp = 0x00A1 + rng.nextInt(0x024F - 0x00A1);
            sb.append((char) cp);
        }
        sb.append(suffix);
        return sb.toString();
    }

    /**
     * Random printable ASCII garbage of exact {@code length}. Uses
     * {@code 0x20..0x7E} minus control chars. Includes braces, quotes,
     * slashes, digits and letters, so the resulting string will very
     * rarely happen to parse as JSON — but that is irrelevant because
     * the length check fires first.
     */
    private String generateRandomAscii(int length, Random rng) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append((char) (0x20 + rng.nextInt(0x7F - 0x20)));
        }
        return sb.toString();
    }

    /**
     * Random unicode garbage of exact {@code length} (in {@code char}s).
     * Uses only BMP characters (no surrogate pairs) so the returned
     * string's {@code length()} matches the requested value exactly.
     */
    private String generateRandomUnicode(int length, Random rng) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            // Pick from BMP excluding the surrogate range [0xD800, 0xDFFF]
            // to avoid producing malformed UTF-16.
            int cp;
            do {
                cp = rng.nextInt(0xFFFE) + 1; // 0x0001..0xFFFE
            } while (cp >= 0xD800 && cp <= 0xDFFF);
            sb.append((char) cp);
        }
        return sb.toString();
    }

    // ---------------------------------------------------------------------
    // Failure-message helpers
    // ---------------------------------------------------------------------

    /**
     * Returns the first {@code n} characters of {@code s} for inclusion in
     * failure messages, so counterexamples remain readable in CI logs.
     */
    private static String head(String s, int n) {
        if (s == null) {
            return "null";
        }
        return s.length() <= n ? s : s.substring(0, n);
    }

    /**
     * Escapes control characters, backslashes, and non-ASCII code points as
     * {@code \\uXXXX} so the failing example printed by JUnit is unambiguous.
     */
    private static String escape(String s) {
        if (s == null) {
            return "null";
        }
        StringBuilder sb = new StringBuilder(s.length() + 20);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '"':  sb.append("\\\""); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                case '\0': sb.append("\\0");  break;
                default:
                    if (c < 0x20 || c > 0x7E) {
                        sb.append(String.format("\\u%04X", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
        return sb.toString();
    }
}
