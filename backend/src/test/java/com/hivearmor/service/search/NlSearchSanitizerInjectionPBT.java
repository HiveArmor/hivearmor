package com.hivearmor.service.search;

import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.Random;

import org.junit.jupiter.api.Test;

/**
 * Property-based test — HiveArmor NL-Search sanitiser injection resilience
 * (Sprint 11 PBT-3).
 *
 * <p><b>Property 13 (design.md) — Sanitiser injection pattern strip.</b>
 * For every input string {@code s}, the lower-cased output of
 * {@link NlSearchInputSanitizer#sanitize(String)} must NOT contain any of the
 * ten DM-5 InjectionPatterns:</p>
 * <ul>
 *   <li>{@code ignore previous instructions}</li>
 *   <li>{@code ignore all instructions}</li>
 *   <li>{@code system:}</li>
 *   <li>{@code <|im_start|>}</li>
 *   <li>{@code <|im_end|>}</li>
 *   <li>{@code <|endoftext|>}</li>
 *   <li>{@code [INST]}</li>
 *   <li>{@code [/INST]}</li>
 *   <li>{@code <<SYS>>}</li>
 *   <li>{@code <</SYS>>}</li>
 * </ul>
 *
 * <p><b>Validates: Requirements 5.5</b> — the sanitiser strips every DM-5
 * InjectionPattern regardless of surrounding text, case, or adversarial
 * wrapping.</p>
 *
 * <p>jqwik is not a dependency of the HiveArmor backend (verified against
 * {@code backend/pom.xml}), and Sprint 11 tasks.md explicitly defers the
 * library choice to execution time. This test therefore uses a hand-rolled
 * JUnit 5 loop driven by a seeded {@link Random}, mirroring the layout of the
 * companion PBT class {@link NlSearchSanitizerIdempotencePBT}.</p>
 *
 * <p>Each of the 250 iterations picks one of the ten InjectionPatterns and
 * embeds it in a randomly-generated envelope covering:</p>
 * <ol>
 *   <li>short and long benign text prefixes/suffixes,</li>
 *   <li>random position within the envelope,</li>
 *   <li>random ASCII case-mixing of the pattern,</li>
 *   <li>optional HTML tag wrapping (adjacent to or splitting the pattern),</li>
 *   <li>surrounding control characters (below 0x20),</li>
 *   <li>internal splitting with whitespace, HTML tags, and control chars.</li>
 * </ol>
 *
 * <p>The seed ({@code 42L}) is fixed so any counterexample observed by CI is
 * deterministically reproducible on a developer's machine.</p>
 */
class NlSearchSanitizerInjectionPBT {

    private static final int ITERATIONS = 250;

    private static final long SEED = 42L;

    /**
     * DM-5 InjectionPatterns — the ten literal prompt-injection markers the
     * sanitiser is required to strip. Kept private to this test so the
     * generators can splice them into inputs without importing the production
     * array.
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

    /**
     * Benign filler tokens used to build short and long envelopes around the
     * injected pattern. Chosen from realistic NL-Search vocabulary so a
     * failure log line reads naturally.
     */
    private static final String[] FILLER_TOKENS = {
        "show", "alerts", "list", "events", "top", "hosts", "from", "yesterday",
        "critical", "severity", "windows", "linux", "endpoint", "count", "by",
        "source", "ip", "user", "login", "failed", "detected", "rule", "10"
    };

    /**
     * HTML tag fragments used to wrap or split patterns. Sanitiser step 3
     * replaces each {@code <...>} tag with a single space.
     */
    private static final String[] HTML_TAGS = {
        "<b>", "</b>", "<i>", "</i>", "<span>", "</span>",
        "<a href='x'>", "</a>", "<div>", "</div>",
        "<script>", "</script>", "<x>", "<y/>"
    };

    private final NlSearchInputSanitizer sanitizer = new NlSearchInputSanitizer();

