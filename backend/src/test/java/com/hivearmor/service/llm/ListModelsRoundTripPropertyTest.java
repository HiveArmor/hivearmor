package com.hivearmor.service.llm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based test for the {@code listModels} JSON round-trip.
 *
 * <h3>Property 9: {@code listModels} round-trips the Ollama tag payload</h3>
 * <p>For any JSON payload returned by {@code GET /api/tags} matching Ollama's schema,
 * {@code OllamaLlmProvider.listModels} SHALL return a {@code List<OllamaModel>} whose
 * contents are equivalent (name, size, digest, modifiedAt) to the payload's
 * {@code models} array.
 *
 * <p><strong>Validates: Requirements 3.2, 5.1</strong>
 *
 * <h2>Test strategy</h2>
 * <p>This test operates at the Jackson serialization/deserialization layer — no HTTP
 * server or WireMock is required. The property verifies the round-trip in both
 * directions:
 * <ol>
 *   <li><strong>9-A — serialize then deserialize</strong>: Construct an arbitrary list
 *       of {@link OllamaModel} values, serialize to a {@code {"models": [...]}} JSON
 *       object using {@link ObjectMapper}, deserialize back via
 *       {@link OllamaTagsResponse}, and assert that the deserialized
 *       {@code OllamaTagsResponse#models()} list equals the original list.</li>
 *   <li><strong>9-B — hand-crafted JSON faithfully round-trips</strong>: Construct
 *       a raw JSON string with the Ollama wire format (snake_case {@code modified_at})
 *       and verify the deserialized model fields match the expected values exactly.</li>
 * </ol>
 *
 * <p>The {@link ObjectMapper} used in each trial is configured with
 * {@link JavaTimeModule} to handle {@link Instant} fields — exactly as the application
 * context configures Jackson at runtime (via {@code jackson-datatype-jsr310}).
 *
 * <p>Tests live in {@code src/test/java/} per the project convention.
 */
@Label("Feature: sprint-27-ollama, Property 9: listModels round-trips the Ollama tag payload")
class ListModelsRoundTripPropertyTest {

    /** Jackson mapper shared within each trial; re-created fresh per {@link BeforeTry}. */
    private ObjectMapper mapper;

    /**
     * Builds a fresh {@link ObjectMapper} with {@link JavaTimeModule} registered before
     * every jqwik trial so no state leaks between trials.
     */
    @BeforeTry
    void setUp() {
        mapper = JsonMapper.builder()
                .addModule(new JavaTimeModule())
                .build();
    }

    // =========================================================================
    // Property 9-A: serialize → deserialize round-trip
    // Validates: Requirements 3.2, 5.1
    // =========================================================================

    /**
     * <strong>Property 9-A: serialize then deserialize preserves model contents</strong>
     *
     * <p>For any arbitrary list of {@link OllamaModel} values (1–10 models), serialize
     * the list to a {@code {"models": [...]}} JSON envelope and immediately deserialize
     * it back via {@link OllamaTagsResponse}. The resulting
     * {@link OllamaTagsResponse#models()} list must be equal to the original list with
     * respect to all four fields: {@code name}, {@code size}, {@code digest}, and
     * {@code modifiedAt}.
     *
     * <p>Equality is field-by-field rather than relying on {@code record} equals so
     * the assertion message clearly identifies which field diverges on failure.
     *
     * <p><strong>Validates: Requirements 3.2, 5.1</strong>
     */
    @Property(tries = 200)
    @Label("Property 9-A: serialize then deserialize preserves model contents")
    void property9a_serializeDeserialize_preservesAllModelFields(
            @ForAll("arbitraryModelLists") List<OllamaModel> originalModels) throws Exception {

        // Build the {"models": [...]} envelope that listModels() would receive from Ollama
        String json = mapper.writeValueAsString(Map.of("models", originalModels));

        // Deserialize exactly as OllamaLlmProvider.listModels() does via WebClient
        OllamaTagsResponse response = mapper.readValue(json, OllamaTagsResponse.class);

        assertThat(response.models())
                .as("Deserialized models list must not be null (Req 3.2, 5.1)")
                .isNotNull();
        assertThat(response.models())
                .as("Deserialized models list must have the same size as the original (Req 3.2, 5.1)")
                .hasSize(originalModels.size());

        for (int i = 0; i < originalModels.size(); i++) {
            OllamaModel expected = originalModels.get(i);
            OllamaModel actual   = response.models().get(i);

            assertThat(actual.name())
                    .as("models[%d].name must round-trip unchanged (Req 3.2, 5.1)", i)
                    .isEqualTo(expected.name());

            assertThat(actual.size())
                    .as("models[%d].size must round-trip unchanged (Req 3.2, 5.1)", i)
                    .isEqualTo(expected.size());

            assertThat(actual.digest())
                    .as("models[%d].digest must round-trip unchanged (Req 3.2, 5.1)", i)
                    .isEqualTo(expected.digest());

            assertThat(actual.modifiedAt())
                    .as("models[%d].modifiedAt must round-trip unchanged (Req 3.2, 5.1)", i)
                    .isEqualTo(expected.modifiedAt());
        }
    }

    // =========================================================================
    // Property 9-B: empty models list is preserved as an empty list
    // Validates: Requirements 3.2, 5.1
    // =========================================================================

    /**
     * <strong>Property 9-B: empty models array deserializes to empty list</strong>
     *
     * <p>A tags payload with an empty {@code "models"} array must deserialize to a
     * non-null, empty {@link List} — not {@code null} and not a list with phantom
     * entries.
     *
     * <p><strong>Validates: Requirements 3.2, 5.1</strong>
     */
    @Example
    @Label("Property 9-B: empty models array deserializes to an empty list")
    void property9b_emptyModelsArray_deserializesToEmptyList() throws Exception {
        String json = "{\"models\":[]}";

        OllamaTagsResponse response = mapper.readValue(json, OllamaTagsResponse.class);

        assertThat(response.models())
                .as("An empty models array must deserialize to a non-null empty list (Req 3.2)")
                .isNotNull()
                .isEmpty();
    }

    // =========================================================================
    // Property 9-C: hand-crafted Ollama wire-format JSON round-trip
    // Validates: Requirements 3.2, 5.1
    // =========================================================================

    /**
     * <strong>Property 9-C: Ollama wire-format JSON is faithfully deserialized</strong>
     *
     * <p>Verifies that the JSON produced by the real Ollama server — with
     * snake_case {@code modified_at} — is correctly mapped to the
     * {@link OllamaModel} record fields via the {@code @JsonProperty("modified_at")}
     * annotation. The test uses a representative JSON fixture that mirrors the Ollama
     * {@code GET /api/tags} response schema documented in the design.
     *
     * <p><strong>Validates: Requirements 3.2, 5.1</strong>
     */
    @Example
    @Label("Property 9-C: Ollama wire-format JSON with modified_at is faithfully deserialized")
    void property9c_ollamaWireFormatJson_deserializesCorrectly() throws Exception {
        String json = """
                {
                  "models": [
                    {
                      "name": "llama3.2:3b",
                      "size": "2019393189",
                      "digest": "sha256:a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72",
                      "modified_at": "2024-07-25T12:00:00Z"
                    },
                    {
                      "name": "mistral:7b",
                      "size": "4108916688",
                      "digest": "sha256:61e88e884507ba5e06c49b40e6226379ed8a02d47a175be62ca00c430e0a0f7a",
                      "modified_at": "2024-07-20T09:30:00Z"
                    }
                  ]
                }
                """;

        OllamaTagsResponse response = mapper.readValue(json, OllamaTagsResponse.class);

        assertThat(response.models()).hasSize(2);

        OllamaModel first = response.models().get(0);
        assertThat(first.name())
                .as("First model name must be 'llama3.2:3b'")
                .isEqualTo("llama3.2:3b");
        assertThat(first.size())
                .as("First model size must be '2019393189'")
                .isEqualTo("2019393189");
        assertThat(first.digest())
                .as("First model digest must match")
                .isEqualTo("sha256:a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72");
        assertThat(first.modifiedAt())
                .as("First model modifiedAt must parse the ISO-8601 timestamp via JavaTimeModule")
                .isEqualTo(Instant.parse("2024-07-25T12:00:00Z"));

        OllamaModel second = response.models().get(1);
        assertThat(second.name())
                .as("Second model name must be 'mistral:7b'")
                .isEqualTo("mistral:7b");
        assertThat(second.modifiedAt())
                .as("Second model modifiedAt must parse correctly")
                .isEqualTo(Instant.parse("2024-07-20T09:30:00Z"));
    }

    // =========================================================================
    // Property 9-D: OllamaTagsResponse.models() order is preserved
    // Validates: Requirements 3.2, 5.1
    // =========================================================================

    /**
     * <strong>Property 9-D: model list order is preserved through deserialization</strong>
     *
     * <p>The {@code models} array in the Ollama payload is ordered (typically by
     * modification date). After deserialization the order of models in the resulting
     * list must match the order in the JSON array — no sorting or deduplication must
     * occur.
     *
     * <p><strong>Validates: Requirements 3.2, 5.1</strong>
     */
    @Property(tries = 200)
    @Label("Property 9-D: model list order is preserved through deserialization")
    void property9d_modelListOrder_isPreservedAfterDeserialization(
            @ForAll("arbitraryModelLists") List<OllamaModel> originalModels) throws Exception {

        String json = mapper.writeValueAsString(Map.of("models", originalModels));
        OllamaTagsResponse response = mapper.readValue(json, OllamaTagsResponse.class);

        List<String> expectedNames = originalModels.stream()
                .map(OllamaModel::name)
                .toList();
        List<String> actualNames = response.models().stream()
                .map(OllamaModel::name)
                .toList();

        assertThat(actualNames)
                .as("Model name order must be preserved through deserialization (Req 3.2, 5.1)")
                .isEqualTo(expectedNames);
    }

    // =========================================================================
    // Arbitraries (generators)
    // =========================================================================

    /**
     * Generates lists of 1–10 arbitrary {@link OllamaModel} values.
     *
     * <p>Each model is built from:
     * <ul>
     *   <li>{@code name} — a printable ASCII identifier, 1–64 chars (e.g. "llama3.2:3b")</li>
     *   <li>{@code size} — a non-negative long serialized as a string (Ollama returns
     *       sizes as numeric strings, mapped to {@code String} in {@link OllamaModel})</li>
     *   <li>{@code digest} — a non-empty ASCII string, 1–80 chars (e.g. "sha256:...")</li>
     *   <li>{@code modifiedAt} — a valid {@link Instant} truncated to seconds
     *       (ISO-8601 timestamps have second precision in Ollama responses)</li>
     * </ul>
     *
     * <p>Truncating to seconds is necessary because Jackson's {@link JavaTimeModule}
     * serializes/deserializes {@link Instant} from ISO-8601 strings like
     * {@code "2024-07-25T12:00:00Z"} — sub-second precision is preserved only when
     * the value has a non-zero nano component and the mapper is configured to
     * {@code WRITE_DATES_AS_TIMESTAMPS=false}. The default configuration writes ISO-8601
     * strings which preserve milliseconds but not nanoseconds. Truncating to millis
     * avoids the sub-millisecond mismatch.
     */
    @Provide
    Arbitrary<List<OllamaModel>> arbitraryModelLists() {
        Arbitrary<OllamaModel> model = Combinators.combine(
                modelNames(),
                modelSizes(),
                modelDigests(),
                modifiedAtInstants()
        ).as(OllamaModel::new);

        return model.list().ofMinSize(1).ofMaxSize(10);
    }

    /**
     * Generates model name strings using alphanumeric characters plus {@code :}, {@code .},
     * and {@code -} to match typical Ollama model identifiers like {@code llama3.2:3b}.
     */
    private Arbitrary<String> modelNames() {
        return Arbitraries.strings()
                .withCharRange('a', 'z')
                .withCharRange('A', 'Z')
                .withCharRange('0', '9')
                .withChars(":.-_")
                .ofMinLength(1)
                .ofMaxLength(64);
    }

    /**
     * Generates model size strings. Ollama returns sizes as bare numeric strings, and
     * {@link OllamaModel#size()} is typed as {@code String}, so we serialize the
     * underlying non-negative long as a decimal string to match the wire format.
     */
    private Arbitrary<String> modelSizes() {
        return Arbitraries.longs()
                .between(0L, Long.MAX_VALUE)
                .map(Object::toString);
    }

    /**
     * Generates model digest strings using alphanumeric characters plus {@code :}
     * and {@code -} to match typical SHA-256 digest identifiers like
     * {@code sha256:a80c4f17...}.
     */
    private Arbitrary<String> modelDigests() {
        return Arbitraries.strings()
                .withCharRange('a', 'f')
                .withCharRange('0', '9')
                .withChars(":")
                .ofMinLength(1)
                .ofMaxLength(80);
    }

    /**
     * Generates {@link Instant} values truncated to milliseconds so that the
     * Jackson ISO-8601 round-trip is lossless. Nanosecond precision beyond
     * milliseconds is not preserved in the default Jackson ISO-8601 output.
     *
     * <p>Range: 1970-01-01T00:00:00Z to 2099-12-31T23:59:59Z — covers all plausible
     * Ollama model modification timestamps.
     */
    private Arbitrary<Instant> modifiedAtInstants() {
        long epochMillisMin = Instant.parse("1970-01-01T00:00:00Z").toEpochMilli();
        long epochMillisMax = Instant.parse("2099-12-31T23:59:59Z").toEpochMilli();
        return Arbitraries.longs()
                .between(epochMillisMin, epochMillisMax)
                .map(Instant::ofEpochMilli)
                .map(i -> i.truncatedTo(ChronoUnit.MILLIS));
    }
}
