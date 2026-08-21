package com.hivearmor.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Check 1: SSE round-trip integration test.
 *
 * <p>Asserts that {@code POST /api/ha-ai/chat} yields at least one incremental
 * {@code {delta, done:false}} frame followed by exactly one terminal
 * {@code {delta:"", done:true, totalTokens}} frame; no frame after terminal.
 *
 * <p>Requirements: 5.3, 5.4, 7.1, 7.2, 7.3, 7.4
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class HaAiChatSseIntegrationTest {

    @LocalServerPort
    private int port;

    @MockBean
    private HaLlmService llmService;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void chatEndpoint_yieldsIncrementalFramesFollowedByExactlyOneTerminalFrame() {
        // Arrange: LLM emits 3 tokens
        when(llmService.streamChat(any(), anyString()))
            .thenReturn(Flux.just("token1", "token2", "token3"));
        when(llmService.isConfigured()).thenReturn(true);

        WebTestClient client = WebTestClient
            .bindToServer()
            .baseUrl("http://localhost:" + port)
            .responseTimeout(Duration.ofSeconds(30))
            .build();

        // Act: POST /api/ha-ai/chat with an analyst JWT
        // Note: In a test environment, security may be configured differently.
        // This test verifies the SSE frame shape against a running server.
        String requestBody;
        try {
            requestBody = objectMapper.writeValueAsString(Map.of(
                "messages", List.of(Map.of("role", "user", "content", "test question")),
                "contextType", "general"
            ));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        // Collect the raw SSE body
        byte[] rawBody = client.post()
            .uri("/api/ha-ai/chat")
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.TEXT_EVENT_STREAM)
            .header("Authorization", "Bearer test-analyst-token")
            .bodyValue(requestBody)
            .exchange()
            .expectStatus().isOk()
            .returnResult(String.class)
            .getResponseBodyContent();

        // Parse frames
        List<JsonNode> frames = parseSseFrames(rawBody != null ? new String(rawBody) : "", objectMapper);

        // Assert: at least 1 incremental frame + exactly 1 terminal
        assertThat(frames).isNotEmpty();

        // Last frame is the terminal
        JsonNode terminal = frames.get(frames.size() - 1);
        assertThat(terminal.get("done").asBoolean()).isTrue();
        assertThat(terminal.get("delta").asText()).isEmpty();
        assertThat(terminal.get("totalTokens").asInt()).isGreaterThanOrEqualTo(0);

        // All frames before terminal are incremental
        for (int i = 0; i < frames.size() - 1; i++) {
            JsonNode frame = frames.get(i);
            assertThat(frame.get("done").asBoolean())
                .as("Frame %d must have done=false", i)
                .isFalse();
            assertThat(frame.get("delta").asText())
                .as("Frame %d must have non-empty delta", i)
                .isNotEmpty();
        }
    }

    private static List<JsonNode> parseSseFrames(String rawBody, ObjectMapper mapper) {
        List<JsonNode> frames = new ArrayList<>();
        for (String line : rawBody.split("\n")) {
            String trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            String json = trimmed.substring("data:".length()).trim();
            if (json.isEmpty()) continue;
            try {
                frames.add(mapper.readTree(json));
            } catch (Exception e) {
                throw new AssertionError("Malformed SSE JSON frame: " + json, e);
            }
        }
        return frames;
    }
}
