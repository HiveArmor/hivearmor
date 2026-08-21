package com.hivearmor.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import net.jqwik.api.*;
import org.junit.jupiter.api.BeforeEach;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Property 4: DSL validator rejects any {@code script} clause at any nesting depth.
 *
 * <p><strong>Property 4: DSL validator rejects any script clause at any nesting depth</strong><br>
 * Property A — script key at any depth (0 = top-level, inside {@code query}, or deeper)
 * causes {@code isValidQueryDsl} to return {@code false}. Property B — valid DSL trees
 * with a non-empty body, an object {@code query} field, no {@code script} key anywhere,
 * and {@code size ∈ [0, 10000]} (or absent) cause {@code isValidQueryDsl} to return
 * {@code true}.
 *
 * <p><strong>Validates: Requirements 4.3, 4.4</strong>
 */
@Label("Feature: sprint-26-nl-search, Property 4: DSL validator rejects script at any depth")
class HaSearchServiceValidatorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private HaSearchService service;
    private Method isValidQueryDslMethod;

    @BeforeEach
    void setUp() throws Exception {
        HaLlmService llmService = mock(HaLlmService.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        service = new HaSearchService(llmService, MAPPER, resolver);

        isValidQueryDslMethod =
                HaSearchService.class.getDeclaredMethod("isValidQueryDsl", JsonNode.class);
        isValidQueryDslMethod.setAccessible(true);
    }

    // =========================================================================
    // Reflection helper
    // =========================================================================

    /**
     * Invokes the private {@code isValidQueryDsl} method via reflection.
     *
     * @param node the candidate node to validate (may be null)
     * @return the boolean result of {@code isValidQueryDsl(node)}
     */
    private boolean invoke(JsonNode node) {
        try {
            return (boolean) isValidQueryDslMethod.invoke(service, node);
        } catch (Exception e) {
            throw new AssertionError("Reflection invocation of isValidQueryDsl failed", e);
        }
    }

    // =========================================================================
    // Property A: script key at any depth → always false
    // =========================================================================

    /**
     * Property A: for every well-formed DSL tree that has a {@code "script"} key injected at
     * depth 0 (top-level), depth 1 (inside {@code query}), or depth 2 (inside {@code query.bool}),
     * {@code isValidQueryDsl} returns {@code false}.
     *
     * <p><strong>Validates: Requirements 4.3, 4.4</strong>
     */
    @Property(tries = 100)
    @Label("Property 4-A: script key at any depth causes isValidQueryDsl to return false")
    void propertyA_scriptAtAnyDepth_returnsFalse(
            @ForAll("dslTreesWithScript") ObjectNode dslWithScript) {

        boolean result = invoke(dslWithScript);

        assertThat(result)
            .as("Expected false for DSL containing 'script' key, but got true. DSL: %s",
                dslWithScript)
            .isFalse();
    }

    /**
     * Generates well-formed DSL {@link ObjectNode}s with a {@code "script"} key injected
     * at a randomly chosen depth:
     * <ul>
     *   <li>depth 0 — {@code "script"} is a top-level sibling of {@code "query"}</li>
     *   <li>depth 1 — {@code "script"} is directly inside {@code "query"}</li>
     *   <li>depth 2 — {@code "script"} is inside {@code "query"."bool"}</li>
     * </ul>
     */
    @Provide
    Arbitrary<ObjectNode> dslTreesWithScript() {
        // Depth 0, 1, or 2 maps to: top-level, inside query, inside query.bool
        Arbitrary<Integer> depth = Arbitraries.integers().between(0, 2);
        Arbitrary<Integer> validSize = Arbitraries.integers().between(0, 10000);
        Arbitrary<Boolean> includeSize = Arbitraries.of(true, false);
        Arbitrary<String> scriptVal = Arbitraries.strings()
            .withCharRange('a', 'z')
            .ofMinLength(1)
            .ofMaxLength(8);

        return Combinators.combine(depth, validSize, includeSize, scriptVal)
            .as((d, size, addSize, val) -> buildDslWithScript(d, size, addSize, val));
    }

    /**
     * Builds a DSL {@link ObjectNode} with a valid {@code "query"} object and
     * a {@code "script"} key injected at the requested depth.
     */
    private ObjectNode buildDslWithScript(int depth, int size, boolean includeSize, String scriptVal) {
        ObjectNode root = MAPPER.createObjectNode();
        if (includeSize) {
            root.put("size", size);
        }

        ObjectNode queryNode = MAPPER.createObjectNode();
        root.set("query", queryNode);

        switch (depth) {
            case 0:
                // script at depth 0 — top-level, sibling of "query"
                root.set("script", MAPPER.createObjectNode().put("source", scriptVal));
                // ensure query is non-empty so root has at least "query"
                queryNode.set("match_all", MAPPER.createObjectNode());
                break;
            case 1:
                // script at depth 1 — directly inside "query"
                queryNode.set("script", MAPPER.createObjectNode().put("source", scriptVal));
                break;
            case 2:
            default:
                // script at depth 2 — inside query.bool
                ObjectNode boolNode = MAPPER.createObjectNode();
                queryNode.set("bool", boolNode);
                boolNode.set("script", MAPPER.createObjectNode().put("source", scriptVal));
                break;
        }

        return root;
    }

    // =========================================================================
    // Property B: valid DSL trees (no script, valid size, object query) → true
    // =========================================================================

    /**
     * Property B: for every valid DSL tree with at least one field, an object {@code "query"}
     * field, no {@code "script"} key at any depth, and {@code size ∈ [0, 10000]} when present
     * (or absent), {@code isValidQueryDsl} returns {@code true}.
     *
     * <p><strong>Validates: Requirements 4.3, 4.4</strong>
     */
    @Property(tries = 100)
    @Label("Property 4-B: valid DSL trees with no script pass isValidQueryDsl")
    void propertyB_validDslNoScript_returnsTrue(
            @ForAll("validDslTrees") ObjectNode validDsl) {

        boolean result = invoke(validDsl);

        assertThat(result)
            .as("Expected true for valid DSL without script, but got false. DSL: %s", validDsl)
            .isTrue();
    }

    /**
     * Generates valid DSL {@link ObjectNode}s with:
     * <ul>
     *   <li>At least one field (the {@code "query"} field)</li>
     *   <li>An object {@code "query"} field (match_all, bool, term, or range)</li>
     *   <li>No {@code "script"} key at any depth</li>
     *   <li>{@code "size"} in {@code [0, 10000]} when present, or absent</li>
     * </ul>
     */
    @Provide
    Arbitrary<ObjectNode> validDslTrees() {
        Arbitrary<Integer> validSize = Arbitraries.integers().between(0, 10000);
        Arbitrary<Boolean> includeSize = Arbitraries.of(true, false);
        Arbitrary<String> queryType = Arbitraries.of("match_all", "bool", "term", "range");

        return Combinators.combine(validSize, includeSize, queryType)
            .as((size, addSize, type) -> buildValidDsl(size, addSize, type));
    }

    /**
     * Builds a valid DSL {@link ObjectNode} without any {@code "script"} key, with the
     * given query clause type and optional size.
     */
    private ObjectNode buildValidDsl(int size, boolean includeSize, String queryType) {
        ObjectNode root = MAPPER.createObjectNode();
        if (includeSize) {
            root.put("size", size);
        }

        ObjectNode queryNode = MAPPER.createObjectNode();
        root.set("query", queryNode);

        switch (queryType) {
            case "bool":
                ObjectNode boolNode = MAPPER.createObjectNode();
                ObjectNode filterClause = MAPPER.createObjectNode();
                filterClause.set("match_all", MAPPER.createObjectNode());
                boolNode.set("filter", filterClause);
                queryNode.set("bool", boolNode);
                break;
            case "term":
                ObjectNode termNode = MAPPER.createObjectNode();
                termNode.put("severity", "critical");
                queryNode.set("term", termNode);
                break;
            case "range":
                ObjectNode rangeNode = MAPPER.createObjectNode();
                ObjectNode tsRange = MAPPER.createObjectNode();
                tsRange.put("gte", "now-1h");
                rangeNode.set("@timestamp", tsRange);
                queryNode.set("range", rangeNode);
                break;
            case "match_all":
            default:
                queryNode.set("match_all", MAPPER.createObjectNode());
                break;
        }

        return root;
    }
}