    /**
     * Property: for every generated input {@code s} embedding a pattern from
     * DM-5, {@code sanitize(s).toLowerCase()} contains none of the ten
     * InjectionPatterns (compared case-insensitively).
     *
     * <p>Each iteration checks the primary embedded pattern first (so the
     * failure message names the pattern the test actually tried to plant),
     * then loops over all ten patterns to catch any accidental reconstitution
     * (for example, whitespace collapse in step 6 producing a canonicalised
     * pattern that step 4 did not match).</p>
     */
    @Test
    void sanitize_stripsAllInjectionPatterns() {
        Random rng = new Random(SEED);

        for (int i = 0; i < ITERATIONS; i++) {
            String embedded = INJECTION_PATTERNS[rng.nextInt(INJECTION_PATTERNS.length)];
            String input = generateAdversarialInput(embedded, rng);

            String output = sanitizer.sanitize(input);
            String lowered = output.toLowerCase();

            // Primary property — the embedded pattern must be gone.
            final String primary = embedded;
            final String primaryLower = primary.toLowerCase();
            final int iteration = i;
            assertFalse(
                lowered.contains(primaryLower),
                () -> failureMessage(iteration, primary, input, output)
            );

            // Secondary property — no OTHER InjectionPattern may have been
            // synthesised as a side-effect of sanitisation.
            for (String pattern : INJECTION_PATTERNS) {
                final String candidate = pattern;
                final String candidateLower = candidate.toLowerCase();
                assertFalse(
                    lowered.contains(candidateLower),
                    () -> failureMessage(iteration, candidate, input, output)
                );
            }
        }
    }

    // ---------------------------------------------------------------------
    // Generators
    // ---------------------------------------------------------------------

    /**
     * Builds an adversarial input string that embeds {@code pattern} inside a
     * randomised benign envelope, applies random case-mixing, and optionally
     * splits or wraps the pattern with HTML tags and control characters.
     */
    private String generateAdversarialInput(String pattern, Random rng) {
        String cased = maybeMixCase(pattern, rng);
        String decorated = decoratePattern(cased, rng);

        String prefix = generateFiller(rng);
        String suffix = generateFiller(rng);

        // Randomly wrap the decorated pattern with control characters,
        // exercising step-2 (strip < 0x20) reconstitution paths.
        String wrapped = maybeWrapWithControlChars(decorated, rng);

        // Random position choice — pattern at start, middle, or end of the
        // envelope. Coverage: "pattern embedded at various positions".
        int position = rng.nextInt(3);
        switch (position) {
            case 0:
                return wrapped + " " + prefix + " " + suffix;
            case 1:
                return prefix + " " + wrapped + " " + suffix;
            default:
                return prefix + " " + suffix + " " + wrapped;
        }
    }

    /**
     * Applies zero or more of the following mutations, chosen independently
     * so a single call can combine them:
     * <ul>
     *   <li>insert HTML tags adjacent to the pattern,</li>
     *   <li>insert HTML tags <em>inside</em> the pattern (splitting it),</li>
     *   <li>insert extra whitespace inside the pattern between letters,</li>
     *   <li>insert control characters (0x01..0x08, 0x0B..0x1F) inside the
     *       pattern.</li>
     * </ul>
     */
    private String decoratePattern(String pattern, Random rng) {
        String working = pattern;

        // 40% — wrap in HTML tags.
        if (rng.nextInt(10) < 4) {
            String open = HTML_TAGS[rng.nextInt(HTML_TAGS.length)];
            String close = HTML_TAGS[rng.nextInt(HTML_TAGS.length)];
            working = open + working + close;
        }

        // 30% — splice HTML tag inside the pattern.
        if (working.length() >= 2 && rng.nextInt(10) < 3) {
            int cut = 1 + rng.nextInt(working.length() - 1);
            String tag = HTML_TAGS[rng.nextInt(HTML_TAGS.length)];
            working = working.substring(0, cut) + tag + working.substring(cut);
        }

        // 30% — insert extra whitespace inside the pattern.
        if (working.length() >= 2 && rng.nextInt(10) < 3) {
            int cut = 1 + rng.nextInt(working.length() - 1);
            String ws = randomWhitespaceRun(rng);
            working = working.substring(0, cut) + ws + working.substring(cut);
        }

        // 30% — splice a stripped control character inside the pattern.
        // These are removed by step 2, potentially reconstituting the pattern
        // for step 4 to catch.
        if (working.length() >= 2 && rng.nextInt(10) < 3) {
            int cut = 1 + rng.nextInt(working.length() - 1);
            char ctrl = randomStrippedControlChar(rng);
            working = working.substring(0, cut) + ctrl + working.substring(cut);
        }

        return working;
    }

