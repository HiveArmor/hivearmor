package com.hivearmor.service.search;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Random;

import org.junit.jupiter.api.Test;

/**
 * Property-based test — HiveArmor NL-Search sanitiser length bound (Sprint 11 PBT-2).
 *
 * <p><b>Property 13 (design.md) — Sanitiser length bound (subset).</b>
 * For every input string {@code s},
 * {@link NlSearchInputSanitizer#sanitize(String)} must satisfy
 * {@code sanitize(s).length() <= 500}. The sanitiser's step-7 truncation caps
 * every output regardless of input size, encoding, or adversarial content.</p>
 *
 * <p><b>Validates: Requirements 5.3</b> — the sanitiser truncates output to at
 * most 500 characters, which bounds the downstream LLM prompt size and prevents
 * denial-of-service via runaway prompts.</p>
 *
 * <p>jqwik is not a dependency of the HiveArmor backend (verified against
 * {@code backend/pom.xml}), and Sprint 11 tasks.md explicitly defers the library
 * choice to execution time. This test therefore uses a hand-rolled JUnit 5 loop
 * driven by a seeded {@link Random}, mirroring
 * {@link NlSearchSanitizerIdempotencePBT} for consistency across the PBT suite.</p>
 *
 * <p>Inputs are drawn from nine buckets chosen to exercise the broad
 * distribution required by tasks.md:</p>
 * <ol start="0">
 *   <li>empty / whitespace-only strings,</li>
 *   <li>short ASCII fragments,</li>
 *   <li>very long ASCII (10 000+ characters),</li>
 *   <li>unicode with combining marks, emojis, and RTL scripts (also very long variants),</li>
 *   <li>strings saturated with embedded null bytes,</li>
 *   <li>strings saturated with control characters below 0x20,</li>
 *   <li>HTML-heavy input,</li>
 *   <li>strings dense with DM-5 InjectionPatterns at random positions,</li>
 *   <li>{@code ###}-prefixed jailbreak lines.</li>
 * </ol>
 *
 * <p>The seed ({@code 42L}) is fixed so any counterexample observed by CI is
 * deterministically reproducible on a developer's machine.</p>
 */
class NlSearchSanitizerLengthPBT {

    /**
     * Maximum length asserted by the property. Mirrors
     * {@link NlSearchInputSanitizer}'s {@code MAX_LENGTH} constant. Duplicated
     * here rather than exposed publicly to keep the production API narrow.
     */
    private static final int MAX_LENGTH = 500;

    /**
     * Number of randomised iterations. 500 comfortably exceeds the tasks.md
     * lower bound of 200 while keeping the test well under one second.
     */
    private static final int ITERATIONS = 500;

    private static final long SEED = 42L;

    /**
     * DM-5 InjectionPatterns — the ten literal prompt-injection markers the
     * sanitiser strips. Kept private to this test so bucket (h) can embed them
     * at random positions without importing the production array.
     */
    private static final String[] INJECTION_PATTERNS = {
        "ignore previous instructions",
        "ignore all instructions",
        "system:",
        "<|im_start|>",
        "<|im_end|>",
        "<|endoftext|>",
        "[INST]",
        "[/INST]",
        "<<SYS>>",
        "<</SYS>>"
    };

    private final NlSearchInputSanitizer sanitizer = new NlSearchInputSanitizer();

    /**
     * Property: {@code sanitize(s).length() <= 500} for every string {@code s}
     * drawn from the nine-bucket distribution.
     *
     * <p>Also covers the null-input edge case explicitly (outside the loop):
     * {@code sanitize(null)} must return a string of length at most 500 (in
     * practice, the empty string).</p>
     */
    @Test
    void sanitize_lengthBoundHolds() {
        // Explicit null-input edge case — sanitiser must return a bounded
        // (in practice, empty) string per DM-5 step 1.
        String nullResult = sanitizer.sanitize(null);
        assertTrue(
            nullResult.length() <= MAX_LENGTH,
            () -> "sanitize(null) exceeded length bound: got " + nullResult.length()
                + " (max " + MAX_LENGTH + ")"
        );

        Random rng = new Random(SEED);

        for (int i = 0; i < ITERATIONS; i++) {
            String input = generateInput(rng, i);

            String result = sanitizer.sanitize(input);

            int inputLength = input.length();
            int resultLength = result.length();
            int iteration = i;
            assertTrue(
                resultLength <= MAX_LENGTH,
                () -> "Sanitiser exceeded length bound (seed=" + SEED
                    + ", iteration=" + iteration + ").\n"
                    + "  input.length()  = " + inputLength + "\n"
                    + "  result.length() = " + resultLength + " (max " + MAX_LENGTH + ")\n"
                    + "  input           = " + escape(input) + "\n"
                    + "  result          = " + escape(result)
            );
        }
    }

