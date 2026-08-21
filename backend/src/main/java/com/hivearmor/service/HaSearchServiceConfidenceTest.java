package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.web.rest.dto.NlToDslRequestDTO;
import com.hivearmor.web.rest.dto.NlToDslResponseDTO;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.assertj.core.api.SoftAssertions;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Property 8: Confidence extraction falls back to 0.75.
 *
 * <p><strong>Validates: Requirements 4.7</strong>
 *
 * <p>Three properties are tested against {@link HaSearchService#translateNlToDsl}:
 * <ul>
 *   <li><strong>Property A</strong> — when the LLM response contains a top-level
 *       {@code confidence} field whose numeric value is in {@code [0.0, 1.0]}, the
 *       returned {@link NlToDslResponseDTO#confidence()} equals that value (within
 *       a tolerance of 0.001).</li>
 *   <li><strong>Property B</strong> — when the LLM response has no {@code confidence}
 *       field or a {@code confidence} outside {@code [0.0, 1.0]}, the returned
 *       confidence equals {@code 0.75} (the {@code DEFAULT_CONFIDENCE} constant).</li>
 *   <li><strong>Property C</strong> — when the LLM response is invalid JSON (not a
 *       parseable JSON object) or valid JSON missing a {@code query} field, the
 *       returned confidence equals {@code 0.1} (the {@code SAFE_FALLBACK_CONFIDENCE}
 *       constant).</li>
 * </ul>
 *
 * <p>The service under test is wired with a Mockito stub for {@link HaLlmService}
 * whose {@code chat} method is configured to return the generated JSON string per
 * property. A real {@link ObjectMapper} is used so the full parse/validate pipeline
 * runs without mocking.
 *
 * <p>Tests live in {@code src/main/java/} per the project convention (no
 * {@code src/test/} directory).
 *
 * <h3>NoGetFirstInvariant</h3>
 * <p>No {@code .getFirst()} call appears in this file; all list indexing uses
 * {@code .get(0)} per the Java 17 compatibility rule.
 */
@Label("Feature: sprint-26-nl-search, Property 8: Confidence extraction falls back to 0.75")
class HaSearchServiceConfidenceTest {

    // -------------------------------------------------------------------------
    // Shared fixtures — re-created before every jqwik trial
    // -------------------------------------------------------------------------

    private ObjectMapper objectMapper;
    private HaLlmService mockLlm;
    private HaSearchService service;

    /**
     * Fixed valid request used across all three properties.
     * Uses a non-empty, non-blank query and a realistic index pattern so that
     * the sanitizer never short-circuits to safeFallback before the LLM is called.
     */
    private static final NlToDslRequestDTO VALID_REQUEST =
        new NlToDslRequestDTO("failed logins", "v3-hive-alert-*");

    /** Tolerance for floating-point confidence comparisons (Property A). */
    private static final double CONFIDENCE_TOLERANCE = 0.001;

    /** Default confidence used when a valid DSL lacks an explicit confidence field. */
    private static final double EXPECTED_DEFAULT_CONFIDENCE = 0.75;

    /** Safe-fallback confidence used when the response fails parsing or validation. */
    private static final double EXPECTED_SAFE_FALLBACK_CONFIDENCE = 0.1;

    /**
     * Re-initialises the mock and service before every jqwik trial so that
     * stub configuration from one trial cannot leak into the next.
     */
    @BeforeTry
    void setUp() {
        objectMapper = new ObjectMapper();
        mockLlm = mock(HaLlmService.class);
        MsspIndexResolver mockResolver = mock(MsspIndexResolver.class);
        service = new HaSearchService(mockLlm, objectMapper, mockResolver);
    }

    // =========================================================================
    // Property A — confidence in [0.0, 1.0] is used directly
    // =========================================================================

    /**
     * <strong>Property A: valid confidence in [0.0, 1.0] is used directly.</strong>
     *
     * <p>For any double {@code c} in {@code [0.0, 1.0]}:
     * <ol>
     *   <li>Build an {@link ObjectNode} with a valid {@code query} object field and
     *       a {@code confidence} field set to {@code c}.</li>
     *   <li>Stub {@code HaLlmService.chat} to return the serialized node.</li>
     *   <li>Assert that {@link NlToDslResponseDTO#confidence()} is within
     *       {@value #CONFIDENCE_TOLERANCE} of {@code c}.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 4.7</strong>
     */
    @Property(tries = 100)
    @Label("Property 8-A: confidence in [0.0, 1.0] is propagated directly to the response")
    void propertyA_validConfidence_usedDirectly(
            @ForAll("validConfidenceValues") double injectedConfidence) throws Exception {

        // Build a valid DSL node with the injected confidence
        ObjectNode node = buildValidQueryNode();
        node.put("confidence", injectedConfidence);
        String jsonString = objectMapper.writeValueAsString(node);

        // Stub the LLM to return that JSON
        when(mockLlm.chat(any(List.class), anyString())).thenReturn(jsonString);

        NlToDslResponseDTO response = service.translateNlToDsl(VALID_REQUEST);

        assertThat(response.confidence())
            .as("Expected confidence %.6f (within %.3f) but got %.6f.\n  LLM JSON: %s",
                injectedConfidence, CONFIDENCE_TOLERANCE, response.confidence(), jsonString)
            .isCloseTo(injectedConfidence, org.assertj.core.data.Offset.offset(CONFIDENCE_TOLERANCE));
    }

    // =========================================================================
    // Property B — missing / invalid confidence falls back to 0.75
    // =========================================================================

    /**
     * <strong>Property B: missing or out-of-range confidence defaults to 0.75.</strong>
     *
     * <p>For any {@link ObjectNode} that is a structurally valid DSL (has a {@code query}
     * object field, no {@code script} key, valid {@code size} if present) but does NOT
     * contain a {@code confidence} field in {@code [0.0, 1.0]}:
     * <ol>
     *   <li>Stub {@code HaLlmService.chat} to return the serialized node.</li>
     *   <li>Assert that {@link NlToDslResponseDTO#confidence()} equals
     *       {@value #EXPECTED_DEFAULT_CONFIDENCE}.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 4.7</strong>
     */
    @Property(tries = 100)
    @Label("Property 8-B: missing or out-of-range confidence defaults to 0.75")
    void propertyB_missingOrInvalidConfidence_defaultsTo0_75(
            @ForAll("dslNodesWithoutValidConfidence") ObjectNode nodeWithoutConfidence)
            throws Exception {

        String jsonString = objectMapper.writeValueAsString(nodeWithoutConfidence);

        when(mockLlm.chat(any(List.class), anyString())).thenReturn(jsonString);

        NlToDslResponseDTO response = service.translateNlToDsl(VALID_REQUEST);

        assertThat(response.confidence())
            .as("Expected default confidence %s but got %s.\n  LLM JSON: %s",
                EXPECTED_DEFAULT_CONFIDENCE, response.confidence(), jsonString)
            .isEqualTo(EXPECTED_DEFAULT_CONFIDENCE);
    }

    // =========================================================================
    // Property C — validation failure falls back to 0.1
    // =========================================================================

    /**
     * <strong>Property C: parse/validate failure falls back to 0.1.</strong>
     *
     * <p>For any string that is either:
     * <ul>
     *   <li>not parseable as a JSON object at all (no balanced {@code {...}}), or</li>
     *   <li>parseable JSON but missing the required {@code query} field</li>
     * </ul>
     * when returned by the LLM stub, the service must return
     * {@link HaSearchService#SAFE_FALLBACK_CONFIDENCE} ({@value #EXPECTED_SAFE_FALLBACK_CONFIDENCE}).
     *
     * <p><strong>Validates: Requirements 4.7</strong>
     */
    @Property(tries = 100)
    @Label("Property 8-C: parse/validate failure returns SafeFallbackConfidence 0.1")
    void propertyC_validationFailure_returnsSafeFallbackConfidence(
            @ForAll("invalidLlmOutputs") String invalidOutput) throws Exception {

        when(mockLlm.chat(any(List.class), anyString())).thenReturn(invalidOutput);

        NlToDslResponseDTO response = service.translateNlToDsl(VALID_REQUEST);

        assertThat(response.confidence())
            .as("Expected safe fallback confidence %s but got %s.\n  LLM output: [%s]",
                EXPECTED_SAFE_FALLBACK_CONFIDENCE, response.confidence(), invalidOutput)
            .isEqualTo(EXPECTED_SAFE_FALLBACK_CONFIDENCE);
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates double values uniformly distributed over the closed interval
     * {@code [0.0, 1.0]}, including both boundary values.
     */
    @Provide
    Arbitrary<Double> validConfidenceValues() {
        return Arbitraries.doubles()
            .between(0.0, true, 1.0, true);
    }

    /**
     * Generates {@link ObjectNode} instances that are structurally valid DSL objects
     * (will pass {@link HaSearchService#isValidQueryDsl}) but do NOT contain a
     * {@code confidence} field in {@code [0.0, 1.0]}.
     *
     * <p>The variants covered are:
     * <ul>
     *   <li>No {@code confidence} field at all.</li>
     *   <li>{@code confidence} field present but with a value just below 0.0
     *       (e.g. {@code -0.01}).</li>
     *   <li>{@code confidence} field present but with a value just above 1.0
     *       (e.g. {@code 1.01}).</li>
     *   <li>{@code confidence} field present as a string instead of a number.</li>
     *   <li>{@code confidence} field present as {@code null}.</li>
     *   <li>{@code confidence} field present as a boolean.</li>
     *   <li>{@code confidence} exactly equal to {@code 2.0} (out of range).</li>
     *   <li>{@code confidence} exactly equal to {@code -1.0} (out of range).</li>
     * </ul>
     */
    @Provide
    Arbitrary<ObjectNode> dslNodesWithoutValidConfidence() {
        return Arbitraries.of(
            noConfidenceNode(),
            confidenceJustBelowZero(),
            confidenceJustAboveOne(),
            confidenceAsString(),
            confidenceAsNull(),
            confidenceAsBoolean(),
            confidenceAtTwo(),
            confidenceAtNegativeOne()
        );
    }

    /**
     * Generates strings that will fail the LLM parse/validate pipeline:
     * <ul>
     *   <li>Strings with no {@code '{'} character (no JSON object to extract).</li>
     *   <li>Valid JSON objects that are missing the required {@code query} field
     *       (DslValidator returns {@code false} for these).</li>
     *   <li>Empty and blank strings.</li>
     * </ul>
     */
    @Provide
    Arbitrary<String> invalidLlmOutputs() {
        // Group 1: strings with no '{' — parser returns Optional.empty()
        Arbitrary<String> noBraceStrings = Arbitraries.strings()
            .withCharRange('a', 'z')
            .ofMinLength(0)
            .ofMaxLength(80);

        // Group 2: valid JSON objects without a 'query' field (DslValidator rejects)
        Arbitrary<String> noQueryJsonObjects = Arbitraries.of(
            "{\"size\":5}",
            "{\"from\":0}",
            "{\"explanation\":\"no query here\"}",
            "{\"confidence\":0.9}",
            "{\"aggs\":{\"terms\":{\"field\":\"category\"}}}"
        );

        // Group 3: blank / whitespace-only strings
        Arbitrary<String> blankStrings = Arbitraries.of("", "  ", "\t", "\n");

        return Arbitraries.oneOf(noBraceStrings, noQueryJsonObjects, blankStrings);
    }

    // =========================================================================
    // ObjectNode factory helpers
    // =========================================================================

    /**
     * Builds a minimal valid DSL node with a {@code query} object field and no
     * {@code confidence} field.
     */
    private ObjectNode buildValidQueryNode() {
        ObjectNode root = objectMapper.createObjectNode();
        root.set("query", objectMapper.createObjectNode()
            .set("match_all", objectMapper.createObjectNode()));
        return root;
    }

    /** Valid DSL node with no {@code confidence} field. */
    private ObjectNode noConfidenceNode() {
        return buildValidQueryNode();
    }

    /** Valid DSL node with {@code confidence = -0.01} (just below valid range). */
    private ObjectNode confidenceJustBelowZero() {
        ObjectNode node = buildValidQueryNode();
        node.put("confidence", -0.01);
        return node;
    }

    /** Valid DSL node with {@code confidence = 1.01} (just above valid range). */
    private ObjectNode confidenceJustAboveOne() {
        ObjectNode node = buildValidQueryNode();
        node.put("confidence", 1.01);
        return node;
    }

    /** Valid DSL node with {@code confidence} as a string (not a number). */
    private ObjectNode confidenceAsString() {
        ObjectNode node = buildValidQueryNode();
        node.put("confidence", "high");
        return node;
    }

    /** Valid DSL node with {@code confidence} as a JSON null. */
    private ObjectNode confidenceAsNull() {
        ObjectNode node = buildValidQueryNode();
        node.putNull("confidence");
        return node;
    }

    /** Valid DSL node with {@code confidence} as a boolean. */
    private ObjectNode confidenceAsBoolean() {
        ObjectNode node = buildValidQueryNode();
        node.put("confidence", true);
        return node;
    }

    /** Valid DSL node with {@code confidence = 2.0} (well above range). */
    private ObjectNode confidenceAtTwo() {
        ObjectNode node = buildValidQueryNode();
        node.put("confidence", 2.0);
        return node;
    }

    /** Valid DSL node with {@code confidence = -1.0} (well below range). */
    private ObjectNode confidenceAtNegativeOne() {
        ObjectNode node = buildValidQueryNode();
        node.put("confidence", -1.0);
        return node;
    }
}
