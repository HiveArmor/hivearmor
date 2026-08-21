package com.hivearmor.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Property 3: LLM response parser round-trips valid JSON objects.
 *
 * <p><strong>Property 3: LLM response parser round-trips valid JSON objects</strong><br>
 * For any JSON object node serialized to a string and wrapped with arbitrary prefix and
 * suffix text (that contain no unescaped bare braces), {@code parseLlmResponseForTesting}
 * returns a node that is structurally equal to the original JSON object.
 * When the input contains no balanced JSON object substring, the parser returns
 * {@code Optional.empty()}.
 *
 * <p><strong>Validates: Requirements 4.1, 4.2, 4.6</strong>
 */
@Label("Feature: sprint-26-nl-search, Property 3: LLM response parser round-trips valid JSON objects")
class HaSearchLlmParserPropertyTest {

    private ObjectMapper objectMapper;
    private HaSearchService service;

    @BeforeEach
    @BeforeTry
    void setUp() {
        objectMapper = new ObjectMapper();
        HaLlmService llmService = mock(HaLlmService.class);
        MsspIndexResolver msspIndexResolver = mock(MsspIndexResolver.class);
        service = new HaSearchService(llmService, objectMapper, msspIndexResolver);
    }

    // =========================================================================
    // Property 3-A: round-trip — prefix + serialized JSON + suffix → same node
    // =========================================================================

    /**
     * For any pre-constructed JSON object node, serializing it to a string and
     * wrapping it with arbitrary surrounding text (free of bare {@code '{'} and
     * {@code '}'}) must yield the same node back from the parser.
     *
     * <p><strong>Validates: Requirements 4.1, 4.2</strong>
     */
    @Property(tries = 150)
    @Label("Property 3-A: parser round-trips valid JSON objects with arbitrary surrounding text")
    void property3a_roundTrip_validJsonObject_withSurroundingText(
            @ForAll("jsonObjectNodes") ObjectNode jsonObject,
            @ForAll("safeStrings") String prefix,
            @ForAll("safeStrings") String suffix) throws Exception {

        String serialized = objectMapper.writeValueAsString(jsonObject);
        String input = prefix + serialized + suffix;

        Optional<JsonNode> result = service.parseLlmResponseForTesting(input);

        assertThat(result)
            .as("Parser must return a non-empty Optional for input containing a valid JSON object")
            .isPresent();
        assertThat(result.get())
            .as("Parsed node must be structurally equal to the original JSON object")
            .isEqualTo(jsonObject);
    }

    // =========================================================================
    // Property 3-B: empty Optional when there is no balanced JSON object
    // =========================================================================

    /**
     * When the input is a plain string with no balanced JSON object substring
     * (i.e., no {@code {...}} pattern at all), the parser must return
     * {@code Optional.empty()}.
     *
     * <p><strong>Validates: Requirement 4.6</strong>
     */
    @Property(tries = 150)
    @Label("Property 3-B: parser returns Optional.empty() for strings without balanced JSON objects")
    void property3b_noJsonObject_returnsEmpty(
            @ForAll("noBraceStrings") String input) {

        Optional<JsonNode> result = service.parseLlmResponseForTesting(input);

        assertThat(result)
            .as("Parser must return Optional.empty() when input contains no JSON object")
            .isEmpty();
    }

    // =========================================================================
    // Simple JUnit 5 @Test: null / blank / no-JSON edge cases
    // =========================================================================

