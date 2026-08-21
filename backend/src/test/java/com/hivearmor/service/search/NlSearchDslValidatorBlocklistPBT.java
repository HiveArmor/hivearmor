package com.hivearmor.service.search;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.fail;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * Property-based test — HiveArmor NL-Search DSL validator blocklist branch
 * (Sprint 11 PBT-4).
 *
 * <p><b>Property 16 (design.md) — Validator soundness (blocklist branch).</b>
 * For every well-formed JSON DSL object whose serialised form contains at
 * least one of the ten DM-5 Blocklist substrings, calling
 * {@link NlSearchDslValidator#validate(String)} must throw
 * {@link NlSearchSecurityException}.</p>
 *
 * <p>The DM-5 Blocklist is:</p>
 * <ul>
 *   <li>{@code _cluster}, {@code _cat}, {@code _nodes}, {@code _snapshot},
 *       {@code _shrink}, {@code _split}</li>
 *   <li>{@code delete_by_query}, {@code update_by_query}, {@code reindex},
 *       {@code script}</li>
 * </ul>
 *
 * <p><b>Validates: Requirements 5.14</b> — the validator's blocklist check
 * rejects every DSL that references any of the ten forbidden constructs,
 * regardless of where the substring appears (JSON key, string value, array
 * element) or how deep it is nested.</p>
 *
 * <p>jqwik is not a dependency of the HiveArmor backend (verified against
 * {@code backend/pom.xml}), and Sprint 11 tasks.md explicitly defers the
 * library choice to execution time. This test therefore uses a hand-rolled
 * JUnit 5 loop driven by a seeded {@link Random}, mirroring the layout of
 * the companion PBT classes in this package.</p>
 *
 * <p>Each of the 500 iterations:</p>
 * <ol>
 *   <li>picks 1..3 distinct terms from the Blocklist,</li>
 *   <li>builds a benign JSON DSL rooted at {@code query}, {@code aggs}, or
 *       both, at a variable depth 1..4,</li>
 *   <li>injects each chosen term at a random position — as a top-level key,
 *       a nested key, a string value, or an array element — reaching depths
 *       of 0..5 within the tree,</li>
 *   <li>serialises the tree with Gson and asserts the validator throws
 *       {@link NlSearchSecurityException}.</li>
 * </ol>
 *
 * <p>Preconditions are checked before every assertion so that any
 * unexpected shape (length overflow, missing term after serialisation) is
 * reported as a generator bug rather than a validator failure.</p>
 *
 * <p>The seed ({@code 42L}) is fixed so any counterexample observed by CI
 * is deterministically reproducible on a developer's machine.</p>
 */
class NlSearchDslValidatorBlocklistPBT {

    private static final int ITERATIONS = 500;

    private static final long SEED = 42L;

    /**
     * DM-5 Blocklist — the ten case-sensitive substrings the validator must
     * reject wherever they appear in the raw DSL text. Duplicated locally so
     * the generator does not import the production array.
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

    /**
     * Benign query-clause wrapper keys used to build variable-depth query
     * subtrees. None of these are DM-5 Blocklist terms.
     */
    private static final String[] QUERY_WRAPPERS = {
        "bool", "must", "must_not", "should", "filter",
        "range", "match", "term", "terms", "wildcard", "prefix"
    };

    /**
     * Benign fields used inside leaf clauses. None of these are DM-5
     * Blocklist terms and none contain a blocklisted substring.
     */
    private static final String[] LEAF_FIELDS = {
        "severity", "host_name", "user_name", "event_id",
        "source_ip", "destination_ip", "rule_name", "timestamp"
    };

    private final NlSearchDslValidator validator = new NlSearchDslValidator();
    private final Gson gson = new Gson();

    /**
     * Property: {@code validate(dsl)} throws {@link NlSearchSecurityException}
     * for every generated DSL containing at least one Blocklist substring.
     */
    @Test
    void validate_rejectsBlocklistedDsl() {
        Random rng = new Random(SEED);

        for (int i = 0; i < ITERATIONS; i++) {
            final int iteration = i;

            // Pick 1..3 distinct Blocklist terms for this iteration.
            int termCount = 1 + rng.nextInt(3);
            Set<String> terms = new LinkedHashSet<>();
            while (terms.size() < termCount) {
                terms.add(BLOCKLIST[rng.nextInt(BLOCKLIST.length)]);
            }

            final String dsl = generateDsl(terms, rng);

            // Generator sanity checks — if these fail, the generator is buggy
            // rather than the validator, so a distinct failure message is used.
            assertGeneratorPreconditions(dsl, terms, iteration);

            assertThrows(
                NlSearchSecurityException.class,
                () -> validator.validate(dsl),
                () -> "Validator failed to reject DSL containing blocklisted term(s) "
                    + terms + " (seed=" + SEED + ", iteration=" + iteration + ").\n"
                    + "  dsl = " + dsl
            );
        }
    }

    // ---------------------------------------------------------------------
    // Generator
    // ---------------------------------------------------------------------

    /**
     * Builds a serialised JSON DSL that:
     * <ul>
     *   <li>always contains a {@code query} and/or {@code aggs} root key,</li>
     *   <li>parses as a valid JSON object,</li>
     *   <li>is well under the 10 000-character length ceiling, and</li>
     *   <li>contains every string in {@code terms} as a raw substring somewhere
     *       in the serialised output.</li>
     * </ul>
     */
    private String generateDsl(Set<String> terms, Random rng) {
        JsonObject root = new JsonObject();

        // Pick root shape — always at least one of "query" or "aggs".
        // Distribution: 3/5 query only, 1/5 aggs only, 1/5 both.
        int shape = rng.nextInt(5);
        boolean withQuery = shape != 3; // false only when shape == 3
        boolean withAggs = shape == 3 || shape == 4;
        if (!withQuery && !withAggs) {
            withQuery = true; // defensive — should be unreachable
        }
        if (withQuery) {
            root.add("query", buildBenignQuery(rng));
        }
        if (withAggs) {
            root.add("aggs", buildBenignAggs(rng));
        }

        // Inject each term at an independently-chosen position.
        for (String term : terms) {
            int strategy = rng.nextInt(4);
            switch (strategy) {
                case 0:
                    injectAsTopLevelKey(root, term, rng);
                    break;
                case 1:
                    injectAsNestedKey(root, term, rng);
                    break;
                case 2:
                    injectAsStringValue(root, term, rng);
                    break;
                default:
                    injectAsArrayElement(root, term, rng);
                    break;
            }
        }

        return gson.toJson(root);
    }

    /**
     * Builds a benign query subtree of depth 1..4 with realistic wrapper
     * keys. The leaf is always a simple {field, value} pair.
     */
    private JsonObject buildBenignQuery(Random rng) {
        int depth = 1 + rng.nextInt(4);

        JsonObject leaf = new JsonObject();
        leaf.addProperty(LEAF_FIELDS[rng.nextInt(LEAF_FIELDS.length)], "value_" + rng.nextInt(1000));

        JsonObject current = leaf;
        for (int d = 0; d < depth; d++) {
            JsonObject wrapper = new JsonObject();
            wrapper.add(QUERY_WRAPPERS[rng.nextInt(QUERY_WRAPPERS.length)], current);
            current = wrapper;
        }
        return current;
    }

    /**
     * Builds a benign aggregations subtree resembling a terms bucket over a
     * safe field.
     */
    private JsonObject buildBenignAggs(Random rng) {
        JsonObject aggs = new JsonObject();
        JsonObject agg = new JsonObject();
        JsonObject termsBucket = new JsonObject();
        termsBucket.addProperty("field", LEAF_FIELDS[rng.nextInt(LEAF_FIELDS.length)]);
        termsBucket.addProperty("size", rng.nextInt(20) + 1);
        agg.add("terms", termsBucket);
        aggs.add("by_" + LEAF_FIELDS[rng.nextInt(LEAF_FIELDS.length)], agg);
        return aggs;
    }

    // ---------------------------------------------------------------------
    // Placement strategies
    // ---------------------------------------------------------------------

    /**
     * Strategy A — inject the term as a key at the top level of the root
     * object, alongside {@code query} / {@code aggs}. Depth 0.
     */
    private void injectAsTopLevelKey(JsonObject root, String term, Random rng) {
        root.addProperty(term, "value_" + rng.nextInt(1000));
    }

    /**
     * Strategy B — walk into a randomly-chosen nested object anywhere in
     * the tree and inject the term as a key there. Depths 0..5.
     */
    private void injectAsNestedKey(JsonObject root, String term, Random rng) {
        JsonObject node = walkToRandomObject(root, rng);
        node.addProperty(term, "value_" + rng.nextInt(1000));
    }

    /**
     * Strategy C — walk into a randomly-chosen nested object and inject the
     * term as the string value of a benign key. Depths 0..5.
     */
    private void injectAsStringValue(JsonObject root, String term, Random rng) {
        JsonObject node = walkToRandomObject(root, rng);
        node.addProperty("field_" + rng.nextInt(1000), term);
    }

    /**
     * Strategy D — walk into a randomly-chosen nested object and attach a
     * benign-keyed array containing the term as one of its string elements.
     * Depths 0..5.
     */
    private void injectAsArrayElement(JsonObject root, String term, Random rng) {
        JsonObject node = walkToRandomObject(root, rng);
        JsonArray arr = new JsonArray();
        // Random position within the array (start, middle, or end).
        int pos = rng.nextInt(3);
        if (pos == 0) {
            arr.add(term);
            arr.add("other_" + rng.nextInt(1000));
        } else if (pos == 1) {
            arr.add("head_" + rng.nextInt(1000));
            arr.add(term);
            arr.add("tail_" + rng.nextInt(1000));
        } else {
            arr.add("other_" + rng.nextInt(1000));
            arr.add(term);
        }
        node.add("array_" + rng.nextInt(1000), arr);
    }

    /**
     * Walks 0..maxDepth-1 steps into the tree, at each step picking a
     * uniformly-random child {@link JsonObject} value. Stops early if the
     * current node has no object-valued children. Returns the deepest node
     * reached. Depths from 0 (the root itself) up to 5 are exercised.
     */
    private JsonObject walkToRandomObject(JsonObject root, Random rng) {
        JsonObject current = root;
        int steps = rng.nextInt(6);
        for (int i = 0; i < steps; i++) {
            List<JsonObject> children = new ArrayList<>();
            for (Map.Entry<String, com.google.gson.JsonElement> entry : current.entrySet()) {
                if (entry.getValue().isJsonObject()) {
                    children.add(entry.getValue().getAsJsonObject());
                }
            }
            if (children.isEmpty()) {
                break;
            }
            current = children.get(rng.nextInt(children.size()));
        }
        return current;
    }

    // ---------------------------------------------------------------------
    // Generator preconditions
    // ---------------------------------------------------------------------

    /**
     * Validates that the generator honoured its contract before each
     * assertion: length ≤ 10 000, contains a {@code query} or {@code aggs}
     * key at the root, and contains every requested term as a raw substring.
     * A failure here is a bug in the generator, not the validator.
     */
    private void assertGeneratorPreconditions(String dsl, Set<String> terms, int iteration) {
        if (dsl.length() > 10000) {
            fail("Generator bug: DSL length " + dsl.length()
                + " exceeds 10000 at iteration " + iteration + ".");
        }
        if (!dsl.contains("\"query\"") && !dsl.contains("\"aggs\"")) {
            fail("Generator bug: DSL missing both 'query' and 'aggs' root keys"
                + " at iteration " + iteration + ": " + dsl);
        }
        for (String term : terms) {
            if (!dsl.contains(term)) {
                fail("Generator bug: DSL missing term '" + term
                    + "' at iteration " + iteration + ": " + dsl);
            }
        }
    }
}
