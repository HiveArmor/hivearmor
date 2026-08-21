package com.hivearmor.service.search;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.util.Random;

import org.junit.jupiter.api.Test;

/**
 * Property-based test — HiveArmor NL-Search DSL validator exception message
 * confidentiality (Sprint 11 PBT-6).
 *
 * <p><b>Property 17 (design.md) — Validator confidentiality.</b>
 * For every DSL string {@code d} that causes
 * {@link NlSearchDslValidator#validate(String)} to throw
 * {@link NlSearchSecurityException}, the caught exception's message must be a
 * short, non-empty category label that does not embed the raw DSL body. Concretely:</p>
 * <ul>
 *   <li>{@code e.getMessage().length() >= 1} — never empty,</li>
 *   <li>{@code e.getMessage().length() <= 100} — bounded so error responses,
 *       audit logs, and LLM prompt logs cannot inflate,</li>
 *   <li>for DSL bodies longer than 20 characters,
 *       {@code !e.getMessage().contains(d)} — the raw DSL is never echoed
 *       verbatim inside the message. Short DSLs like {@code "[]"} or
 *       {@code "\"x\""} are excluded from the containment check because a
 *       short category label may legitimately share such short substrings by
 *       coincidence.</li>
 * </ul>
 *
 * <p><b>Validates: Requirements 5.15</b> — validator exception messages carry
 * only a short category label, never the DSL body, so a hostile LLM cannot
 * cause the DSL it produced (which may itself contain injected content) to
 * be reflected back through error responses or the audit trail.</p>
 *
 * <p>jqwik is not a dependency of the HiveArmor backend (verified against
 * {@code backend/pom.xml}), and Sprint 11 tasks.md explicitly defers the
 * library choice to execution time. This test therefore uses a hand-rolled
 * JUnit 5 loop driven by a seeded {@link Random}, mirroring the layout of the
 * companion sanitiser PBT classes ({@link NlSearchSanitizerIdempotencePBT},
 * {@link NlSearchSanitizerInjectionPBT}, {@link NlSearchSanitizerLengthPBT})
 * for consistency across the PBT suite.</p>
 *
 * <p>Each of the 300 iterations picks one of five rejection buckets so every
 * failure branch of the validator is exercised:</p>
 * <ol start="0">
 *   <li><b>Length</b> — random JSON-ish garbage longer than 10 000 chars,</li>
 *   <li><b>Not JSON</b> — random ASCII garbage that fails to parse,</li>
 *   <li><b>JSON but not an object</b> — arrays, primitives (numbers,
 *       booleans, strings, null),</li>
 *   <li><b>JSON object without {@code "query"} or {@code "aggs"}</b> —
 *       well-formed objects containing unrelated keys,</li>
 *   <li><b>JSON object with {@code "query"} embedding a blocklisted
 *       substring</b> — well-formed objects that trigger the DM-5 Blocklist
 *       check.</li>
 * </ol>
 *
 * <p>The seed ({@code 42L}) is fixed so any counterexample observed by CI is
 * deterministically reproducible on a developer's machine.</p>
 */
class NlSearchDslValidatorMessagePBT {

    /** tasks.md 5.11: loop of at least 200 iterations (recommend 300). */
    private static final int ITERATIONS = 300;

    private static final long SEED = 42L;

    /** Contract from PBT-6: category labels are bounded to 100 characters. */
    private static final int MAX_MESSAGE_LENGTH = 100;

    /**
     * tasks.md 5.11: for very short DSLs a short category label may share
     * their bytes by coincidence (e.g. the label "root must be a JSON object"
     * incidentally contains "object"). Only assert non-containment when the
     * DSL is unambiguously long enough that the label cannot legitimately
     * carry it.
     */
    private static final int DSL_LENGTH_FOR_CONTAINMENT_CHECK = 20;

    /**
     * DM-5 Blocklist — the ten case-sensitive substrings that trigger the
     * validator's blocklist branch. Kept private so bucket 4 can plant them
     * without importing the production array.
     */
    private static final String[] BLOCKLIST = {
        "_cluster",
        "_cat",
        "_nodes",
        "_snapshot",
        "_shrink",
        "_split",
        "delete_by_query",
        "update_by_query",
        "reindex",
        "script"
    };

    private final NlSearchDslValidator validator = new NlSearchDslValidator();