    /**
     * Verifies that {@code parseLlmResponseForTesting} returns {@code Optional.empty()}
     * for null input, blank input, and strings that contain no JSON object.
     */
    @Test
    void parseLlmResponse_returnsEmpty_forNullBlankAndNoJson() {
        // null
        assertThat(service.parseLlmResponseForTesting(null))
            .as("null input must return Optional.empty()")
            .isEmpty();

        // blank string
        assertThat(service.parseLlmResponseForTesting("   "))
            .as("blank input must return Optional.empty()")
            .isEmpty();

        // empty string
        assertThat(service.parseLlmResponseForTesting(""))
            .as("empty string must return Optional.empty()")
            .isEmpty();

        // plain text with no braces
        assertThat(service.parseLlmResponseForTesting("This is just some prose."))
            .as("plain prose must return Optional.empty()")
            .isEmpty();

        // only opening brace — unbalanced
        assertThat(service.parseLlmResponseForTesting("{unbalanced"))
            .as("unbalanced opening brace must return Optional.empty()")
            .isEmpty();

        // JSON array (not an object)
        assertThat(service.parseLlmResponseForTesting("[1, 2, 3]"))
            .as("JSON array (not an object) must return Optional.empty()")
            .isEmpty();

        // Markdown code fence prefix + valid JSON — should still extract the object
        Optional<JsonNode> withFence = service.parseLlmResponseForTesting(
            "Here is the DSL:\n```json\n{\"query\":{\"match_all\":{}}}\n```");
        assertThat(withFence)
            .as("JSON wrapped in markdown fences must still be parsed")
            .isPresent();
        assertThat(withFence.get().has("query"))
            .as("Extracted node must have the 'query' field")
            .isTrue();
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates a small set of pre-constructed ObjectNode examples.
     *
     * <p>Pure arbitrary {@code JsonNode} generation would require complex recursive
     * generators; instead we build a fixed but varied set that exercises the parser
     * across a representative cross-section of JSON object shapes.
     */
    @Provide
    Arbitrary<ObjectNode> jsonObjectNodes() {
        objectMapper = mapper();
        return Arbitraries.of(
            buildNode1(),
            buildNode2(),
            buildNode3(),
            buildNode4(),
            buildNode5(),
            buildNode6(),
            buildNode7(),
            buildNode8()
        );
    }

    /** Simple flat object: {@code {"query":{"match_all":{}}}} */
    private ObjectNode buildNode1() {
        ObjectNode root = mapper().createObjectNode();
        root.set("query", mapper().createObjectNode()
            .set("match_all", mapper().createObjectNode()));
        return root;
    }

    private ObjectMapper mapper() {
        return objectMapper != null ? objectMapper : new ObjectMapper();
    }

    /** Object with confidence and explanation: LLM typical response shape */
    private ObjectNode buildNode2() {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode query = objectMapper.createObjectNode();
        ObjectNode term = objectMapper.createObjectNode();
        term.put("severity", "critical");
        query.set("term", term);
        root.set("query", query);
        root.put("confidence", 0.82);
        root.put("explanation", "Filters for critical-severity events.");
        return root;
    }

    /** Object with numeric size field within allowed range */
    private ObjectNode buildNode3() {
        ObjectNode root = objectMapper.createObjectNode();
        root.set("query", objectMapper.createObjectNode()
            .set("match_all", objectMapper.createObjectNode()));
        root.put("size", 100);
        return root;
    }

    /** Nested bool query */
    private ObjectNode buildNode4() {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode bool = objectMapper.createObjectNode();
        ObjectNode mustEntry = objectMapper.createObjectNode();
        mustEntry.put("category", "authentication_failure");
        ObjectNode match = objectMapper.createObjectNode();
        match.set("category", mustEntry);
        ObjectNode mustClause = objectMapper.createObjectNode();
        mustClause.set("match", match);
        com.fasterxml.jackson.databind.node.ArrayNode mustArr =
            objectMapper.createArrayNode();
        mustArr.add(mustClause);
        bool.set("must", mustArr);
        ObjectNode query = objectMapper.createObjectNode();
        query.set("bool", bool);
        root.set("query", query);
        return root;
    }

    /** Object with a string field whose value contains braces — ensures string-literal scanning works */
    private ObjectNode buildNode5() {
        ObjectNode root = objectMapper.createObjectNode();
        root.set("query", objectMapper.createObjectNode()
            .set("match_all", objectMapper.createObjectNode()));
        root.put("description", "Use {wildcard} syntax for fuzzy matches.");
        return root;
    }

    /** Minimal object: single top-level key, no 'query' field */
    private ObjectNode buildNode6() {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("agg", "terms");
        return root;
    }

    /** Object whose field values contain escaped double-quotes */
    private ObjectNode buildNode7() {
        ObjectNode root = objectMapper.createObjectNode();
        root.set("query", objectMapper.createObjectNode()
            .set("match_all", objectMapper.createObjectNode()));
        root.put("label", "Find \"failed\" logins");
        return root;
    }

    /** Deeply nested object (3 levels) */
    private ObjectNode buildNode8() {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode level1 = objectMapper.createObjectNode();
        ObjectNode level2 = objectMapper.createObjectNode();
        level2.put("field", "value");
        level1.set("inner", level2);
        root.set("query", level1);
        root.put("confidence", 0.5);
        return root;
    }

    /**
     * Generates arbitrary strings that contain no unescaped bare {@code '{'} or
     * {@code '}'} characters. These are safe to use as prefix/suffix surrounding
     * the serialized JSON without interfering with the brace-depth scanner.
     */
    @Provide
    Arbitrary<String> safeStrings() {
        // Allow printable ASCII minus '{' and '}', plus spaces and newlines.
        return Arbitraries.strings()
            .withCharRange(' ', 'z')
            .ofMinLength(0)
            .ofMaxLength(80)
            .filter(s -> !s.contains("{") && !s.contains("}"));
    }

    /**
     * Generates strings that contain no {@code '{'} or {@code '}'} characters at all,
     * guaranteeing no balanced JSON object can be present.
     */
    @Provide
    Arbitrary<String> noBraceStrings() {
        return Arbitraries.strings()
            .withCharRange(' ', 'z')
            .ofMinLength(0)
            .ofMaxLength(200)
            .filter(s -> !s.contains("{") && !s.contains("}"));
    }
}
