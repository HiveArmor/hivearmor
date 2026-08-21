package com.hivearmor.web.rest.admin;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.service.HaLlmConfigService;
import com.hivearmor.service.dto.admin.PullRequestDTO;
import com.hivearmor.service.llm.OllamaLlmProvider;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/**
 * Property-based test for {@link HaLlmAdminResource} Ollama-only endpoint gating.
 *
 * <p><strong>Property 11: Ollama-only admin endpoints reject non-Ollama providers</strong><br>
 * <strong>Validates: Requirements 5.2, 5.4</strong>
 *
 * <p>For any active provider drawn from {@code {disabled, openai, azure}} and any request
 * to {@code GET /api/ha-admin/llm/models} or {@code POST /api/ha-admin/llm/models/pull},
 * the response SHALL have HTTP status 400.
 *
 * <p>Additionally, when the active provider is {@code "ollama"}, neither {@code models()}
 * nor {@code pull(...)} SHALL throw a {@link ResponseStatusException} with HTTP 400 — they
 * are allowed to fail for other reasons (e.g. Ollama unreachable) but the gating guard
 * must not reject the request.
 *
 * <h2>Test strategy</h2>
 * <ol>
 *   <li><strong>11-A</strong> — For any provider drawn from {@code {disabled, openai, azure}},
 *       {@link HaLlmAdminResource#models()} must throw {@link ResponseStatusException} with
 *       {@code status = 400}.</li>
 *   <li><strong>11-B</strong> — For any provider drawn from {@code {disabled, openai, azure}}
 *       and any model name, {@link HaLlmAdminResource#pull(PullRequestDTO)} must throw
 *       {@link ResponseStatusException} with {@code status = 400}.</li>
 *   <li><strong>11-C</strong> — When the active provider is {@code "ollama"},
 *       {@code models()} must NOT throw a 400 {@link ResponseStatusException}. Any other
 *       exception (e.g. network error) is acceptable — only the gating guard is verified.</li>
 *   <li><strong>11-D</strong> — When the active provider is {@code "ollama"},
 *       {@code pull(...)} must NOT throw a 400 {@link ResponseStatusException}. Any other
 *       exception is acceptable — only the gating guard is verified.</li>
 * </ol>
 *
 * <p>The Spring context is bypassed entirely. {@link HaLlmService} is mocked so that
 * {@link HaLlmService#activeProviderName()} returns the generated provider name.
 * {@link OllamaLlmProvider} is mocked to avoid any network I/O and to control what
 * happens when the guard passes (Ollama provider is active). All other dependencies
 * ({@link HaLlmConfigService}, {@link ApplicationEventPublisher}) are mocked but never
 * expected to be called by the guard logic.
 */
@Label("Feature: sprint-27-ollama, Property 11: Ollama-only admin endpoints reject non-Ollama providers")
class OllamaOnlyEndpointGatingPropertyTest {

    // -------------------------------------------------------------------------
    // Test infrastructure — re-created fresh before every jqwik trial
    // -------------------------------------------------------------------------

    private HaLlmAdminResource resource;
    private HaLlmService llmService;
    private OllamaLlmProvider ollamaProvider;

    @BeforeTry
    void setUp() {
        llmService     = mock(HaLlmService.class);
        ollamaProvider = mock(OllamaLlmProvider.class);

        HaLlmConfigService configWriter   = mock(HaLlmConfigService.class);
        ApplicationEventPublisher events  = mock(ApplicationEventPublisher.class);

        resource = new HaLlmAdminResource(llmService, ollamaProvider, configWriter, events);
    }

    // =========================================================================
    // Property 11-A: models() throws HTTP 400 for any non-Ollama provider
    // =========================================================================

    /**
     * <strong>Property 11-A: {@code models()} throws HTTP 400 for non-Ollama providers</strong>
     *
     * <p>For any active provider drawn from {@code {disabled, openai, azure}},
     * {@link HaLlmAdminResource#models()} must throw a {@link ResponseStatusException}
     * whose HTTP status is {@code 400 Bad Request}.
     *
     * <p><strong>Validates: Requirements 5.2</strong>
     */
    @Property(tries = 30)
    @Label("Property 11-A: models() throws HTTP 400 for every non-Ollama active provider")
    void property11a_models_returns400_forNonOllamaProvider(
            @ForAll("nonOllamaProviders") String providerName) {

        when(llmService.activeProviderName()).thenReturn(providerName);

        assertThatThrownBy(() -> resource.models())
            .as("models() must throw ResponseStatusException(400) when active provider is '%s'",
                providerName)
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(ex -> {
                ResponseStatusException rse = (ResponseStatusException) ex;
                assertThat(rse.getStatusCode())
                    .as("HTTP status must be 400 Bad Request for provider '%s'", providerName)
                    .isEqualTo(HttpStatus.BAD_REQUEST);
            });
    }

    // =========================================================================
    // Property 11-B: pull() throws HTTP 400 for any non-Ollama provider
    // =========================================================================