    /**
     * Randomly toggles each ASCII letter's case. Non-letters pass through.
     * Half the time returns the pattern unchanged so pure-case matches are
     * also exercised.
     */
    private String maybeMixCase(String s, Random rng) {
        if (rng.nextBoolean()) {
            return s;
        }
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (rng.nextBoolean()) {
                sb.append(Character.toUpperCase(c));
            } else {
                sb.append(Character.toLowerCase(c));
            }
        }
        return sb.toString();
    }

    /**
     * With 40% probability wraps the argument in one or two control
     * characters on each side. Exercises the "surrounded by control chars"
     * coverage requirement.
     */
    private String maybeWrapWithControlChars(String s, Random rng) {
        if (rng.nextInt(10) >= 4) {
            return s;
        }
        StringBuilder sb = new StringBuilder(s.length() + 4);
        int leading = 1 + rng.nextInt(2);
        for (int i = 0; i < leading; i++) {
            sb.append(randomStrippedControlChar(rng));
        }
        sb.append(s);
        int trailing = 1 + rng.nextInt(2);
        for (int i = 0; i < trailing; i++) {
            sb.append(randomStrippedControlChar(rng));
        }
        return sb.toString();
    }

    /**
     * Generates a run of 1..4 whitespace characters drawn from
     * {@code ' ' \\t \\n}. Runs of two or more are collapsed by sanitiser
     * step 6 and can therefore canonicalise a padded pattern back to its
     * literal form.
     */
    private String randomWhitespaceRun(Random rng) {
        char[] palette = {' ', ' ', ' ', '\t', '\n'};
        int len = 1 + rng.nextInt(4);
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) {
            sb.append(palette[rng.nextInt(palette.length)]);
        }
        return sb.toString();
    }

    /**
     * Returns a random control character below 0x20 that is stripped by
     * sanitiser step 2 — excluding {@code \\t} (0x09), {@code \\n} (0x0A),
     * and {@code \\0} (which is also stripped but handled separately in the
     * generator so exercising 0x01..0x08 and 0x0B..0x1F).
     */
    private char randomStrippedControlChar(Random rng) {
        // Cover 0x01..0x1F, skipping \t (0x09) and \n (0x0A).
        int c;
        do {
            c = 1 + rng.nextInt(0x1F);
        } while (c == 0x09 || c == 0x0A);
        return (char) c;
    }

    /**
     * Generates 0..12 filler tokens joined by spaces. Zero tokens yields the
     * empty string so patterns can also appear with minimal surrounding
     * context.
     */
    private String generateFiller(Random rng) {
        int count = rng.nextInt(13);
        if (count == 0) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < count; i++) {
            if (i > 0) {
                sb.append(' ');
            }
            sb.append(FILLER_TOKENS[rng.nextInt(FILLER_TOKENS.length)]);
        }
        return sb.toString();
    }

    // ---------------------------------------------------------------------
    // Failure reporting
    // ---------------------------------------------------------------------

    private String failureMessage(int iteration, String pattern, String input, String output) {
        return "Sanitiser failed to strip InjectionPattern (seed=" + SEED
            + ", iteration=" + iteration + ").\n"
            + "  pattern = " + escape(pattern) + "\n"
            + "  input   = " + escape(input) + "\n"
            + "  output  = " + escape(output);
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
