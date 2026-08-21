package com.hivearmor.web.rest.admin;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.service.HaLlmConfigService;
import com.hivearmor.service.dto.admin.PullRequestDTO;
import com.hivearmor.service.llm.OllamaLlmProvider;
import com.hivearmor.service.llm.OllamaPullProgress;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.codec.ServerSentEvent;
import reactor.core.publisher.Flux;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * Integration test for {@link HaLlmAdminResource#pull(PullRequestDTO)}.
 *
 * <p>Validates that when Ollama is the active provider and
 * {@link OllamaLlmProvider#pullModel(String)} returns a {@link Flux} ending with an
 * {@link OllamaPullProgress} frame whose {@code status} is {@code "success"}, the
 * controller's {@code pull()} method streams an SSE frame containing that terminal
 * {@code "success"} status.
 *
 * <p>The Spring container is bypassed entirely. {@link HaLlmService} is mocked to
 * return {@code "ollama"} for {@link HaLlmService#activeProviderName()}, and
 * {@link OllamaLlmProvider} is mocked to return a controlled {@link Flux} of
 * {@link OllamaPullProgress} records. No network I/O occurs.
 *
 * <p>Run with:
 * <pre>cd backend && mvn -s settings.xml test -Dtest=Sprint27ModelPullIT</pre>
 *
 * <p><strong>Validates: Requirement 10.2</strong>
 */
@Tag("integration")
class Sprint27ModelPullIT {

    private HaLlmAdminResource resource;
    private OllamaLlmProvider ollamaProvider;
    private HaLlmService llmService;

    @BeforeEach
    void setUp() {
        llmService     = mock(HaLlmService.class);
        ollamaProvider = mock(OllamaLlmProvider.class);

        HaLlmConfigService        configWriter = mock(HaLlmConfigService.class);
        ApplicationEventPublisher events       = mock(ApplicationEventPublisher.class);

        resource = new HaLlmAdminResource(llmService, ollamaProvider, configWriter, events);
    }

    // =========================================================================
    // Happy path — pull stream terminates with status "success"
    // =========================================================================

    /**
     * When Ollama is the active provider and the pull stream ends with a
     * {@code status: "success"} frame, the returned {@link Flux} of
     * {@link ServerSentEvent} values MUST contain at least one SSE frame whose
     * data's {@code status()} field equals {@code "success"}, and that frame
     * must be the last one in the stream.
     *
     * <p>Mirrors real Ollama behaviour: intermediate frames carry statuses such as
     * {@code "pulling manifest"} and {@code "downloading"}; the final frame always
     * carries {@code "success"} when the pull completes successfully.
     *
     * <p><strong>Validates: Requirement 10.2</strong>
     */
    @Test
    void pull_withOllamaAsActiveProvider_returnsFluxEndingWithSuccessFrame() {
        // Arrange — Ollama is the active provider
        when(llmService.activeProviderName()).thenReturn("ollama");

        // Arrange — mock a realistic multi-frame pull stream ending with "success"
        when(ollamaProvider.pullModel("llama3.2:3b")).thenReturn(Flux.just(
            new OllamaPullProgress("pulling manifest",         null,   null,   null),
            new OllamaPullProgress("downloading",              1024L,  256L,   "sha256:abc"),
            new OllamaPullProgress("downloading",              1024L,  512L,   "sha256:abc"),
            new OllamaPullProgress("verifying sha256 digest",  null,   null,   "sha256:abc"),
            new OllamaPullProgress("success",                  null,   null,   null)
        ));

        // Act — collect all SSE frames synchronously
        List<OllamaPullProgress> emitted = resource.pull(new PullRequestDTO("llama3.2:3b"))
            .map(ServerSentEvent::data)
            .collectList()
            .block();

        // Assert — stream must be non-empty
        assertThat(emitted)
            .as("pull() Flux must not be empty")
            .isNotNull()
            .isNotEmpty();

        // Assert — stream must contain a "success" frame
        List<String> statuses = emitted.stream().map(OllamaPullProgress::status).toList();
        assertThat(statuses)
            .as("SSE stream must contain a terminal 'success' frame (Requirement 10.2)")
            .contains("success");

        // Assert — "success" must be the terminal (last) frame
        assertThat(statuses)
            .as("The 'success' frame must be the last frame in the stream")
            .last().isEqualTo("success");

        // Assert — the correct model name was forwarded
        verify(ollamaProvider, times(1)).pullModel("llama3.2:3b");
    }

    // =========================================================================
    // Minimal path — single-frame success stream
    // =========================================================================

    /**
     * Edge case: when the pull stream consists of only a single {@code "success"}
     * frame (e.g. model is already cached locally), the controller must still emit
     * that frame as an SSE event.
     *
     * <p><strong>Validates: Requirement 10.2</strong>
     */
    @Test
    void pull_singleSuccessFrame_emitsSuccessEvent() {
        when(llmService.activeProviderName()).thenReturn("ollama");
        when(ollamaProvider.pullModel("llama3.2:3b"))
            .thenReturn(Flux.just(new OllamaPullProgress("success", null, null, null)));

        List<OllamaPullProgress> emitted = resource.pull(new PullRequestDTO("llama3.2:3b"))
            .map(ServerSentEvent::data)
            .collectList()
            .block();

        assertThat(emitted)
            .as("Single-frame stream must not be empty")
            .isNotNull()
            .hasSize(1);
        assertThat(emitted.get(0).status())
            .as("Single-frame stream must carry status 'success'")
            .isEqualTo("success");
    }

    // =========================================================================
    // Model name forwarding — pull delegates the exact model name
    // =========================================================================

    /**
     * Confirms that the model name in the {@link PullRequestDTO} is forwarded
     * verbatim to {@link OllamaLlmProvider#pullModel(String)}, that each progress
     * frame is wrapped in an SSE event, and that the stream preserves ordering.
     *
     * <p><strong>Validates: Requirement 10.2</strong>
     */
    @Test
    void pull_forwardsModelNameToProvider_andWrapsEachFrameInSse() {
        String model = "mistral:7b";
        when(llmService.activeProviderName()).thenReturn("ollama");
        when(ollamaProvider.pullModel(model)).thenReturn(Flux.just(
            new OllamaPullProgress("downloading", 500L, 100L, "sha256:xyz"),
            new OllamaPullProgress("success",     null, null, null)
        ));

        List<OllamaPullProgress> emitted = resource.pull(new PullRequestDTO(model))
            .map(ServerSentEvent::data)
            .collectList()
            .block();

        assertThat(emitted)
            .as("Flux must contain exactly 2 SSE frames")
            .isNotNull()
            .hasSize(2);
        assertThat(emitted.get(0).status())
            .as("First SSE frame status must be 'downloading'")
            .isEqualTo("downloading");
        assertThat(emitted.get(1).status())
            .as("Last SSE frame status must be 'success' (Requirement 10.2)")
            .isEqualTo("success");

        verify(ollamaProvider, times(1)).pullModel(model);
        verifyNoMoreInteractions(ollamaProvider);
    }
}