    /**
     * <strong>Property 11-B: {@code pull()} throws HTTP 400 for non-Ollama providers</strong>
     *
     * <p>For any active provider drawn from {@code {disabled, openai, azure}} and any
     * non-blank model name up to 128 characters, {@link HaLlmAdminResource#pull(PullRequestDTO)}
     * must throw a {@link ResponseStatusException} whose HTTP status is {@code 400 Bad Request}.
     *
     * <p><strong>Validates: Requirements 5.4</strong>
     */
    @Property(tries = 30)
    @Label("Property 11-B: pull() throws HTTP 400 for every non-Ollama active provider")
    void property11b_pull_returns400_forNonOllamaProvider(
            @ForAll("nonOllamaProviders") String providerName,
            @ForAll("modelNames") String modelName) {

        when(llmService.activeProviderName()).thenReturn(providerName);

        PullRequestDTO request = new PullRequestDTO(modelName);

        assertThatThrownBy(() -> resource.pull(request))
            .as("pull(model='%s') must throw ResponseStatusException(400) when active provider is '%s'",
                modelName, providerName)
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(ex -> {
                ResponseStatusException rse = (ResponseStatusException) ex;
                assertThat(rse.getStatusCode())
                    .as("HTTP status must be 400 Bad Request for provider '%s', model='%s'",
                        providerName, modelName)
                    .isEqualTo(HttpStatus.BAD_REQUEST);
            });
    }

    // =========================================================================
    // Property 11-C: models() does NOT throw HTTP 400 when provider is "ollama"
    // =========================================================================

    /**
     * <strong>Property 11-C: {@code models()} does not gate out {@code "ollama"} provider</strong>
     *
     * <p>When the active provider is {@code "ollama"}, the guard in {@code models()} must
     * not throw a 400 {@link ResponseStatusException}. Any other exception from the
     * downstream Ollama call is acceptable — only the gating behaviour is verified here.
     *
     * <p>The {@link OllamaLlmProvider} mock is configured to throw a generic
     * {@link RuntimeException} to simulate a network error so the method does not
     * return normally. The test asserts only that this exception is NOT a 400
     * {@link ResponseStatusException}.
     *
     * <p><strong>Validates: Requirements 5.2</strong>
     */
    @Property(tries = 1)
    @Label("Property 11-C: models() does not throw HTTP 400 when active provider is 'ollama'")
    void property11c_models_doesNotThrow400_whenProviderIsOllama() {
        when(llmService.activeProviderName()).thenReturn("ollama");
        // Simulate the downstream call failing — we only care about the guard, not the result.
        when(ollamaProvider.listModels())
            .thenThrow(new RuntimeException("simulated Ollama unreachable"));

        try {
            resource.models();
            // If no exception is thrown, the guard passed — that's fine.
        } catch (ResponseStatusException rse) {
            assertThat(rse.getStatusCode())
                .as("models() must not return HTTP 400 when the active provider is 'ollama'; "
                    + "got %s instead", rse.getStatusCode())
                .isNotEqualTo(HttpStatus.BAD_REQUEST);
        } catch (RuntimeException e) {
            // Any other RuntimeException (e.g. network error) is acceptable — the guard passed.
            assertThat(e)
                .as("models() threw a non-gating exception when provider is 'ollama' — this is acceptable")
                .isNotInstanceOf(ResponseStatusException.class);
        }
    }

    // =========================================================================
    // Property 11-D: pull() does NOT throw HTTP 400 when provider is "ollama"
    // =========================================================================

    /**
     * <strong>Property 11-D: {@code pull()} does not gate out {@code "ollama"} provider</strong>
     *
     * <p>When the active provider is {@code "ollama"}, the guard in {@code pull()} must
     * not throw a 400 {@link ResponseStatusException}. Any other exception from the
     * downstream Ollama call is acceptable — only the gating behaviour is verified here.
     *
     * <p>The {@link OllamaLlmProvider} mock is configured to return an empty Flux so the
     * streaming pipeline completes without producing any SSE frames. This is sufficient to
     * confirm the guard passed without simulating a full SSE stream.
     *
     * <p><strong>Validates: Requirements 5.4</strong>
     */
    @Property(tries = 1)
    @Label("Property 11-D: pull() does not throw HTTP 400 when active provider is 'ollama'")
    void property11d_pull_doesNotThrow400_whenProviderIsOllama() {
        when(llmService.activeProviderName()).thenReturn("ollama");
        when(ollamaProvider.pullModel(anyString()))
            .thenReturn(reactor.core.publisher.Flux.empty());

        PullRequestDTO request = new PullRequestDTO("llama3.2:3b");

        try {
            resource.pull(request);
            // Returned a Flux without throwing — guard passed.
        } catch (ResponseStatusException rse) {
            assertThat(rse.getStatusCode())
                .as("pull() must not return HTTP 400 when the active provider is 'ollama'; "
                    + "got %s instead", rse.getStatusCode())
                .isNotEqualTo(HttpStatus.BAD_REQUEST);
        } catch (RuntimeException e) {
            // Any other RuntimeException is acceptable — the guard passed.
            assertThat(e)
                .as("pull() threw a non-gating exception when provider is 'ollama' — this is acceptable")
                .isNotInstanceOf(ResponseStatusException.class);
        }
    }

    // =========================================================================
    // Arbitrary generators
    // =========================================================================

    /**
     * Generates provider names from the set {@code {disabled, openai, azure}}.
     *
     * <p>These are the three valid non-Ollama provider values. The {@code "ollama"}
     * value is intentionally excluded — it is tested separately in properties 11-C and 11-D.
     */
    @Provide
    Arbitrary<String> nonOllamaProviders() {
        return Arbitraries.of("disabled", "openai", "azure");
    }

    /**
     * Generates non-blank model name strings of 1–128 characters.
     *
     * <p>Matches the {@link PullRequestDTO} constraint: {@code @NotBlank @Size(max = 128)}.
     * Draws from printable ASCII to avoid JSON serialisation edge cases that are
     * irrelevant to the gating logic under test.
     */
    @Provide
    Arbitrary<String> modelNames() {
        return Arbitraries.strings()
            .withCharRange('a', 'z')
            .ofMinLength(1)
            .ofMaxLength(128);
    }
}
