package com.hivearmor.web.rest.admin;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.service.HaLlmConfigService;
import com.hivearmor.service.dto.admin.LlmStatusDTO;
import com.hivearmor.service.llm.OllamaLlmProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Integration-style test verifying that {@code GET /api/ha-admin/llm/status}
 * returns {@code configured: true} and {@code provider: "ollama"} when the
 * active LLM provider is Ollama.
 *
 * <p>The Spring context is bypassed for speed: {@link HaLlmAdminResource} is
 * instantiated directly with Mockito mocks, matching the pattern established
 * by {@link OllamaOnlyEndpointGatingPropertyTest}.
 *
 * <p><strong>Validates: Requirement 10.5</strong>
 */
@Tag("integration")
class Sprint27StatusIT {

    private HaLlmAdminResource resource;
    private HaLlmService       llmService;
    private OllamaLlmProvider  ollamaProvider;

    @BeforeEach
    void setUp() {
        llmService     = mock(HaLlmService.class);
        ollamaProvider = mock(OllamaLlmProvider.class);

        HaLlmConfigService       configWriter = mock(HaLlmConfigService.class);
        ApplicationEventPublisher events       = mock(ApplicationEventPublisher.class);

        resource = new HaLlmAdminResource(llmService, ollamaProvider, configWriter, events);
    }

    /**
     * When {@link HaLlmService#isConfigured()} returns {@code true} and
     * {@link HaLlmService#activeProviderName()} returns {@code "ollama"},
     * {@link HaLlmAdminResource#status()} SHALL return a {@link LlmStatusDTO}
     * with {@code configured == true} and {@code provider == "ollama"}.
     *
     * <p>The Ollama latency probe ({@link OllamaLlmProvider#listModels()}) is
     * stubbed to return an empty list so the resource does not attempt a real
     * network connection.
     *
     * <p><strong>Validates: Requirement 10.5</strong>
     */
    @Test
    void statusEndpoint_returnsConfiguredTrue_whenActiveProviderIsOllama() {
        // Arrange
        when(llmService.isConfigured()).thenReturn(true);
        when(llmService.activeProviderName()).thenReturn("ollama");
        // Stub the latency probe so no network I/O occurs.
        when(ollamaProvider.listModels()).thenReturn(java.util.Collections.emptyList());

        // Act
        LlmStatusDTO dto = resource.status();

        // Assert
        assertThat(dto.configured())
            .as("LlmStatusDTO.configured must be true when HaLlmService.isConfigured() returns true "
                + "(Requirement 10.5)")
            .isTrue();

        assertThat(dto.provider())
            .as("LlmStatusDTO.provider must be \"ollama\" when activeProviderName() returns \"ollama\" "
                + "(Requirement 10.5)")
            .isEqualTo("ollama");
    }
}