    // ---------------------------------------------------------------------
    // Generators
    // ---------------------------------------------------------------------

    /**
     * Picks a bucket uniformly at random and generates an example from it.
     */
    private String generateInput(Random rng, int iteration) {
        int bucket = rng.nextInt(9);
        switch (bucket) {
            case 0:
                return generateEmptyOrBlank(rng);
            case 1:
                return generateShortAscii(rng);
            case 2:
                return generateVeryLongAscii(rng);
            case 3:
                return generateUnicode(rng);
            case 4:
                return generateSaturatedWithNullBytes(rng);
            case 5:
                return generateSaturatedWithControlChars(rng);
            case 6:
                return generateHtmlHeavy(rng);
            case 7:
                return generateInjectionHeavy(rng);
            case 8:
                return generateHashLineHeavy(rng);
            default:
                // Unreachable — nextInt(9) is bounded to [0, 9).
                throw new IllegalStateException("Unexpected bucket " + bucket
                    + " at iteration " + iteration);
        }
    }

    private String generateEmptyOrBlank(Random rng) {
        int variant = rng.nextInt(4);
        switch (variant) {
            case 0: return "";
            case 1: return " ";
            case 2: return "   \t\n  ";
            default: return "\n\n\n";
        }
    }

    private String generateShortAscii(Random rng) {
        int length = 1 + rng.nextInt(50);
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            // Printable ASCII 0x20..0x7E.
            sb.append((char) (0x20 + rng.nextInt(0x7F - 0x20)));
        }
        return sb.toString();
    }

    /**
     * Produces strings well above the 500-char truncation bound so step 7 is
     * heavily exercised. Length range: 10 000 .. 24 999 characters.
     */
    private String generateVeryLongAscii(Random rng) {
        int length = 10_000 + rng.nextInt(15_000);
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append((char) (0x20 + rng.nextInt(0x7F - 0x20)));
        }
        return sb.toString();
    }

    /**
     * Mixes emojis (surrogate pairs), combining marks, RTL Arabic, CJK,
     * zero-width spaces, and bidi override markers. Occasionally produces
     * a very long unicode string (thousands of fragments) so the truncation
     * step is exercised on non-ASCII input as well.
     */
    private String generateUnicode(Random rng) {
        String[] fragments = {
            "\uD83D\uDE00",             // 😀 emoji (surrogate pair)
            "\uD83D\uDD25",             // 🔥 emoji
            "\uD83E\uDD16",             // 🤖 emoji
            "\uD83D\uDCBB",             // 💻 emoji
            "\u0645\u0631\u062D\u0628\u0627", // مرحبا (Arabic RTL "hello")
            "a\u0301",                  // a + combining acute accent
            "e\u0308",                  // e + combining diaeresis
            "o\u0302\u0303",            // o + combining circumflex + tilde
            "\u202Ereversed\u202C",     // RLO override wrapping
            "普通话",                    // Mandarin CJK
            "café",                     // Latin-1 supplement
            "\u200Bzero\u200Bwidth",    // Zero-width spaces
            "\uFEFF"                    // BOM
        };
        // 50% chance to build a very long unicode string (2000+ fragments)
        // exercising truncation on unicode input.
        int count = rng.nextBoolean()
            ? 1 + rng.nextInt(6)
            : 2_000 + rng.nextInt(1_000);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < count; i++) {
            sb.append(fragments[rng.nextInt(fragments.length)]);
            if (rng.nextBoolean()) {
                sb.append(' ');
            }
        }
        return sb.toString();
    }

    /**
     * Very long strings saturated with null bytes to exercise step-2
     * stripping under adversarial density.
     */
    private String generateSaturatedWithNullBytes(Random rng) {
        int length = 1_000 + rng.nextInt(4_000);
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            // ~40% null bytes, ~60% printable ASCII.
            if (rng.nextInt(10) < 4) {
                sb.append('\0');
            } else {
                sb.append((char) (0x20 + rng.nextInt(0x7F - 0x20)));
            }
        }
        return sb.toString();
    }

    /**
     * Very long strings saturated with random control characters in [0x01, 0x1F].
     * Some (0x09 tab, 0x0A newline) are allow-listed by the sanitiser; the rest
     * are stripped. Length is well over the 500-char bound.
     */
    private String generateSaturatedWithControlChars(Random rng) {
        int length = 1_000 + rng.nextInt(4_000);
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            if (rng.nextInt(2) == 0) {
                // Random control char in [0x01, 0x1F].
                sb.append((char) (1 + rng.nextInt(0x1F)));
            } else {
                sb.append((char) (0x20 + rng.nextInt(0x7F - 0x20)));
            }
        }
        return sb.toString();
    }

    /**
     * HTML-heavy input: hundreds of tag fragments concatenated with filler
     * text. Exercises the step-3 bounded-regex loop and truncation on
     * post-strip output.
     */
    private String generateHtmlHeavy(Random rng) {
        String[] tags = {
            "<b>", "</b>", "<script>", "</script>",
            "<img src=x onerror=alert(1)>",
            "<a href=\"javascript:evil()\">",
            "<div class=\"pf-v6-c-alert\">",
            "<style>body{color:red}</style>",
            "<svg onload=payload()>",
            "<iframe src='//evil'>",
            "<span data-role='attacker'>",
            "<meta http-equiv='refresh'>",
            "<"                                   // stray opening bracket
        };
        int count = 200 + rng.nextInt(600);
        StringBuilder sb = new StringBuilder(count * 40);
        for (int i = 0; i < count; i++) {
            sb.append("word").append(i).append(' ');
            sb.append(tags[rng.nextInt(tags.length)]);
            sb.append(" filler ");
        }
        return sb.toString();
    }

    /**
     * InjectionPattern-heavy input: dozens of DM-5 markers embedded at random
     * positions, mixed case, separated by filler. Exercises step-4 stripping
     * on adversarial patterns.
     */
    private String generateInjectionHeavy(Random rng) {
        String[] filler = {"show alerts", "list events", "find hosts", "top 10",
                           "hosts with high severity", "yesterday's incidents"};
        StringBuilder sb = new StringBuilder();
        int injections = 100 + rng.nextInt(300);
        for (int i = 0; i < injections; i++) {
            sb.append(filler[rng.nextInt(filler.length)]).append(' ');
            String pattern = INJECTION_PATTERNS[rng.nextInt(INJECTION_PATTERNS.length)];
            sb.append(maybeMixCase(pattern, rng)).append(' ');
        }
        sb.append(filler[rng.nextInt(filler.length)]);
        return sb.toString();
    }

    /**
     * Long input dominated by {@code ###}-prefixed lines mixed with normal
     * lines. Exercises step-5 line stripping under volume.
     */
    private String generateHashLineHeavy(Random rng) {
        StringBuilder sb = new StringBuilder();
        int lines = 200 + rng.nextInt(600);
        for (int i = 0; i < lines; i++) {
            if (rng.nextInt(3) < 2) {
                sb.append("### jailbreak line ").append(i)
                  .append(" with extra content ").append(rng.nextInt());
            } else {
                sb.append("normal text line ").append(i)
                  .append(" ").append(rng.nextInt());
            }
            sb.append('\n');
        }
        return sb.toString();
    }

    private String maybeMixCase(String s, Random rng) {
        if (rng.nextBoolean()) {
            return s;
        }
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            sb.append(rng.nextBoolean() ? Character.toUpperCase(c) : Character.toLowerCase(c));
        }
        return sb.toString();
    }

    /**
     * Escapes control characters, backslashes, and non-ASCII code points as
     * {@code \\uXXXX} so the failing example printed by JUnit is unambiguous.
     * Truncates long strings to keep failure messages readable.
     */
    private static String escape(String s) {
        if (s == null) {
            return "null";
        }
        final int maxShow = 200;
        StringBuilder sb = new StringBuilder(Math.min(s.length(), maxShow) + 20);
        sb.append('"');
        int limit = Math.min(s.length(), maxShow);
        for (int i = 0; i < limit; i++) {
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
        if (s.length() > maxShow) {
            sb.append(" [truncated, full length=").append(s.length()).append(']');
        }
        return sb.toString();
    }
}
