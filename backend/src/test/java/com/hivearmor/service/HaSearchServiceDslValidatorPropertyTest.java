package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Property 4: DSL validator rejects any {@code script} clause at any nesting depth.
 *
 * <p><strong>Property 4: DSL validator rejects any script clause at any nesting depth</strong><br>
 * For every well-formed DSL tree that contains a {@code "script"} key at depth 1, 2, or 3,
 * {@code isValidQueryDsl} must return {@code false}. Conversely, well-formed trees with
 * {@code size ∈ [0, 10000]}, an object {@code query} field, and no {@code "script"} key
 * at any depth must return {@code true}.
 *
 * <p><strong>Validates: Requirements 4.3, 4.4</strong>
 */
@Label("Feature: sprint-26-nl-search, Property 4: DSL validator rejects script at any depth")
class HaSearchServiceDslValidatorPropertyTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private HaSearchService service;

    @BeforeEach
    @BeforeTry
    void setUp() {
        HaLlmService llmService = mock(HaLlmService.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        service = new HaSearchService(llmService, MAPPER, resolver);
    }

    // =========================================================================
    // Property 4-A: script at random depth 1-3 → always false
    // =========================================================================

    /**
     * For every generated well-formed DSL tree with a {@code script} key injected at depth 1, 2,
     * or 3, {@code isValidQueryDslForTesting} returns {@code false}.
     *
     * <p><strong>Validates: Requirements 4.3, 4.4</strong>
     */
    @Property(tries = 200)
    @Label("Property 4-A: isValidQueryDsl returns false when script injected at depth 1, 2, or 3")
    void property4a_scriptAtAnyDepth_returnsFalse(
            @ForAll("dslTreesWithScriptInjected") ObjectNode dslWithScript) {

        boolean result = service.isValidQueryDslForTesting(dslWithScript);

        assertThat(result)
            .as("Expected false for DSL containing 'script' key: %s", dslWithScript)
            .isFalse();
    }

    /**
     * Generates well-formed DSL trees that always contain a {@code script} key
     * injected at a random depth (1, 2, or 3) inside or alongside the {@code query} object.
     */
    @Provide
    Arbitrary<ObjectNode> dslTreesWithScriptInjected() {
        // Choose a valid size for the DSL root (0..10000 inclusive)
        Arbitrary<Integer> validSize = Arbitraries.integers().between(0, 10000);
        // Choose at which depth (1, 2, or 3) to inject the script key
        Arbitrary<Integer> depth = Arbitraries.integers().between(1, 3);
        // Generate a random benign string value for the script node
        Arbitrary<String> scriptValue = Arbitraries.strings()
            .withCharRange('a', 'z')
            .ofMinLength(1)
            .ofMaxLength(10);

        return Combinators.combine(validSize, depth, scriptValue)
            .as((size, d, val) -> buildDslWithScript(size, d, val));
    }

    /**
     * Builds a DSL tree with a valid {@code query} object and injects a {@code script} key
     * at the specified depth within the query subtree.
     *
     * <ul>
     *   <li>depth 1 — {@code script} is a top-level key alongside {@code query}</li>
     *   <li>depth 2 — {@code script} is a key inside {@code query}</li>
     *   <li>depth 3 — {@code script} is a key inside {@code query.bool}</li>
     * </ul>
     */
    private ObjectNode buildDslWithScript(int size, int depth, String scriptValue) {
        ObjectNode root = MAPPER.createObjectNode();
        root.put("size", size);

        ObjectNode queryNode = MAPPER.createObjectNode();
        root.set("query", queryNode);

        switch (depth) {
            case 1:
                // script at depth 1 — sibling of "query" at root level
                root.set("script", MAPPER.createObjectNode().put("source", scriptValue));
                // Ensure query is non-empty so the root isn't empty
                queryNode.set("match_all", MAPPER.createObjectNode());
                break;
            case 2:
                // script at depth 2 — directly inside "query"
                queryNode.set("script", MAPPER.createObjectNode().put("source", scriptValue));
                break;
            case 3:
            default:
                // script at depth 3 — inside query.bool
                ObjectNode boolNode = MAPPER.createObjectNode();
                queryNode.set("bool", boolNode);
                boolNode.set("script", MAPPER.createObjectNode().put("source", scriptValue));
                break;
        }

        return root;
    }

    // =========================================================================
    // Property 4-B: valid trees (no script, valid size, object query) → true
    // =========================================================================

    /**
     * For every generated valid DSL tree with {@code size ∈ [0, 10000]}, an object {@code query}
     * field, and no {@code script} key anywhere, {@code isValidQueryDslForTesting} returns {@code true}.
     *
     * <p><strong>Validates: Requirements 4.3, 4.4</strong>
     */
    @Property(tries = 200)
    @Label("Property 4-B: isValidQueryDsl returns true for valid trees without script")
    void property4b_validTreeNoScript_returnsTrue(
            @ForAll("validDslTrees") ObjectNode validDsl) {

        boolean result = service.isValidQueryDslForTesting(validDsl);

        assertThat(result)
            .as("Expected true for valid DSL without script: %s", validDsl)
            .isTrue();
    }

    /**
     * Generates valid DSL trees with:
     * <ul>
     *   <li>{@code size ∈ [0, 10000]}</li>
     *   <li>an object {@code query} field (containing {@code match_all} or {@code bool})</li>
     *   <li>no {@code script} key at any level</li>
     * </ul>
     */
    @Provide
    Arbitrary<ObjectNode> validDslTrees() {
        Arbitrary<Integer> validSize = Arbitraries.integers().between(0, 10000);
        // Randomly include size field or omit it
        Arbitrary<Boolean> includeSize = Arbitraries.of(true, false);
        // Choose a benign query clause type
        Arbitrary<String> queryType = Arbitraries.of("match_all", "bool", "term", "range");

        return Combinators.combine(validSize, includeSize, queryType)
            .as((size, addSize, type) -> buildValidDsl(size, addSize, type));
    }

    /**
     * Builds a valid DSL object node without any {@code script} key.
     * Optionally includes a {@code size} field within [0, 10000].
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
                ObjectNode mustClause = MAPPER.createObjectNode();
                mustClause.set("match_all", MAPPER.createObjectNode());
                boolNode.set("filter", mustClause);
                queryNode.set("bool", boolNode);
                break;
            case "term":
                ObjectNode termNode = MAPPER.createObjectNode();
                termNode.put("severity", "critical");
                queryNode.set("term", termNode);
                break;
            case "range":
                ObjectNode rangeNode = MAPPER.createObjectNode();
                ObjectNode timestampRange = MAPPER.createObjectNode();
                timestampRange.put("gte", "now-1h");
                rangeNode.set("@timestamp", timestampRange);
                queryNode.set("range", rangeNode);
                break;
            case "match_all":
            default:
                queryNode.set("match_all", MAPPER.createObjectNode());
                break;
        }

        return root;
    }

    // =========================================================================
    // Unit tests — specific examples
    // =========================================================================

    @Test
    void nullNode_returnsFalse() {
        assertThat(service.isValidQueryDslForTesting(null)).isFalse();
    }

    @Test
    void emptyObject_returnsFalse() throws Exception {
        ObjectNode empty = MAPPER.createObjectNode();
        assertThat(service.isValidQueryDslForTesting(empty)).isFalse();
    }

    @Test
    void matchAll_returnsTrue() throws Exception {
        // {"query":{"match_all":{}}}
        ObjectNode node = (ObjectNode) MAPPER.readTree("{\"query\":{\"match_all\":{}}}");
        assertThat(service.isValidQueryDslForTesting(node)).isTrue();
    }

    @Test
    void scriptAtDepth2_returnsFalse() throws Exception {
        // {"query":{"script":{}}}
        ObjectNode node = (ObjectNode) MAPPER.readTree("{\"query\":{\"script\":{}}}");
        assertThat(service.isValidQueryDslForTesting(node)).isFalse();
    }

    @Test
    void scriptInArrayAtDepth4_returnsFalse() throws Exception {
        // {"query":{"bool":{"must":[{"script":{}}]}}}
        ObjectNode node = (ObjectNode) MAPPER.readTree(
            "{\"query\":{\"bool\":{\"must\":[{\"script\":{}}]}}}");
        assertThat(service.isValidQueryDslForTesting(node)).isFalse();
    }

    @Test
    void negativeSize_returnsFalse() throws Exception {
        // {"size":-1,"query":{"match_all":{}}}
        ObjectNode node = (ObjectNode) MAPPER.readTree(
            "{\"size\":-1,\"query\":{\"match_all\":{}}}");
        assertThat(service.isValidQueryDslForTesting(node)).isFalse();
    }

    @Test
    void sizeExceedsMaximum_returnsFalse() throws Exception {
        // {"size":10001,"query":{"match_all":{}}}
        ObjectNode node = (ObjectNode) MAPPER.readTree(
            "{\"size\":10001,\"query\":{\"match_all\":{}}}");
        assertThat(service.isValidQueryDslForTesting(node)).isFalse();
    }

    @Test
    void sizeAtBoundary_returnsTrue() throws Exception {
        // {"size":500,"query":{"match_all":{}}}
        ObjectNode node = (ObjectNode) MAPPER.readTree(
            "{\"size\":500,\"query\":{\"match_all\":{}}}");
        assertThat(service.isValidQueryDslForTesting(node)).isTrue();
    }
}