    /**
     * Property: for every DSL string {@code d} generated from the five
     * rejection buckets, {@code validator.validate(d)} throws
     * {@link NlSearchSecurityException} whose message is non-empty, at most
     * 100 characters, and (for long DSLs) does not contain {@code d} verbatim.
     *
     * <p>Failure messages include both the offending DSL body (escaped and
     * truncated for readability) and the exception message so a counter-
     * example can be triaged without re-running the seed.</p>
     */
    @Test
    void validate_exceptionMessageIsShortAndConfidential() {
        Random rng = new Random(SEED);

        for (int i = 0; i < ITERATIONS; i++) {
            String dsl = generateRejectableDsl(rng, i);
            int iteration = i;

            try {
                validator.validate(dsl);
                // The generators are designed to always produce a rejectable
                // DSL. If we get here, either a bucket has a bug or the
                // validator has regressed — either is a genuine failure.
                fail("validate() did not throw for iteration=" + iteration
                    + " (seed=" + SEED + ").\n"
                    + "  dsl.length() = " + dsl.length() + "\n"
                    + "  dsl          = " + escape(dsl));
            } catch (NlSearchSecurityException e) {
                String message = e.getMessage();

                assertTrue(
                    message != null && message.length() >= 1,
                    () -> "Exception message must be non-empty (iteration="
                        + iteration + ", seed=" + SEED + ").\n"
                        + "  dsl     = " + escape(dsl) + "\n"
                        + "  message = " + (message == null ? "null"
                            : "\"" + message + "\" (length " + message.length() + ")")
                );

                int messageLength = message.length();
                assertTrue(
                    messageLength <= MAX_MESSAGE_LENGTH,
                    () -> "Exception message exceeded length bound (iteration="
                        + iteration + ", seed=" + SEED + ").\n"
                        + "  dsl            = " + escape(dsl) + "\n"
                        + "  message        = \"" + message + "\"\n"
                        + "  message.length = " + messageLength
                        + " (max " + MAX_MESSAGE_LENGTH + ")"
                );

                // Confidentiality: the raw DSL body must not be echoed
                // verbatim inside the exception message. Only enforced for
                // DSLs long enough that a coincidental substring match with
                // a short category label is not plausible (see field javadoc
                // on DSL_LENGTH_FOR_CONTAINMENT_CHECK).
                if (dsl != null && dsl.length() > DSL_LENGTH_FOR_CONTAINMENT_CHECK) {
                    assertFalse(
                        message.contains(dsl),
                        () -> "Exception message leaked full DSL body (iteration="
                            + iteration + ", seed=" + SEED + ").\n"
                            + "  dsl     = " + escape(dsl) + "\n"
                            + "  message = \"" + message + "\""
                    );
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    // Generators — five rejection buckets, one uniformly chosen per iteration
    // ---------------------------------------------------------------------

    /**
     * Picks a rejection bucket uniformly at random and produces a DSL string
     * guaranteed to be rejected by {@link NlSearchDslValidator}.
     */
    private String generateRejectableDsl(Random rng, int iteration) {
        int bucket = rng.nextInt(5);
        switch (bucket) {
            case 0:
                return generateOverLengthJsonGarbage(rng);
            case 1:
                return generateNonJsonAsciiGarbage(rng);
            case 2:
                return generateJsonButNotAnObject(rng);
            case 3:
                return generateJsonObjectMissingRequiredKeys(rng);
            case 4:
                return generateJsonObjectWithBlocklistedSubstring(rng);
            default:
                // Unreachable — nextInt(5) is bounded to [0, 5).
                throw new IllegalStateException("Unexpected bucket " + bucket
                    + " at iteration " + iteration);
        }
    }

    /**
     * Bucket 0 — Length branch. Produces a JSON-ish string longer than
     * {@code 10 000} characters. It intentionally starts with {@code '{'}
     * and includes {@code "query"} tokens so that even if the length check
     * were re-ordered after the JSON parse, the validator would still reject
     * on length rather than on some earlier branch. Length range
     * {@code 10 001..14 999}.
     */
    private String generateOverLengthJsonGarbage(Random rng) {
        int length = 10_001 + rng.nextInt(5_000);
        StringBuilder sb = new StringBuilder(length);
        sb.append("{\"query\":{\"match_all\":{}},\"filler\":\"");
        // Fill with printable ASCII (excluding '"' and '\\' so the payload
        // stays a syntactically valid JSON string interior).
        while (sb.length() < length - 2) {
            char c = (char) (0x20 + rng.nextInt(0x7F - 0x20));
            if (c == '"' || c == '\\') {
                c = 'x';
            }
            sb.append(c);
        }
        sb.append("\"}");
        return sb.toString();
    }

    /**
     * Bucket 1 — JSON parse branch. Produces a random ASCII string of length
     * {@code 21..500} whose first non-whitespace character is guaranteed not
     * to open a valid JSON value ({@code {}, [], "}, digits, minus,
     * {@code t/f/n} for {@code true/false/null}) and is not a Gson-lenient
     * comment introducer ({@code #}, {@code //}, {@code /*}). Everything else
     * fails {@code JsonParser.parseString}. The length lower bound of 21
     * ensures the containment check runs on this bucket.
     */
    private String generateNonJsonAsciiGarbage(Random rng) {
        int length = 21 + rng.nextInt(480);
        // Anchor with a byte that cannot open a JSON value or a Gson-lenient
        // comment. In particular, '#' and '/' are excluded because Gson's
        // lenient reader treats them as comment introducers.
        char[] anchors = {'@', '%', '&', '*', '?', '=', '!', ';', ':',
                          '(', ')', '~', '^', '|', '\\', '<', '>'};
        StringBuilder sb = new StringBuilder(length);
        sb.append(anchors[rng.nextInt(anchors.length)]);
        for (int i = 1; i < length; i++) {
            char c = (char) (0x20 + rng.nextInt(0x7F - 0x20));
            sb.append(c);
        }
        return sb.toString();
    }

    /**
     * Bucket 2 — Root-must-be-object branch. Emits JSON that parses cleanly
     * but whose root is an array, number, string, boolean, or null.
     */
    private String generateJsonButNotAnObject(Random rng) {
        int variant = rng.nextInt(6);
        switch (variant) {
            case 0:
                return "[]";
            case 1: {
                // Non-trivial JSON array long enough to trigger the
                // containment assertion.
                StringBuilder sb = new StringBuilder(64);
                sb.append('[');
                int elements = 5 + rng.nextInt(20);
                for (int i = 0; i < elements; i++) {
                    if (i > 0) sb.append(',');
                    sb.append(rng.nextInt(1_000_000));
                }
                sb.append(']');
                return sb.toString();
            }
            case 2:
                return Long.toString(rng.nextLong());
            case 3:
                return rng.nextBoolean() ? "true" : "false";
            case 4:
                return "null";
            default: {
                // A JSON string primitive (root element is not an object).
                StringBuilder sb = new StringBuilder();
                sb.append('"');
                int length = 20 + rng.nextInt(60);
                for (int i = 0; i < length; i++) {
                    char c = (char) (0x20 + rng.nextInt(0x7F - 0x20));
                    if (c == '"' || c == '\\') {
                        c = 'x';
                    }
                    sb.append(c);
                }
                sb.append('"');
                return sb.toString();
            }
        }
    }

    /**
     * Bucket 3 — Missing required top-level key. Emits a well-formed JSON
     * object whose keys deliberately exclude both {@code "query"} and
     * {@code "aggs"}. The object is padded with several unrelated fields so
     * its serialised length exceeds the 20-character containment threshold.
     */
    private String generateJsonObjectMissingRequiredKeys(Random rng) {
        String[] safeKeys = {"filter", "size", "from", "sort", "fields",
                             "highlight", "explain", "version", "_source", "timeout"};
        StringBuilder sb = new StringBuilder(128);
        sb.append('{');
        int fields = 2 + rng.nextInt(4);
        for (int i = 0; i < fields; i++) {
            if (i > 0) sb.append(',');
            String key = safeKeys[rng.nextInt(safeKeys.length)] + "_" + i;
            sb.append('"').append(key).append("\":");
            // Alternate value shapes to widen coverage.
            int shape = rng.nextInt(3);
            if (shape == 0) {
                sb.append(rng.nextInt(1_000));
            } else if (shape == 1) {
                sb.append('"').append("value_").append(rng.nextInt(1_000)).append('"');
            } else {
                sb.append("[1,2,3,").append(rng.nextInt(1_000)).append(']');
            }
        }
        sb.append('}');
        return sb.toString();
    }

    /**
     * Bucket 4 — Blocklist branch. Emits a well-formed JSON object with a
     * {@code "query"} key so the required-key check passes, then embeds a
     * random Blocklist substring somewhere in the body. The embedding location
     * (key name, string value, nested object) is randomised so the raw
     * {@code contains(term)} check is exercised across shapes.
     */
    private String generateJsonObjectWithBlocklistedSubstring(Random rng) {
        String term = BLOCKLIST[rng.nextInt(BLOCKLIST.length)];
        int shape = rng.nextInt(4);
        StringBuilder sb = new StringBuilder(160);
        sb.append("{\"query\":{\"match_all\":{}}");
        switch (shape) {
            case 0:
                // Blocklist substring appears verbatim as a top-level key.
                sb.append(",\"").append(term).append("\":true");
                break;
            case 1:
                // Blocklist substring appears verbatim inside a string value.
                sb.append(",\"note\":\"contains-").append(term).append("-marker\"");
                break;
            case 2:
                // Blocklist substring appears as a nested key.
                sb.append(",\"outer\":{\"").append(term).append("\":42}");
                break;
            default:
                // Blocklist substring appears as a nested string value with
                // random filler around it.
                sb.append(",\"outer\":{\"payload\":\"prefix_")
                  .append(term)
                  .append("_suffix_")
                  .append(rng.nextInt(1_000_000))
                  .append("\"}");
        }
        sb.append('}');
        return sb.toString();
    }

    // ---------------------------------------------------------------------
    // Failure-message helpers
    // ---------------------------------------------------------------------

    /**
     * Escapes control characters, backslashes, and non-ASCII code points as
     * {@code \\uXXXX} and truncates long strings so the failing example printed
     * by JUnit is unambiguous and readable. Mirrors the escape helper used by
     * the companion sanitiser PBT classes.
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
