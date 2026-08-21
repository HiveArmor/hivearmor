package com.hivearmor.service.llm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.github.tomakehurst.wiremock.http.Fault;
import com.github.tomakehurst.wiremock.junit5.WireMockRuntimeInfo;
import com.github.tomakehurst.wiremock.junit5.WireMockTest;
import com.github.tomakehurst.wiremock.stubbing.Scenario;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.util.List;
import java.util.Optional;

import static com.github.tomakehurst.wiremock.client.WireMock.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * WireMock-based unit tests for {@link OllamaLlmProvider}.
 *
 * <p>Each test starts a fresh WireMock HTTP server (via {@link WireMockTest}) and
 * constructs an {@link OllamaLlmProvider} whose {@code WebClient} points at the
 * WireMock port. This makes the tests fast, deterministic, and fully isolated
 * from a real Ollama runtime.
 *
 * <h2>Coverage</h2>
 * <ol>
 *   <li>{@code streamChat_happyPath} — NDJSON stream with 3 content frames then
 *       {@code "done":true}; asserts 3 tokens emitted.</li>
 *   <li>{@code listModels_happyPath} — {@code GET /api/tags} returns valid JSON;
 *       asserts list of {@link OllamaModel} returned.</li>
 *   <li>{@code pullModel_happyPath} — {@code POST /api/pull} streams 2 progress
 *       frames; asserts 2 {@link OllamaPullProgress} values emitted in order.</li>
 *   <li>{@code webClient_hasReadTimeout} — verifies
 *       {@link OllamaLlmProvider#READ_TIMEOUT} constant equals 120 seconds.</li>
 *   <li>{@code streamChat_retryOnConnectionReset} — WireMock {@code RESET_CONNECTION}
 *       fault on the first request; second stub returns a valid single-frame response;
 *       asserts the retry produces the successful result.</li>
 * </ol>
 *
 * <p><strong>Requirements: 3.7</strong>
 */
@WireMockTest
@DisplayName("OllamaLlmProvider — WireMock integration tests (Req 3.7)")
class OllamaLlmProviderWireMockTest {

    private ObjectMapper mapper;

    /**
     * Builds a fully configured {@link OllamaLlmProvider} whose base URL is set to the
     * WireMock server port passed in via {@link WireMockRuntimeInfo}. The
     * {@link UtmConfigurationParameterRepository} is stubbed to return empty for all
     * param lookups except for the base URL key, which returns the WireMock URL so
     * {@code buildWebClient} uses the correct target.
     *
     * <p>We call the private {@code buildWebClient} path by overriding the internal
     * config via {@code onLlmConfigChanged}, or more simply by relying on the
     * constructor path: when {@code LLM_BASE_URL} returns the WireMock URL, the
     * constructor calls {@code buildWebClient(wireMockUrl)}.
     */
    private OllamaLlmProvider buildProvider(WireMockRuntimeInfo wm) {
        UtmConfigurationParameterRepository configRepo =
                mock(UtmConfigurationParameterRepository.class);

        String wireMockBaseUrl = wm.getHttpBaseUrl(); // e.g. "http://localhost:PORT"

        // Stub config repository: return the WireMock base URL for LLM_BASE_URL,
        // empty for everything else so defaults apply.
        com.hivearmor.domain.UtmConfigurationParameter baseUrlParam =
                new com.hivearmor.domain.UtmConfigurationParameter();
        baseUrlParam.setConfParamValue(wireMockBaseUrl);

        when(configRepo.findByConfParamShort(OllamaLlmProvider.KEY_BASE_URL))
                .thenReturn(Optional.of(baseUrlParam));
        when(configRepo.findByConfParamShort(anyString()))
                .thenAnswer(inv -> {
                    String key = inv.getArgument(0);
                    if (OllamaLlmProvider.KEY_BASE_URL.equals(key)) {
                        return Optional.of(baseUrlParam);
                    }
                    return Optional.empty();
                });

        return new OllamaLlmProvider(mapper, Clock.systemUTC(), configRepo);
    }

    @BeforeEach
    void setUpMapper() {
        mapper = JsonMapper.builder()
                .addModule(new JavaTimeModule())
                .build();
    }

    // =========================================================================
    // Test 1 — streamChat happy path: 3 content frames + done:true → 3 tokens
    // =========================================================================

    /**
     * Stubs {@code POST /api/chat} to return an NDJSON body consisting of three
     * content frames followed by a {@code "done":true} terminal frame. Asserts that
     * {@link OllamaLlmProvider#streamChat} emits exactly 3 tokens in the correct order
     * and completes normally.
     *
     * <p><strong>Requirements: 3.1, 3.7</strong>
     */
    @Test
    @DisplayName("streamChat — 3 content frames + done:true → 3 tokens emitted")
    void streamChat_happyPath(WireMockRuntimeInfo wm) {
        // Build NDJSON response with 3 content frames + terminal done frame
        String ndjsonBody =
                "{\"message\":{\"role\":\"assistant\",\"content\":\"Hello\"},\"done\":false}\n"
                + "{\"message\":{\"role\":\"assistant\",\"content\":\" World\"},\"done\":false}\n"
                + "{\"message\":{\"role\":\"assistant\",\"content\":\"!\"},\"done\":false}\n"
                + "{\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true}\n";

        stubFor(post(urlEqualTo("/api/chat"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/x-ndjson")
                        .withBody(ndjsonBody)));

        OllamaLlmProvider provider = buildProvider(wm);

        List<ChatMessage> messages = List.of(new ChatMessage("user", "Hi"));
        ChatOptions options = new ChatOptions("llama3.2:3b", null, null);

        List<String> tokens = provider.streamChat(messages, options)
                .collectList()
                .block();

        assertThat(tokens)
                .as("streamChat must emit exactly 3 tokens from 3 content frames before done:true")
                .containsExactly("Hello", " World", "!");

        verify(postRequestedFor(urlEqualTo("/api/chat")));
    }

    // =========================================================================
    // Test 2 — listModels happy path: GET /api/tags → List<OllamaModel>
    // =========================================================================

    /**
     * Stubs {@code GET /api/tags} to return a valid JSON payload with two models.
     * Asserts that {@link OllamaLlmProvider#listModels()} returns a non-null list
     * with the correct model names and digests.
     *
     * <p><strong>Requirements: 3.2, 3.7</strong>
     */
    @Test
    @DisplayName("listModels — GET /api/tags returns valid JSON → List<OllamaModel>")
    void listModels_happyPath(WireMockRuntimeInfo wm) {
        String tagsJson = """
                {
                  "models": [
                    {
                      "name": "llama3.2:3b",
                      "size": "2019393189",
                      "digest": "sha256:abc123",
                      "modified_at": "2024-07-25T12:00:00Z"
                    },
                    {
                      "name": "mistral:7b",
                      "size": "4108916688",
                      "digest": "sha256:def456",
                      "modified_at": "2024-07-20T09:30:00Z"
                    }
                  ]
                }
                """;

        stubFor(get(urlEqualTo("/api/tags"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody(tagsJson)));

        OllamaLlmProvider provider = buildProvider(wm);

        List<OllamaModel> models = provider.listModels();

        assertThat(models)
                .as("listModels must return a non-null list with 2 models")
                .isNotNull()
                .hasSize(2);

        assertThat(models.get(0).name())
                .as("First model name must be 'llama3.2:3b'")
                .isEqualTo("llama3.2:3b");
        assertThat(models.get(0).digest())
                .as("First model digest must match")
                .isEqualTo("sha256:abc123");
        assertThat(models.get(1).name())
                .as("Second model name must be 'mistral:7b'")
                .isEqualTo("mistral:7b");
        assertThat(models.get(1).digest())
                .as("Second model digest must match")
                .isEqualTo("sha256:def456");

        verify(getRequestedFor(urlEqualTo("/api/tags")));
    }

    // =========================================================================
    // Test 3 — pullModel happy path: POST /api/pull streams 2 progress frames
    // =========================================================================

    /**
     * Stubs {@code POST /api/pull} to return 2 NDJSON progress frames. Asserts that
     * {@link OllamaLlmProvider#pullModel(String)} emits exactly 2
     * {@link OllamaPullProgress} values in the correct order with the correct fields.
     *
     * <p><strong>Requirements: 3.3, 3.7</strong>
     */
    @Test
    @DisplayName("pullModel — POST /api/pull with 2 progress frames → 2 OllamaPullProgress emitted in order")
    void pullModel_happyPath(WireMockRuntimeInfo wm) {
        String pullNdjson =
                "{\"status\":\"pulling manifest\",\"digest\":null,\"total\":null,\"completed\":null}\n"
                + "{\"status\":\"downloading\",\"digest\":\"sha256:abc\",\"total\":4096,\"completed\":2048}\n";

        stubFor(post(urlEqualTo("/api/pull"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/x-ndjson")
                        .withBody(pullNdjson)));

        OllamaLlmProvider provider = buildProvider(wm);

        List<OllamaPullProgress> progress = provider.pullModel("llama3.2:3b")
                .collectList()
                .block();

        assertThat(progress)
                .as("pullModel must emit exactly 2 OllamaPullProgress records")
                .isNotNull()
                .hasSize(2);

        // Frame 1
        assertThat(progress.get(0).status())
                .as("First frame status must be 'pulling manifest'")
                .isEqualTo("pulling manifest");
        assertThat(progress.get(0).total())
                .as("First frame total must be null")
                .isNull();

        // Frame 2
        assertThat(progress.get(1).status())
                .as("Second frame status must be 'downloading'")
                .isEqualTo("downloading");
        assertThat(progress.get(1).digest())
                .as("Second frame digest must be 'sha256:abc'")
                .isEqualTo("sha256:abc");
        assertThat(progress.get(1).total())
                .as("Second frame total must be 4096")
                .isEqualTo(4096L);
        assertThat(progress.get(1).completed())
                .as("Second frame completed must be 2048")
                .isEqualTo(2048L);

        verify(postRequestedFor(urlEqualTo("/api/pull")));
    }

    // =========================================================================
    // Test 4 — READ_TIMEOUT constant is 120 seconds
    // =========================================================================

    /**
     * Verifies that the {@link OllamaLlmProvider#READ_TIMEOUT} constant is exactly
     * 120 seconds. This is a compile-time constant check — no HTTP call is required.
     * The constant drives the Reactor Netty {@code HttpClient.responseTimeout()} call
     * in {@code buildWebClient}, so checking it directly covers Requirement 3.4.
     *
     * <p><strong>Requirements: 3.4, 3.7</strong>
     */
    @Test
    @DisplayName("webClient — READ_TIMEOUT constant is exactly 120 seconds (Req 3.4)")
    void webClient_hasReadTimeout() {
        assertThat(OllamaLlmProvider.READ_TIMEOUT.getSeconds())
                .as("READ_TIMEOUT must be configured as 120 seconds per Requirement 3.4")
                .isEqualTo(120L);
    }

    // =========================================================================
    // Test 5 — streamChat retries on connection reset (transport fault)
    // =========================================================================

    /**
     * Uses WireMock's {@code RESET_CONNECTION} fault to simulate a connection reset on
     * the first request to {@code POST /api/chat}. A second stub returns a valid
     * single-frame NDJSON response. Asserts that the provider's retry logic (up to 2
     * retries, Requirement 3.6) kicks in, the second attempt succeeds, and the token
     * is emitted.
     *
     * <p>WireMock serves the two scenarios via a scenario with two states:
     * <ul>
     *   <li>State "Started" (default): returns a {@code RESET_CONNECTION} fault.</li>
     *   <li>State "After-fault": returns the valid single-frame NDJSON body.</li>
     * </ul>
     *
     * <p><strong>Requirements: 3.6, 3.7</strong>
     */
    @Test
    @DisplayName("streamChat — RESET_CONNECTION fault on first request → retry succeeds")
    void streamChat_retryOnConnectionReset(WireMockRuntimeInfo wm) {
        final String scenarioName = "chat-retry-scenario";
        final String afterFault = "After-fault";

        // First request — RESET_CONNECTION, transitions to "After-fault"
        stubFor(post(urlEqualTo("/api/chat"))
                .inScenario(scenarioName)
                .whenScenarioStateIs(Scenario.STARTED)
                .willReturn(aResponse()
                        .withFault(Fault.CONNECTION_RESET_BY_PEER))
                .willSetStateTo(afterFault));

        // Second request (after retry) — valid NDJSON with 1 content frame + done:true
        String successBody =
                "{\"message\":{\"role\":\"assistant\",\"content\":\"retried\"},\"done\":false}\n"
                + "{\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true}\n";

        stubFor(post(urlEqualTo("/api/chat"))
                .inScenario(scenarioName)
                .whenScenarioStateIs(afterFault)
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/x-ndjson")
                        .withBody(successBody)));

        OllamaLlmProvider provider = buildProvider(wm);

        List<ChatMessage> messages = List.of(new ChatMessage("user", "Hello"));
        ChatOptions options = new ChatOptions("llama3.2:3b", null, null);

        List<String> tokens = provider.streamChat(messages, options)
                .collectList()
                .block();

        assertThat(tokens)
                .as("After a RESET_CONNECTION fault the retry must succeed and emit the content token")
                .containsExactly("retried");

        // Two POST requests must have been made: the faulted one + the retried one
        verify(2, postRequestedFor(urlEqualTo("/api/chat")));
    }
}
