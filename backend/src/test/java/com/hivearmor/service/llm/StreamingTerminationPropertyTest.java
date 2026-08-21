package com.hivearmor.service.llm;

import com.fasterxml.jackson.databind.ObjectMapper;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import reactor.core.publisher.Flux;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Property 1: Streaming chat stops exactly at {@code done: true}.
 *
 * <p><strong>Property 1: Streaming chat stops exactly at {@code done: true}</strong><br>
 * For any NDJSON stream returned from {@code /api/chat} on Ollama that contains a frame
 * with {@code "done": true} at position {@code k}, {@link OllamaLlmProvider#streamChat}
 * SHALL emit the message-content deltas from frames {@code [0, k)} and consume no bytes
 * past the {@code done: true} frame, regardless of any additional bytes appended after
 * that frame.
 *
 * <p>The test exercises the {@link OllamaLlmProvider#decodeNdjson} method (package-accessible)
 * directly, followed by the same {@code takeUntil(done) → filter(!done)} pipeline used in
 * production, so no HTTP server (WireMock) is needed.
 *
 * <p>Tests live in {@code src/main/java/} per the project convention (no
 * {@code src/test/} directory).
 *
 * <p><strong>Validates: Requirements 3.1</strong>
 */
@Label("Feature: sprint-27-ollama, Task 3.7 — Property 1: streaming termination at done:true")
class StreamingTerminationPropertyTest {

    private static final DefaultDataBufferFactory BUFFER_FACTORY = new DefaultDataBufferFactory();
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /**
     * A minimal {@link OllamaLlmProvider} instance built without a Spring context.
     * Re-created before every trial to prevent state leakage.
     */
    private OllamaLlmProvider provider;

    /**
     * Constructs a fresh {@link OllamaLlmProvider} before every jqwik trial using the
     * package-accessible constructor directly. Clock and configRepo are mocked because
     * the NDJSON pipeline under test never touches either.
     */
    @BeforeTry
    void setUp() throws Exception {
        // OllamaLlmProvider's constructor calls configRepo.findByConfParamShort for each
        // config key — we supply a mock that returns Optional.empty() for all keys so the
        // instance initialises without a database.
        com.hivearmor.repository.UtmConfigurationParameterRepository configRepo =
            mock(com.hivearmor.repository.UtmConfigurationParameterRepository.class);
        Clock clock = Clock.systemUTC();
        provider = new OllamaLlmProvider(OBJECT_MAPPER, clock, configRepo);
    }

    // =========================================================================
    // Property 1: exactly k frames emitted before done:true, none after
    // =========================================================================

    /**
     * <strong>Property 1: exactly k frames emitted, none beyond done:true</strong>
     *
     * <p>For any NDJSON sequence where position {@code k} contains
     * {@code {"message":{"content":"..."},"done":true}} and positions
     * {@code [0..k)} are content frames with {@code done:false}, followed by
     * an arbitrary number of "tail" frames appended after the terminal frame,
     * the pipeline must emit exactly {@code k} content strings and complete.
     *
     * <p><strong>Validates: Requirements 3.1</strong>
     */
    @Property(tries = 200)
    @Label("Property 1: pipeline emits exactly k frames before done:true and stops")
    void property1_streamStopsExactlyAtDoneTrue(
            @ForAll("ndjsonSequencesWithDone") NdjsonScenario scenario) {

        // Build the NDJSON byte stream from the pre-built lines
        Flux<DataBuffer> buffers = ndjsonToBuffers(scenario.allLines());

        // Apply the same pipeline as OllamaLlmProvider.streamChat
        List<String> emitted = provider.decodeNdjson(buffers)
                .takeUntil(node -> node.path("done").asBoolean(false))
                .filter(node -> !node.path("done").asBoolean(false))
                .map(node -> node.path("message").path("content").asText(""))
                .collectList()
                .block();

        assertThat(emitted)
                .as("Pipeline must emit exactly k=%d content frames (frames before done:true); "
                    + "got %d. Scenario: k=%d, tailCount=%d",
                    scenario.k(), emitted == null ? -1 : emitted.size(),
                    scenario.k(), scenario.tailCount())
                .isNotNull()
                .hasSize(scenario.k());

        // Each emitted element must match the expected content delta
        for (int i = 0; i < scenario.k(); i++) {
            String expected = scenario.expectedContents().get(i);
            assertThat(emitted.get(i))
                    .as("Frame %d content must match expected delta '%s'", i, expected)
                    .isEqualTo(expected);
        }
    }

    /**
     * <strong>Property 1 (edge): k=0 means the first frame is done:true → zero emissions</strong>
     *
     * <p>When the very first frame in the stream is {@code done:true}, the pipeline
     * must emit nothing (empty list) and complete immediately.
     *
     * <p><strong>Validates: Requirements 3.1</strong>
     */
    @Property(tries = 50)
    @Label("Property 1 (edge): k=0, first frame is done:true, zero emissions")
    void property1_edge_kIsZero_noFramesEmitted(
            @ForAll("tailOnlySequences") NdjsonScenario scenario) {

        Flux<DataBuffer> buffers = ndjsonToBuffers(scenario.allLines());

        List<String> emitted = provider.decodeNdjson(buffers)
                .takeUntil(node -> node.path("done").asBoolean(false))
                .filter(node -> !node.path("done").asBoolean(false))
                .map(node -> node.path("message").path("content").asText(""))
                .collectList()
                .block();

        assertThat(emitted)
                .as("k=0: done:true is the first frame, so no content must be emitted; "
                    + "tailCount=%d", scenario.tailCount())
                .isNotNull()
                .isEmpty();
    }

    /**
     * <strong>Property 1 (no tail): stream terminates normally when there are no extra
     * frames after done:true</strong>
     *
     * <p>Verifies that the property holds even when there are no bytes after the
     * terminal frame (the common, well-behaved Ollama case).
     *
     * <p><strong>Validates: Requirements 3.1</strong>
     */
    @Property(tries = 100)
    @Label("Property 1 (no tail): k frames emitted, stream ends at done:true with no trailing bytes")
    void property1_noTail_kFramesEmitted(
            @ForAll("ndjsonSequencesNoTail") NdjsonScenario scenario) {

        Flux<DataBuffer> buffers = ndjsonToBuffers(scenario.allLines());

        List<String> emitted = provider.decodeNdjson(buffers)
                .takeUntil(node -> node.path("done").asBoolean(false))
                .filter(node -> !node.path("done").asBoolean(false))
                .map(node -> node.path("message").path("content").asText(""))
                .collectList()
                .block();

        assertThat(emitted)
                .as("No-tail scenario must emit exactly k=%d frames", scenario.k())
                .isNotNull()
                .hasSize(scenario.k());
    }

    // =========================================================================
    // Arbitrary providers — NDJSON generators
    // =========================================================================

    /**
     * Generates {@link NdjsonScenario} instances where:
     * <ul>
     *   <li>Positions {@code [0, k)} are content frames ({@code done:false})</li>
     *   <li>Position {@code k} is the terminal frame ({@code done:true})</li>
     *   <li>After position {@code k}, {@code tailCount >= 1} additional frames are appended</li>
     * </ul>
     * {@code k} ranges from 0 to 19; {@code tailCount} from 1 to 10.
     */
    @Provide
    Arbitrary<NdjsonScenario> ndjsonSequencesWithDone() {
        Arbitrary<Integer> kArb = Arbitraries.integers().between(0, 19);
        Arbitrary<Integer> tailArb = Arbitraries.integers().between(1, 10);
        // Use only safe printable ASCII letters/digits/spaces — avoids JSON escaping surprises.
        Arbitrary<String> contentArb = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-_:;")
                .ofMinLength(0).ofMaxLength(80);

        return Combinators.combine(kArb, tailArb, contentArb.list().ofMinSize(1).ofMaxSize(30))
                .as((k, tailCount, contentPool) -> buildScenario(k, tailCount, contentPool, true));
    }

    /**
     * Generates {@link NdjsonScenario} instances where {@code k=0}: the very first
     * frame is {@code done:true}, followed by 1–10 tail frames.
     */
    @Provide
    Arbitrary<NdjsonScenario> tailOnlySequences() {
        Arbitrary<Integer> tailArb = Arbitraries.integers().between(1, 10);
        return tailArb.map(tailCount -> buildScenario(0, tailCount, List.of(), true));
    }

    /**
     * Generates {@link NdjsonScenario} instances where {@code tailCount=0} (no bytes
     * after {@code done:true}). Used to verify the normal, well-behaved case.
     * {@code k} ranges from 0 to 19.
     */
    @Provide
    Arbitrary<NdjsonScenario> ndjsonSequencesNoTail() {
        Arbitrary<Integer> kArb = Arbitraries.integers().between(0, 19);
        // Use only safe printable ASCII letters/digits/spaces — avoids JSON escaping surprises.
        Arbitrary<String> contentArb = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-_:;")
                .ofMinLength(0).ofMaxLength(80);

        return Combinators.combine(kArb, contentArb.list().ofMinSize(1).ofMaxSize(25))
                .as((k, contentPool) -> buildScenario(k, 0, contentPool, false));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Builds a {@link NdjsonScenario} with the given parameters.
     *
     * @param k           number of content frames before {@code done:true}
     * @param tailCount   number of frames appended after {@code done:true}
     * @param contentPool pool of content strings to draw from (cycled as needed)
     * @param appendTail  whether tail frames should actually be added
     */
    private static NdjsonScenario buildScenario(
            int k, int tailCount, List<String> contentPool, boolean appendTail) {

        List<String> lines = new ArrayList<>();
        List<String> expectedContents = new ArrayList<>();

        // k content frames — done:false
        for (int i = 0; i < k; i++) {
            String content = contentPool.isEmpty() ? "" : contentPool.get(i % contentPool.size());
            lines.add(contentFrame(content, false));
            expectedContents.add(content);
        }

        // The terminal frame — done:true (content field present but filtered out)
        lines.add(contentFrame("DONE_SENTINEL", true));

        // Tail frames — these must NOT be emitted
        if (appendTail) {
            for (int i = 0; i < tailCount; i++) {
                lines.add(contentFrame("TAIL_" + i, false));
            }
        }

        return new NdjsonScenario(k, appendTail ? tailCount : 0, lines, expectedContents);
    }

    /**
     * Serialises a single Ollama chat NDJSON frame.
     *
     * <pre>{@code
     * {"message":{"role":"assistant","content":"<content>"},"done":<done>}
     * }</pre>
     */
    private static String contentFrame(String content, boolean done) {
        // Build a minimal but valid Ollama /api/chat response frame.
        // We escape content manually to keep the helper dependency-free.
        String escaped = content
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
        return "{\"message\":{\"role\":\"assistant\",\"content\":\"" + escaped
                + "\"},\"done\":" + done + "}";
    }

    /**
     * Converts a list of NDJSON lines into a {@link Flux} of {@link DataBuffer}s,
     * joining all lines with newlines and wrapping in a single buffer — exactly the
     * kind of chunked stream {@link OllamaLlmProvider#decodeNdjson} must handle.
     */
    private static Flux<DataBuffer> ndjsonToBuffers(List<String> lines) {
        // Join with newlines to form a single NDJSON byte string, then wrap.
        // This is the simplest (and most realistic) chunking: one big buffer.
        String ndjson = String.join("\n", lines) + "\n";
        byte[] bytes = ndjson.getBytes(StandardCharsets.UTF_8);
        DataBuffer buffer = BUFFER_FACTORY.wrap(bytes);
        return Flux.just(buffer);
    }

    // =========================================================================
    // Scenario value object
    // =========================================================================

    /**
     * Immutable description of a generated NDJSON test scenario.
     *
     * @param k                number of content frames expected before {@code done:true}
     * @param tailCount        number of frames appended after the terminal frame
     * @param allLines         the complete ordered list of NDJSON line strings
     * @param expectedContents the content delta strings for frames {@code [0, k)}
     */
    record NdjsonScenario(
            int k,
            int tailCount,
            List<String> allLines,
            List<String> expectedContents) {

        @Override
        public String toString() {
            return "NdjsonScenario{k=" + k + ", tailCount=" + tailCount
                    + ", totalLines=" + allLines.size() + "}";
        }
    }
}
