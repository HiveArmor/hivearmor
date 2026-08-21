package com.hivearmor.service.search;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Random;

import org.junit.jupiter.api.Test;

/**
 * Property-based test — HiveArmor NL-Search sanitiser idempotence (Sprint 11 PBT-1).
 *
 * <p><b>Property 15 (design.md) — Sanitiser idempotence.</b>
 * For every input string {@code s}, {@link NlSearchInputSanitizer#sanitize(String)}
 * must satisfy {@code sanitize(sanitize(s)).equals(sanitize(s))}. That is, applying
 * the sanitiser a second time to its own output must not further change the string.</p>
 *
 * <p><b>Validates: Requirements 5.8</b> — the sanitiser is deterministic and its
 * output is a fixed point of the sanitisation pipeline.</p>
 *
 * <p>jqwik is not a dependency of the HiveArmor backend (verified against
 * {@code backend/pom.xml}), and Sprint 11 tasks.md explicitly defers the library
 * choice to execution time. This test therefore uses a hand-rolled JUnit 5 loop
 * driven by a seeded {@link Random}, mirroring the package layout of
 * {@link NlSearchSecurityTest}.</p>
 *
 * <p>Inputs are drawn from nine buckets chosen to exercise the broad distribution
 * required by tasks.md:</p>
 * <ol start="0">
 *   <li>empty / whitespace-only strings,</li>
 *   <li>short ASCII fragments,</li>
 *   <li>long ASCII up to 2000 characters,</li>
 *   <li>unicode (emojis, RTL Arabic, combining marks),</li>
 *   <li>strings with embedded null bytes ({@code \0}),</li>
 *   <li>strings with control characters below 0x20,</li>
 *   <li>strings containing HTML tags,</li>
 *   <li>strings with DM-5 InjectionPatterns embedded at random positions,</li>
 *   <li>strings whose lines begin with {@code ###}.</li>
 * </ol>
 *
 * <p>The seed ({@code 42L}) is fixed so any counterexample observed by CI is
 * deterministically reproducible on a developer's machine.</p>
 */
class NlSearchSanitizerIdempotencePBT {

    private static final int ITERATIONS = 500;

    private static final long SEED = 42L;

    /**
     * DM-5 InjectionPatterns — the ten literal prompt-injection markers the
     * sanitiser strips. Kept private to this test so bucket (h) can embed
     * them at random positions without importing the production array.
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
     * Property: {@code sanitize(sanitize(s)).equals(sanitize(s))} for every
     * string {@code s} drawn from the nine-bucket distribution.
     *
     * <p>Also covers the null-input edge case explicitly (outside the loop):
     * {@code sanitize(null)} must return the empty string.</p>
     */
    @Test
    void sanitize_isIdempotent() {
        // Null-input edge case — sanitiser must return "" per DM-5 step 1.
        assertEquals("", sanitizer.sanitize(null), "sanitize(null) must return the empty string");

        Random rng = new Random(SEED);

        for (int i = 0; i < ITERATIONS; i++) {
            String input = generateInput(rng, i);

            String once = sanitizer.sanitize(input);
            String twice = sanitizer.sanitize(once);

            assertEquals(
                once,
                twice,
                () -> "Sanitiser is not idempotent (seed=" + SEED + ").\n"
                    + "  input  = " + escape(input) + "\n"
                    + "  once   = " + escape(once) + "\n"
                    + "  twice  = " + escape(twice)
            );
        }
    }

    // ---------------------------------------------------------------------
    // Generators
    // ---------------------------------------------------------------------

