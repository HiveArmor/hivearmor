package com.hivearmor.service.llm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import reactor.core.publisher.Flux;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Property 8: pullModel yields every progress record in order.
 *
 * <p><strong>Property 8: pullModel yields every progress record in order</strong><br>
 * For any NDJSON progress stream returned from {@code /api/pull} on Ollama,
 * {@link OllamaLlmProvider#pullModel(String)} SHALL emit an
 * {@link OllamaPullProgress} value for every input record in the same order
 * as received.
 *
 * <p>This test operates at the NDJSON decoding level, exercising
 * {@link OllamaLlmProvider#decodeNdjson(Flux)} and the subsequent
 * {@code map(node -> mapper.convertValue(node, OllamaPullProgress.class))}
 * pipeline step directly — no WireMock or network I/O required.
 *
 * <h2>Test strategy</h2>
 * <ol>
 *   <li><strong>8-A</strong> — For any list of 1–20 {@link OllamaPullProgress}
 *       records, serialise each to JSON, join with newlines to form an NDJSON
 *       string, wrap in a single {@link DataBuffer}, run through
 *       {@code decodeNdjson} + {@code convertValue}, and assert the output list
 *       equals the input list in exact order.</li>
 *   <li><strong>8-B</strong> — Same round-trip but the NDJSON is split across
 *       multiple {@link DataBuffer} chunks (simulating TCP fragmentation), to
 *       verify that the line-buffering logic in {@code decodeNdjson} handles
 *       partial chunks correctly.</li>
 *   <li><strong>8-C</strong> — A single-record stream (minimum size) always
 *       yields exactly one value equal to the input.</li>
 * </ol>
 *
 * <p>The {@link OllamaLlmProvider} instance is constructed with a real
 * {@link ObjectMapper} and a {@code null} {@link java.time.Clock} and
 * {@code null} repository — only the {@code decodeNdjson} and
 * {@code convertValue} paths are exercised, which have no dependency on
 * those fields.
 *
 * <p><strong>Validates: Requirements 3.3, 7.2</strong>
 */
@Label("Feature: sprint-27-ollama, Property 8: pullModel yields every progress record in order")
class PullModelOrderingPropertyTest {

    private ObjectMapper mapper;
    private OllamaLlmProvider provider;

    /**
     * Re-creates shared state before every jqwik trial so no state leaks
     * between property executions.
     *
     * <p>The {@link OllamaLlmProvider} constructor calls {@code loadConfig()},
     * which reads from the repository. We stub it to return empty so that all
     * config fields are null/blank — the only paths exercised by this test are
     * {@code decodeNdjson} and {@code convertValue}, which have no dependency
     * on those config values.
     */
    @BeforeTry
    void setUp() {
        mapper = new ObjectMapper().findAndRegisterModules();

        UtmConfigurationParameterRepository configRepo =
                mock(UtmConfigurationParameterRepository.class);
        when(configRepo.findByConfParamShort(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(Optional.empty());

        // Clock is not needed by decodeNdjson or convertValue; pass null.
        provider = new OllamaLlmProvider(mapper, null, configRepo);
    }

    // =========================================================================
    // Property 8-A: single-buffer NDJSON round-trip preserves order
    // =========================================================================

    /**
     * <strong>Property 8-A: NDJSON round-trip in a single DataBuffer preserves
     * the exact input order</strong>
     *
     * <p>For any list of 1–20 arbitrarily generated {@link OllamaPullProgress}
     * records, serialises each record to a JSON object, concatenates them with
     * {@code '\n'} as separator, places the entire result in one
     * {@link DataBuffer}, feeds that through {@code decodeNdjson}, and asserts
     * that the decoded-and-converted output list equals the input list in exact
     * element order.
     *
     * <p><strong>Validates: Requirements 3.3, 7.2</strong>
     */
    @Property(tries = 200)
    @Label("Property 8-A: single-buffer NDJSON round-trip preserves order")
    void property8a_singleBuffer_ndjsonRoundTrip_preservesOrder(
            @ForAll("pullProgressLists") List<OllamaPullProgress> inputRecords) {

        // Serialize each record to a JSON line and join with newlines
        String ndjson = toNdjson(inputRecords);

        // Wrap in a single DataBuffer
        DataBuffer buffer = toDataBuffer(ndjson);

        // Run through decodeNdjson then convertValue — same pipeline as pullModel
        List<OllamaPullProgress> output = provider
                .decodeNdjson(Flux.just(buffer))
                .map(node -> mapper.convertValue(node, OllamaPullProgress.class))
                .collectList()
                .block();

        assertThat(output)
                .as("decodeNdjson (single buffer) must preserve all %d records in order.\n"
                        + "  Input:  %s\n  Output: %s", inputRecords.size(), inputRecords, output)
                .isNotNull()
                .hasSize(inputRecords.size())
                .containsExactlyElementsOf(inputRecords);
    }

    // =========================================================================
    // Property 8-B: multi-chunk NDJSON round-trip preserves order
    // =========================================================================

    /**
     * <strong>Property 8-B: NDJSON split across multiple DataBuffer chunks
     * preserves the exact input order</strong>
     *
     * <p>Simulates TCP fragmentation: the NDJSON string is split into individual
     * byte chunks of size 1 (worst case — one byte per buffer), so every call to
     * the {@code decodeNdjson} subscriber must accumulate partial line content
     * before emitting a complete JSON node. Asserts the same ordering guarantee
     * as Property 8-A.
     *
     * <p>Uses 100 tries (instead of 200) because byte-level splitting is
     * proportionally more expensive for larger lists.
     *
     * <p><strong>Validates: Requirements 3.3, 7.2</strong>
     */
    @Property(tries = 100)
    @Label("Property 8-B: multi-chunk NDJSON round-trip preserves order")
    void property8b_multiChunk_ndjsonRoundTrip_preservesOrder(
            @ForAll("pullProgressLists") List<OllamaPullProgress> inputRecords) {

        String ndjson = toNdjson(inputRecords);

        // Split into one-byte DataBuffer chunks to stress the line-buffering logic
        byte[] bytes = ndjson.getBytes(StandardCharsets.UTF_8);
        Flux<DataBuffer> chunked = Flux.fromArray(toByteBuffers(bytes));

        List<OllamaPullProgress> output = provider
                .decodeNdjson(chunked)
                .map(node -> mapper.convertValue(node, OllamaPullProgress.class))
                .collectList()
                .block();

        assertThat(output)
                .as("decodeNdjson (multi-chunk) must preserve all %d records in order.\n"
                        + "  Input:  %s\n  Output: %s", inputRecords.size(), inputRecords, output)
                .isNotNull()
                .hasSize(inputRecords.size())
                .containsExactlyElementsOf(inputRecords);
    }

    // =========================================================================
    // Property 8-C: single-record stream emits exactly one equal record
    // =========================================================================

    /**
     * <strong>Property 8-C: single-record NDJSON stream yields exactly one equal
     * output record</strong>
     *
     * <p>For any single {@link OllamaPullProgress} record, the decoded output list
     * must have exactly one element, and that element must equal the input.
     *
     * <p><strong>Validates: Requirements 3.3, 7.2</strong>
     */
    @Property(tries = 200)
    @Label("Property 8-C: single-record NDJSON stream yields exactly one equal record")
    void property8c_singleRecord_yieldsExactlyOneEqualRecord(
            @ForAll("singlePullProgress") OllamaPullProgress inputRecord) {

        String ndjson = toNdjson(List.of(inputRecord));
        DataBuffer buffer = toDataBuffer(ndjson);

        List<OllamaPullProgress> output = provider
                .decodeNdjson(Flux.just(buffer))
                .map(node -> mapper.convertValue(node, OllamaPullProgress.class))
                .collectList()
                .block();

        assertThat(output)
                .as("Single-record NDJSON must yield exactly one record equal to the input.\n"
                        + "  Input:  %s\n  Output: %s", inputRecord, output)
                .isNotNull()
                .hasSize(1)
                .containsExactly(inputRecord);
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates lists of 1–20 {@link OllamaPullProgress} records with arbitrary
     * (but valid) field values, including null entries for optional fields.
     *
     * <p>The {@code status} field is always non-null (Ollama always includes a
     * status string). The {@code total}, {@code completed}, and {@code digest}
     * fields mirror Ollama's actual NDJSON schema where these are optional.
     */
    @Provide
    Arbitrary<List<OllamaPullProgress>> pullProgressLists() {
        return singlePullProgress().list().ofMinSize(1).ofMaxSize(20);
    }

    /**
     * Generates a single {@link OllamaPullProgress} with:
     * <ul>
     *   <li>{@code status} — a non-null, non-empty string drawn from realistic
     *       Ollama status values plus arbitrary alphanumeric strings.</li>
     *   <li>{@code total} — a positive {@code Long} or {@code null} (20 % chance).</li>
     *   <li>{@code completed} — a non-negative {@code Long} or {@code null} (20 % chance).</li>
     *   <li>{@code digest} — a short alphanumeric string or {@code null} (30 % chance).</li>
     * </ul>
     */
    @Provide
    Arbitrary<OllamaPullProgress> singlePullProgress() {
        Arbitrary<String> knownStatus = Arbitraries.of(
                "pulling manifest",
                "downloading",
                "verifying sha256 digest",
                "writing manifest",
                "removing any unused layers",
                "success");
        Arbitrary<String> arbitraryStatus = Arbitraries.strings().alpha().ofMinLength(1).ofMaxLength(40);
        Arbitrary<String> status = Arbitraries.oneOf(knownStatus, arbitraryStatus);

        Arbitrary<Long> total = Arbitraries.longs().between(1L, 10_000_000_000L)
                .injectNull(0.2);

        Arbitrary<Long> completed = Arbitraries.longs().between(0L, 10_000_000_000L)
                .injectNull(0.2);

        Arbitrary<String> digest = Arbitraries.strings().alpha().ofMinLength(8).ofMaxLength(64)
                .injectNull(0.3);

        return Combinators.combine(status, total, completed, digest)
                .as(OllamaPullProgress::new);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Serialises a list of {@link OllamaPullProgress} records to an NDJSON string
     * (one JSON object per line, separated by {@code '\n'}).
     *
     * <p>Uses the same {@link ObjectMapper} instance as the provider under test so
     * that serialisation and deserialisation use identical configuration.
     */
    private String toNdjson(List<OllamaPullProgress> records) {
        StringBuilder sb = new StringBuilder();
        for (OllamaPullProgress record : records) {
            try {
                // Serialise the record to a JSON object.  We build the node manually
                // to avoid null-field omission issues — OllamaPullProgress fields are
                // individually nullable and must survive a round-trip including nulls.
                ObjectNode node = mapper.createObjectNode();
                if (record.status()    != null) node.put("status",    record.status());
                else                             node.putNull("status");
                if (record.total()     != null) node.put("total",     record.total());
                else                             node.putNull("total");
                if (record.completed() != null) node.put("completed", record.completed());
                else                             node.putNull("completed");
                if (record.digest()    != null) node.put("digest",    record.digest());
                else                             node.putNull("digest");
                sb.append(mapper.writeValueAsString(node)).append('\n');
            } catch (Exception e) {
                throw new IllegalStateException("Failed to serialise OllamaPullProgress: " + record, e);
            }
        }
        return sb.toString();
    }

    /**
     * Wraps a string in a single {@link DataBuffer} using the default factory.
     */
    private static DataBuffer toDataBuffer(String content) {
        DefaultDataBufferFactory factory = new DefaultDataBufferFactory();
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        DataBuffer buffer = factory.allocateBuffer(bytes.length);
        buffer.write(bytes);
        return buffer;
    }

    /**
     * Splits a byte array into individual one-byte {@link DataBuffer} chunks.
     *
     * <p>This is the worst-case TCP fragmentation scenario for the line-buffering
     * logic inside {@code decodeNdjson}.
     */
    private static DataBuffer[] toByteBuffers(byte[] bytes) {
        DefaultDataBufferFactory factory = new DefaultDataBufferFactory();
        DataBuffer[] buffers = new DataBuffer[bytes.length];
        for (int i = 0; i < bytes.length; i++) {
            DataBuffer buf = factory.allocateBuffer(1);
            buf.write(new byte[]{bytes[i]});
            buffers[i] = buf;
        }
        return buffers;
    }
}
