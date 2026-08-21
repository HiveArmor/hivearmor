package com.hivearmor.service.search;

import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

/**
 * HiveArmor NL-Search input sanitiser.
 *
 * <p>Stateless {@link Service} that removes prompt-injection artefacts, HTML tags,
 * dangerous control characters, and jailbreak delimiter lines from raw user input
 * before it is forwarded to the downstream LLM. Implements the 7-step pipeline
 * defined in Sprint 11 design section DM-5.</p>
 *
 * <p>Postconditions of {@link #sanitize(String)}:</p>
 * <ul>
 *   <li>Result is non-null.</li>
 *   <li>Result length is less than or equal to 500 characters.</li>
 *   <li>Every character {@code c} in the result satisfies {@code c >= 0x20}
 *       or is one of {@code \t} (0x09) or {@code \n} (0x0A).</li>
 *   <li>The lowercased result contains none of the ten DM-5 InjectionPatterns.</li>
 *   <li>No line in the result begins with {@code ###}.</li>
 *   <li>The method is deterministic and idempotent:
 *       {@code sanitize(sanitize(x)).equals(sanitize(x))}.</li>
 * </ul>
 *
 * <p>This service holds no mutable state and performs no logging. Callers are
 * responsible for any audit trail associated with sanitisation failures.</p>
 */
@Service
public class NlSearchInputSanitizer {

    /**
     * Maximum length of the sanitised output. Enforced by step 7 (truncation).
     */
    private static final int MAX_LENGTH = 500;