    /**
     * Picks a bucket uniformly at random and generates an example from it.
     * The {@code iteration} parameter is threaded through so a future
     * failure-log line can echo which iteration produced the counterexample.
     */
    private String generateInput(Random rng, int iteration) {
        int bucket = rng.nextInt(9);
        switch (bucket) {
            case 0:
                return generateEmptyOrBlank(rng);
            case 1:
                return generateShortAscii(rng);
            case 2:
                return generateLongAscii(rng);
            case 3:
                return generateUnicode(rng);
            case 4:
                return generateWithNullBytes(rng);
            case 5:
                return generateWithControlChars(rng);
            case 6:
                return generateWithHtmlTags(rng);
            case 7:
                return generateWithInjectionPatterns(rng);
            case 8:
                return generateWithHashLines(rng);
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

    private String generateLongAscii(Random rng) {
        // Up to 2000 characters — well over the sanitiser's 500-char truncation
        // bound so the truncation step is exercised.
        int length = 500 + rng.nextInt(1500);
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append((char) (0x20 + rng.nextInt(0x7F - 0x20)));
        }
        return sb.toString();
    }

    private String generateUnicode(Random rng) {
        // Mix of emojis, RTL Arabic script, and combining marks over a base string.
        String[] fragments = {
            "\uD83D\uDE00",             // 😀 emoji (surrogate pair)
            "\uD83D\uDD25",             // 🔥 emoji
            "\u0645\u0631\u062D\u0628\u0627", // مرحبا (Arabic RTL "hello")
            "a\u0301",                  // a + combining acute accent
            "e\u0308",                  // e + combining diaeresis
            "\u202Ereversed\u202C",     // RLO override wrapping
            "\uD83E\uDD16\uD83D\uDCBB", // 🤖💻
            "普通话",                    // Mandarin CJK
            "café",                     // Latin-1 supplement
            "\u200Bzero\u200Bwidth"     // Zero-width spaces
        };
        int count = 1 + rng.nextInt(6);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < count; i++) {
            sb.append(fragments[rng.nextInt(fragments.length)]);
            if (rng.nextBoolean()) {
                sb.append(' ');
            }
        }
        return sb.toString();
    }

    private String generateWithNullBytes(Random rng) {
        String base = generateShortAscii(rng);
        StringBuilder sb = new StringBuilder(base.length() * 2);
        for (int i = 0; i < base.length(); i++) {
            sb.append(base.charAt(i));
            if (rng.nextInt(5) == 0) {
                sb.append('\0');
            }
        }
        return sb.toString();
    }

    private String generateWithControlChars(Random rng) {
        String base = generateShortAscii(rng);
        StringBuilder sb = new StringBuilder(base.length() * 2);
        for (int i = 0; i < base.length(); i++) {
            sb.append(base.charAt(i));
            if (rng.nextInt(4) == 0) {
                // Random control char in [0x01, 0x1F]. Some (tab 0x09, newline 0x0A)
                // are allow-listed by the sanitiser; the rest must be stripped.
                sb.append((char) (1 + rng.nextInt(0x1F)));
            }
        }
        return sb.toString();
    }

    private String generateWithHtmlTags(Random rng) {
        String[] tags = {
            "<b>", "</b>", "<script>", "</script>",
            "<img src=x onerror=alert(1)>",
            "<a href=\"javascript:evil()\">",
            "<div class=\"pf-v6-c-alert\">",
            "<style>body{color:red}</style>",
            "<svg onload=payload()>",
            "<iframe src='//evil'>",
            "<"                                   // stray opening bracket
        };
        StringBuilder sb = new StringBuilder();
        int count = 1 + rng.nextInt(5);
        for (int i = 0; i < count; i++) {
            sb.append("word").append(i).append(' ');
            sb.append(tags[rng.nextInt(tags.length)]);
            sb.append(" text ");
        }
        return sb.toString();
    }

    private String generateWithInjectionPatterns(Random rng) {
        // Embed one or more InjectionPatterns at random positions between filler
        // fragments. Mixes case where the sanitiser must still strip
        // case-insensitively.
        String[] filler = {"show alerts", "list events", "find hosts", "top 10"};
        StringBuilder sb = new StringBuilder();
        int injections = 1 + rng.nextInt(3);
        for (int i = 0; i < injections; i++) {
            sb.append(filler[rng.nextInt(filler.length)]).append(' ');
            String pattern = INJECTION_PATTERNS[rng.nextInt(INJECTION_PATTERNS.length)];
            sb.append(maybeMixCase(pattern, rng)).append(' ');
        }
        sb.append(filler[rng.nextInt(filler.length)]);
        return sb.toString();
    }

    private String generateWithHashLines(Random rng) {
        StringBuilder sb = new StringBuilder();
        int lines = 1 + rng.nextInt(6);
        for (int i = 0; i < lines; i++) {
            if (rng.nextBoolean()) {
                sb.append("###").append(" jailbreak line ").append(i);
            } else {
                sb.append("normal text line ").append(i);
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
     */
    private static String escape(String s) {
        if (s == null) {
            return "null";
        }
        StringBuilder sb = new StringBuilder(s.length() + 2);
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
