package com.hivearmor.web.rest.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.github.tomakehurst.wiremock.junit5.WireMockRuntimeInfo;
import com.github.tomakehurst.wiremock.junit5.WireMockTest;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.llm.*;
import com.hivearmor.service.llm.event.LlmConfigChangedEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.util.List;
import java.util.Optional;

import static com.github.tomakehurst.wiremock.client.WireMock.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Integration test — Task 8.6: end-to-end streaming chat check.
 *
 * <p>Verifies that invoking {@link HaLlmService#streamChat(List, ChatOptions)}
 * while the active provider is {@link OllamaLlmProvider} produces a non-empty
 * token stream that completes normally.
 *
 * <h2>Strategy</h2>
 * <p>WireMock stubs the Ollama {@code POST /api/chat} endpoint with a realistic
 * NDJSON response stream. An {@link OllamaLlmProvider} is wired to the WireMock
 * server, registered in a {@link ProviderRegistry}, and injected into a
 * {@link HaLlmService} instance. The test then calls
 * {@code streamChat} through the full service → provider → WebClient path and
 * asserts that:
 * <ol>
 *   <li>The returned {@link reactor.core.publisher.Flux} emits at least one token
 *       (non-empty stream).</li>
 *   <li>The Flux completes normally (no error signal).</li>
 * </ol>
 *
 * <p><strong>Validates: Requirement 10.4</strong>
 */
@Tag("integration")
@WireMockTest
@DisplayName("Sprint 27 — Task 8.6: end-to-end streaming chat through OllamaLlmProvider (Req 10.4)")
class Sprint27StreamingChatIT {

    /** Real NDJSON body matching Ollama's /api/chat wire format. */
    private static final String NDJSON_STREAM =
            "{\"message\":{\"role\":\"assistant\",\"content\":\"The \"},\"done\":false}\n"
            + "{\"message\":{\"role\":\"assistant\",\"content\":\"sky \"},\"done\":false}\n"
            + "{\"message\":{\"role\":\"assistant\",\"content\":\"is \"},\"done\":false}\n"
            + "{\"message\":{\"role\":\"assistant\",\"content\":\"blue.\"},\"done\":false}\n"
            + "{\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true}\n";

    private ObjectMapper mapper;

    @BeforeEach
    void setUpMapper() {
        mapper = JsonMapper.builder()
                .addModule(new JavaTimeModule())
                .build();
    }

    // =========================================================================
    // Helper: construct a fully-wired OllamaLlmProvider pointing at WireMock
    // =========================================================================

    /**
     * Builds an {@link OllamaLlmProvider} whose {@code WebClient} base URL is set to
     * the WireMock server URI. The {@link UtmConfigurationParameterRepository} is
     * stubbed so that {@code LLM_BASE_URL} returns the WireMock base URL and every
     * other param lookup returns {@link Optional#empty()}.
     */
    private OllamaLlmProvider buildOllamaProvider(WireMockRuntimeInfo wm) {
        UtmConfigurationParameterRepository configRepo =
                mock(UtmConfigurationParameterRepository.class);

        String wireMockBaseUrl = wm.getHttpBaseUrl();

        UtmConfigurationParameter baseUrlParam = new UtmConfigurationParameter();
        baseUrlParam.setConfParamValue(wireMockBaseUrl);

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

    /**
     * Builds a {@link HaLlmService} with the given {@link OllamaLlmProvider} as the
     * sole Ollama bean in the registry, a real {@link DisabledLlmProvider} as the
     * fallback, and a stubbed config repo that returns {@code "ollama"} for
     * {@code LLM_PROVIDER} so that {@code reload()} selects the Ollama provider.
     */
    private HaLlmService buildServiceWithOllama(OllamaLlmProvider ollamaProvider) {
        DisabledLlmProvider disabled = new DisabledLlmProvider();
        ProviderRegistry registry = new ProviderRegistry(List.of(disabled, ollamaProvider));

        UtmConfigurationParameterRepository serviceConfigRepo =
                mock(UtmConfigurationParameterRepository.class);

        UtmConfigurationParameter providerRow = new UtmConfigurationParameter();
        providerRow.setConfParamShort("LLM_PROVIDER");
        providerRow.setConfParamValue("ollama");
        when(serviceConfigRepo.findByConfParamShort("LLM_PROVIDER"))
                .thenReturn(Optional.of(providerRow));

        HaLlmService service = new HaLlmService(registry, serviceConfigRepo);
        // Trigger @PostConstruct-equivalent: init() is called by Spring, here we simulate it
        // by publishing a LlmConfigChangedEvent which calls reload().
        service.onConfigChanged(new LlmConfigChangedEvent(this));
        return service;
    }

    // =========================================================================
    // Test 1 — streamChat emits at least one token and completes normally
    // =========================================================================

    /**
     * <strong>Task 8.6 — end-to-end streaming chat check</strong>
     *
     * <p>Steps:
     * <ol>
     *   <li>Stub {@code POST /api/chat} on WireMock with a four-token NDJSON stream
     *       terminated by {@code "done":true}.</li>
     *   <li>Wire an {@link OllamaLlmProvider} to WireMock.</li>
     *   <li>Set it as the active provider in {@link HaLlmService}.</li>
     *   <li>Call {@link HaLlmService#streamChat(List, ChatOptions)}.</li>
     *   <li>Assert the Flux emits at least 1 token (non-empty stream).</li>
     *   <li>Assert all emitted tokens are non-null and non-blank.</li>
     *   <li>Assert the Flux completes without an error signal.</li>
     *   <li>Assert WireMock received exactly one POST to {@code /api/chat}.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirement 10.4</strong>
     */
    @Test
    @DisplayName("streamChat — Flux emits ≥1 token and completes normally when Ollama is active provider")
    void streamChat_ollamaActiveProvider_emitsNonEmptyStreamAndCompletes(WireMockRuntimeInfo wm) {

        // Arrange: stub /api/chat with a realistic NDJSON stream
        stubFor(post(urlEqualTo("/api/chat"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/x-ndjson")
                        .withBody(NDJSON_STREAM)));

        OllamaLlmProvider ollamaProvider = buildOllamaProvider(wm);
        HaLlmService service = buildServiceWithOllama(ollamaProvider);

        // Verify active provider is ollama before invoking streamChat
        assertThat(service.activeProviderName())
                .as("Active provider must be 'ollama' before invoking streamChat")
                .isEqualTo("ollama");

        List<com.hivearmor.service.llm.ChatMessage> messages = List.of(
                new com.hivearmor.service.llm.ChatMessage("user", "What color is the sky?")
        );
        ChatOptions options = new ChatOptions("llama3.2:3b", 0.2, 2048);

        // Act: collect all tokens; block() throws if the Flux terminates with an error
        List<String> tokens = service.streamChat(messages, options)
                .collectList()
                .block();

        // Assert 1: stream is non-empty (at least 1 token received)
        assertThat(tokens)
                .as("streamChat Flux must emit at least 1 token — stream must not be empty "
                        + "(Requirement 10.4: end-to-end streaming from Ollama to client)")
                .isNotNull()
                .isNotEmpty();

        // Assert 2: every token is non-null (content field was extracted correctly)
        assertThat(tokens)
                .as("Every emitted token must be non-null")
                .doesNotContainNull();

        // Assert 3: the four content frames map to the expected tokens in order
        assertThat(tokens)
                .as("Tokens must match the four content frames in the NDJSON stream")
                .containsExactly("The ", "sky ", "is ", "blue.");

        // Assert 4: WireMock confirms exactly one upstream call was made
        verify(1, postRequestedFor(urlEqualTo("/api/chat")));
    }

    // =========================================================================
    // Test 2 — streamChat with single-token stream (minimal happy path)
    // =========================================================================

    /**
     * <strong>Minimal non-empty stream variant</strong>
     *
     * <p>Uses a one-frame NDJSON body (single content token + done:true) to
     * confirm the lower-bound case: a stream with exactly one token also satisfies
     * the "non-empty" assertion.
     *
     * <p><strong>Validates: Requirement 10.4</strong>
     */
    @Test
    @DisplayName("streamChat — single-token stream also satisfies non-empty assertion (Req 10.4)")
    void streamChat_singleToken_nonEmptyStream(WireMockRuntimeInfo wm) {

        String singleTokenNdjson =
                "{\"message\":{\"role\":\"assistant\",\"content\":\"Hello!\"},\"done\":false}\n"
                + "{\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true}\n";

        stubFor(post(urlEqualTo("/api/chat"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/x-ndjson")
                        .withBody(singleTokenNdjson)));

        OllamaLlmProvider ollamaProvider = buildOllamaProvider(wm);
        HaLlmService service = buildServiceWithOllama(ollamaProvider);

        List<com.hivearmor.service.llm.ChatMessage> messages = List.of(
                new com.hivearmor.service.llm.ChatMessage("user", "Hi")
        );
        ChatOptions options = new ChatOptions("llama3.2:3b", null, null);

        List<String> tokens = service.streamChat(messages, options)
                .collectList()
                .block();

        assertThat(tokens)
                .as("Single-token stream must still satisfy the non-empty assertion")
                .isNotNull()
                .hasSize(1)
                .containsExactly("Hello!");

        verify(1, postRequestedFor(urlEqualTo("/api/chat")));
    }

    // =========================================================================
    // Test 3 — activeProviderName() is "ollama" during streamChat
    // =========================================================================

    /**
     * <strong>Active provider identity check</strong>
     *
     * <p>Asserts that {@link HaLlmService#activeProviderName()} returns {@code "ollama"}
     * before, during setup, and after the streamChat call — confirming the service
     * delegates to OllamaLlmProvider throughout the request lifetime.
     *
     * <p><strong>Validates: Requirement 10.4 (end-to-end routing through Ollama provider)</strong>
     */
    @Test
    @DisplayName("activeProviderName() is 'ollama' during end-to-end streamChat (Req 10.4)")
    void streamChat_activeProviderIsOllama_throughoutRequest(WireMockRuntimeInfo wm) {

        stubFor(post(urlEqualTo("/api/chat"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/x-ndjson")
                        .withBody(NDJSON_STREAM)));

        OllamaLlmProvider ollamaProvider = buildOllamaProvider(wm);
        HaLlmService service = buildServiceWithOllama(ollamaProvider);

        // Confirm active provider before invoking
        assertThat(service.activeProviderName())
                .as("Active provider must be 'ollama' before streamChat invocation")
                .isEqualTo("ollama");

        List<com.hivearmor.service.llm.ChatMessage> messages = List.of(
                new com.hivearmor.service.llm.ChatMessage("user", "Test message")
        );
        ChatOptions options = new ChatOptions("llama3.2:3b", 0.2, 512);

        List<String> tokens = service.streamChat(messages, options)
                .collectList()
                .block();

        // Confirm active provider is still ollama after completion
        assertThat(service.activeProviderName())
                .as("Active provider must still be 'ollama' after streamChat completes")
                .isEqualTo("ollama");

        // Confirm non-empty stream
        assertThat(tokens)
                .as("Stream must be non-empty when active provider is 'ollama'")
                .isNotEmpty();
    }
}
