package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.web.rest.dto.NlToDslRequestDTO;
import com.hivearmor.web.rest.dto.NlToDslResponseDTO;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

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
 * <p>Three properties exercising the confidence-extraction logic inside
 * {@link HaSearchService#translateNlToDsl}:
 * <ul>
 *   <li><strong>Property A</strong> — when the LLM response JSON contains a top-level
 *       {@code confidence} field in {@code [0.0, 1.0]}, the DTO confidence equals that
 *       value (within 0.001 tolerance).</li>
 *   <li><strong>Property B</strong> — when the LLM response JSON has no {@code confidence}
 *       field or a value outside {@code [0.0, 1.0]}, the DTO confidence equals {@code 0.75}
 *       (the {@code DEFAULT_CONFIDENCE}).</li>
 *   <li><strong>Property C</strong> — when the LLM output fails parse/validation, the DTO
 *       confidence equals {@code 0.1} ({@code SAFE_FALLBACK_CONFIDENCE}).</li>
 * </ul>
 *
 * <h3>NoGetFirstInvariant</h3>
 * <p>No {@code .getFirst()} call appears in this file; all list indexing uses
 * {@code .get(0)} per the Java 17 compatibility rule.
 */
@Label("Feature: sprint-26-nl-search, Property 8: Confidence extraction falls back to 0.75")
class HaSearchServiceConfidencePropertyTest {

    // -------------------------------------------------------------------------
    // Fixtures — re-created before every jqwik trial
    // -------------------------------------------------------------------------

    /**
     * Shared static ObjectMapper for use inside @Provide methods.
     * @Provide methods are invoked before @BeforeTry, so the instance field
     * would be null if used here. A static instance is safe because ObjectMapper
     * is thread-safe for read operations and we only call createObjectNode().
     */
    private static final ObjectMapper SHARED_MAPPER = new ObjectMapper();

    private ObjectMapper objectMapper;
    private HaLlmService mockLlm;
    private HaSearchService service;

    /** Fixed valid request used across all three properties. */
    private static final NlToDslRequestDTO VALID_REQUEST =
        new NlToDslRequestDTO("failed logins", "v3-hive-alert-*");

    /** Floating-point tolerance for Property A confidence comparisons. */
    private static final double CONFIDENCE_TOLERANCE = 0.001;

    /** Expected default confidence when a valid DSL lacks an explicit confidence field. */
    private static final double EXPECTED_DEFAULT_CONFIDENCE = 0.75;

    /** Expected safe-fallback confidence when parse or validation fails. */
    private static final double EXPECTED_SAFE_FALLBACK_CONFIDENCE = 0.1;

    /**
     * Re-initialises the mock and service before every jqwik trial so that
     * stub state from one trial cannot leak into the next.
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
     * <strong>Property A: valid confidence in [0.0, 1.0] is propagated directly.</strong>
     *
     * <p>For any double {@code c ∈ [0.0, 1.0]}, build a valid DSL node with
     * {@code "confidence": c} and stub the LLM to return its JSON serialization.
     * The returned {@link NlToDslResponseDTO#confidence()} must be within
     * {@value #CONFIDENCE_TOLERANCE} of {@code c}.
     *
     * <p><strong>Validates: Requirements 4.7</strong>
     */
    @Property(tries = 100)
    @Label("Property 8-A: confidence in [0.0, 1.0] is propagated directly to the response")
    void propertyA_validConfidence_usedDirectly(
            @ForAll("validConfidenceValues") double injectedConfidence) throws Exception {

        ObjectNode node = buildValidQueryNode();
        node.put("confidence", injectedConfidence);
        String jsonString = objectMapper.writeValueAsString(node);

        when(mockLlm.chat(any(List.class), anyString())).thenReturn(jsonString);

        NlToDslResponseDTO response = service.translateNlToDsl(VALID_REQUEST);

        assertThat(response.confidence())
            .as("Expected confidence %.6f (tolerance ±%.3f) but got %.6f.%n  LLM JSON: %s",
                injectedConfidence, CONFIDENCE_TOLERANCE, response.confidence(), jsonString)
            .isCloseTo(injectedConfidence, org.assertj.core.data.Offset.offset(CONFIDENCE_TOLERANCE));
    }

    // =========================================================================
    // Property B — missing / out-of-range confidence defaults to 0.75
    // =========================================================================

    /**
     * <strong>Property B: missing or out-of-range confidence defaults to 0.75.</strong>
     *
     * <p>For any structurally valid DSL node that either has no {@code confidence}
     * field or whose {@code confidence} value is outside {@code [0.0, 1.0]}, the
     * returned {@link NlToDslResponseDTO#confidence()} must equal
     * {@value #EXPECTED_DEFAULT_CONFIDENCE}.
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
            .as("Expected default confidence %s but got %s.%n  LLM JSON: %s",
                EXPECTED_DEFAULT_CONFIDENCE, response.confidence(), jsonString)
            .isEqualTo(EXPECTED_DEFAULT_CONFIDENCE);
    }

    // =========================================================================
    // Property C — parse / validate failure falls back to 0.1
    // =========================================================================

    /**
     * <strong>Property C: parse/validate failure returns SafeFallbackConfidence 0.1.</strong>
     *
     * <p>For any LLM output string that either cannot be parsed as a JSON object or
     * fails {@link HaSearchService#isValidQueryDsl} (e.g., missing {@code query}
     * field), the returned {@link NlToDslResponseDTO#confidence()} must equal
     * {@value #EXPECTED_SAFE_FALLBACK_CONFIDENCE}.
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
            .as("Expected safe fallback confidence %s but got %s.%n  LLM output: [%s]",
                EXPECTED_SAFE_FALLBACK_CONFIDENCE, response.confidence(), invalidOutput)
            .isEqualTo(EXPECTED_SAFE_FALLBACK_CONFIDENCE);
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates double values uniformly over the closed interval {@code [0.0, 1.0]},
     * including both boundary values.
     */
    @Provide
    Arbitrary<Double> validConfidenceValues() {
        return Arbitraries.doubles()
            .between(0.0, true, 1.0, true);
    }

    /**
     * Generates {@link ObjectNode} instances that are structurally valid DSL objects
     * (pass {@code isValidQueryDsl}) but have no {@code confidence} field in
     * {@code [0.0, 1.0]}.
     *
     * <p>Variants covered: no confidence field; confidence as string; confidence as
     * null; confidence as boolean; confidence just below 0.0; confidence just above
     * 1.0; confidence = 2.0; confidence = -1.0.
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
     * Generates strings that fail the LLM parse/validate pipeline and therefore
     * trigger the {@code safeFallback()} path (confidence = 0.1).
     *
     * <p>Two categories are covered:
     * <ul>
     *   <li><strong>No-brace strings</strong> — contain no {@code '{'} character, so
     *       {@code parseLlmResponse} cannot find a JSON object and returns
     *       {@code Optional.empty()}, causing {@code safeFallback()}.</li>
     *   <li><strong>JSON with a script clause</strong> — parsed as a JSON object but
     *       {@code isValidQueryDsl} rejects it because a {@code "script"} key is
     *       present at some depth, again causing {@code safeFallback()}.</li>
     * </ul>
     *
     * <p>Note: JSON objects that merely lack a {@code query} field are NOT invalid per
     * {@link HaSearchService#isValidQueryDsl} — that validator only rejects {@code query}
     * when the field is present but is not a JSON object. So those strings would produce
     * confidence 0.75 (the default), not 0.1, and must not appear in this provider.
     */
    @Provide
    Arbitrary<String> invalidLlmOutputs() {
        // Group 1: strings with no '{' character — parser returns Optional.empty()
        Arbitrary<String> noBraceStrings = Arbitraries.strings()
            .withCharRange('a', 'z')
            .ofMinLength(1)
            .ofMaxLength(80);

        // Group 2: JSON with a 'script' key — DslValidator rejects it
        // The query field is present and valid, but the script clause at any depth fails.
        Arbitrary<String> scriptJsonObjects = Arbitraries.of(
            "{\"query\":{\"script\":{\"source\":\"doc['field'].value > 0\"}}}",
            "{\"query\":{\"bool\":{\"filter\":[{\"script\":{\"source\":\"true\"}}]}}}",
            "{\"query\":{\"match_all\":{}},\"script\":{\"lang\":\"painless\"}}"
        );

        // Group 3: blank / whitespace-only — parseLlmResponse returns Optional.empty()
        Arbitrary<String> blankStrings = Arbitraries.of("", "  ", "\t", "\n");

        return Arbitraries.oneOf(noBraceStrings, scriptJsonObjects, blankStrings);
    }

    // =========================================================================
    // ObjectNode factory helpers
    // =========================================================================

    /** Builds a minimal valid DSL node with a {@code query} field and no {@code confidence}. */
    private ObjectNode buildValidQueryNode() {
        ObjectNode root = SHARED_MAPPER.createObjectNode();
        root.set("query", SHARED_MAPPER.createObjectNode()
            .set("match_all", SHARED_MAPPER.createObjectNode()));
        return root;
    }

    /** Valid DSL with no {@code confidence} field. */
    private ObjectNode noConfidenceNode() {
        return buildValidQueryNode();
    }

    /** Valid DSL with {@code confidence = -0.01} (below valid range). */
    private ObjectNode confidenceJustBelowZero() {
        ObjectNode n = buildValidQueryNode();
        n.put("confidence", -0.01);
        return n;
    }

    /** Valid DSL with {@code confidence = 1.01} (above valid range). */
    private ObjectNode confidenceJustAboveOne() {
        ObjectNode n = buildValidQueryNode();
        n.put("confidence", 1.01);
        return n;
    }

    /** Valid DSL with {@code confidence} as a string literal. */
    private ObjectNode confidenceAsString() {
        ObjectNode n = buildValidQueryNode();
        n.put("confidence", "high");
        return n;
    }

    /** Valid DSL with {@code confidence} as JSON {@code null}. */
    private ObjectNode confidenceAsNull() {
        ObjectNode n = buildValidQueryNode();
        n.putNull("confidence");
        return n;
    }

    /** Valid DSL with {@code confidence} as a boolean. */
    private ObjectNode confidenceAsBoolean() {
        ObjectNode n = buildValidQueryNode();
        n.put("confidence", true);
        return n;
    }

    /** Valid DSL with {@code confidence = 2.0} (well above range). */
    private ObjectNode confidenceAtTwo() {
        ObjectNode n = buildValidQueryNode();
        n.put("confidence", 2.0);
        return n;
    }

    /** Valid DSL with {@code confidence = -1.0} (well below range). */
    private ObjectNode confidenceAtNegativeOne() {
        ObjectNode n = buildValidQueryNode();
        n.put("confidence", -1.0);
        return n;
    }
}