    /**
     * Bounded HTML tag pattern. The length bound (up to 200 non-{@code >}
     * characters between angle brackets) prevents ReDoS on adversarial input.
     */
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]{0,200}>");

    /**
     * Safety bound on the step-3 fixed-point loop. Every iteration strictly
     * removes at least one tag (or halts), so this cap protects against
     * pathological inputs while comfortably exceeding realistic nesting depth.
     */
    private static final int HTML_TAG_MAX_ITERATIONS = 20;

    /**
     * Matches lines that begin with {@code ###}. Multi-line mode lets {@code ^}
     * and {@code $} anchor at line boundaries within the input.
     */
    private static final Pattern HASH_LINE = Pattern.compile("(?m)^###.*$");

    /**
     * Runs of two or more whitespace characters (spaces, tabs, newlines, etc.).
     */
    private static final Pattern WHITESPACE_RUN = Pattern.compile("\\s{2,}");

    /**
     * DM-5 InjectionPatterns — the ten literal prompt-injection markers that
     * must be stripped case-insensitively regardless of surrounding text.
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
     * Sanitises raw user input intended for the NL-Search LLM.
     *
     * <p>Pipeline (each step consumes the output of the previous step):</p>
     * <ol>
     *   <li>Null / blank guard — return {@code ""} for null or blank input.</li>
     *   <li>Strip control characters — remove all {@code c < 0x20} except
     *       {@code \t} (0x09) and {@code \n} (0x0A); also explicitly remove
     *       the null byte {@code \0} (0x00).</li>
     *   <li>Strip HTML tags — {@code <[^>]{0,200}>} to a single space; loops
     *       to a fixed point to preserve idempotence (Requirement 5.8) when
     *       nested or overlapping tag patterns straddle the 200-char bound.</li>
     *   <li>Strip DM-5 InjectionPatterns case-insensitively — each pattern is
     *       compiled into a regex by {@link #injectionRegex(String)}: the
     *       literal text is wrapped with {@link Pattern#quote(String)} and
     *       every interior space is rewritten to match one or more whitespace
     *       characters ({@code \s+}) rather than a single literal space, so
     *       adversarial whitespace padding between words (tabs, newlines,
     *       repeated spaces) cannot bypass the strip. The compiled regex
     *       replaces every match with a single space.</li>
     *   <li>Strip {@code ###}-prefixed lines — {@code (?m)^###.*$} to empty.</li>
     *   <li>Collapse whitespace — {@code \s{2,}} to a single space, then
     *       {@link String#trim()}.</li>
     *   <li>Truncate — if the result exceeds {@value #MAX_LENGTH} characters,
     *       return {@code result.substring(0, MAX_LENGTH)}.</li>
     * </ol>
     *
     * @param userInput raw user-supplied text; may be null
     * @return a non-null sanitised string of length at most {@value #MAX_LENGTH}
     */
    public String sanitize(String userInput) {
        // Step 1 — Null / blank guard.
        if (userInput == null || userInput.isBlank()) {
            return "";
        }

        // Step 2 — Strip control characters (c < 0x20) except \t and \n; also drop \0.
        StringBuilder cleaned = new StringBuilder(userInput.length());
        for (int i = 0; i < userInput.length(); i++) {
            char c = userInput.charAt(i);
            if (c == '\0') {
                continue;
            }
            if (c < 0x20 && c != '\t' && c != '\n') {
                continue;
            }
            cleaned.append(c);
        }
        String result = cleaned.toString();

        // Step 3 — Strip HTML tags (bounded to prevent ReDoS). Loop to fixed
        // point so nested tag patterns are fully stripped in a single
        // sanitise() call, preserving idempotence (Requirement 5.8). A single
        // left-to-right pass can leave an outer tag pair whose interior
        // exceeded the 200 non-'>' bound only because it enclosed a shorter
        // strippable tag; once the inner tag is removed, the outer pair
        // becomes strippable on the next iteration.
        String previous;
        int iteration = 0;
        do {
            previous = result;
            result = HTML_TAG.matcher(result).replaceAll(" ");
            iteration++;
        } while (!result.equals(previous) && iteration < HTML_TAG_MAX_ITERATIONS);

        // Step 4 — Strip DM-5 InjectionPatterns case-insensitively. Inner
        // whitespace within a multi-word pattern matches \s+ (any run of
        // whitespace), not a literal single space, so adversarial padding
        // such as "ignore  previous\tinstructions" is still stripped before
        // step 6 has a chance to collapse it back into the canonical form.
        for (String pattern : INJECTION_PATTERNS) {
            result = result.replaceAll("(?i)" + injectionRegex(pattern), " ");
        }

        // Step 5 — Strip ###-prefixed lines.
        result = HASH_LINE.matcher(result).replaceAll("");

        // Step 6 — Collapse whitespace runs and trim.
        result = WHITESPACE_RUN.matcher(result).replaceAll(" ").trim();

        // Step 7 — Truncate to MAX_LENGTH.
        if (result.length() > MAX_LENGTH) {
            result = result.substring(0, MAX_LENGTH);
        }

        return result;
    }

    /**
     * Builds the step-4 regex fragment used to match a single DM-5
     * InjectionPattern case-insensitively.
     *
     * <p>{@link Pattern#quote(String)} wraps its argument in
     * {@code \Q...\E}, causing every character inside to be matched
     * literally. To allow interior whitespace within a multi-word pattern
     * (for example {@code "ignore previous instructions"}) to match any run
     * of whitespace in the input, we close the quoted section around each
     * literal space and splice in {@code \s+} before reopening it. Every
     * non-space character remains inside the quoted region and is therefore
     * still matched literally, so regex metacharacters that appear inside a
     * pattern (such as {@code [}, {@code ]}, {@code <}, {@code |}, or
     * {@code *}) are handled safely.</p>
     *
     * <p>Example: for {@code "ignore previous instructions"} this returns
     * {@code "\Qignore\E\s+\Qprevious\E\s+\Qinstructions\E"}, which matches
     * {@code "ignore previous instructions"} as well as
     * {@code "ignore\t\t  previous\ninstructions"}.</p>
     *
     * @param pattern the literal InjectionPattern from {@link #INJECTION_PATTERNS}
     * @return a regex fragment ready to be concatenated after {@code "(?i)"}
     */
    private static String injectionRegex(String pattern) {
        return Pattern.quote(pattern).replace(" ", "\\E\\s+\\Q");
    }
}
