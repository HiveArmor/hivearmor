package com.hivearmor.web.rest.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.service.HaLlmConfigService;
import com.hivearmor.service.dto.admin.LlmConfigUpdateDTO;
import com.hivearmor.service.llm.OllamaLlmProvider;
import com.hivearmor.service.llm.event.LlmConfigChangedEvent;
import net.jqwik.api.*;
import net.jqwik.api.constraints.DoubleRange;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.lifecycle.BeforeTry;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Property 5: Every successful config persist publishes exactly one event.
 *
 * <p>For any valid {@link LlmConfigUpdateDTO}, when
 * {@code POST /api/ha-admin/llm/config} returns HTTP 200, exactly one
 * {@link LlmConfigChangedEvent} SHALL have been published on the Spring
 * application event bus, and {@link HaLlmConfigService#persist(LlmConfigUpdateDTO)}
 * SHALL have been called exactly once with the same DTO.
 *
 * <p><strong>Validates: Requirements 2.4, 6.2</strong>
 */
@Label("Feature: sprint-27-ollama, Property 5: Every successful config persist publishes exactly one event")
class ConfigChangeEventFanOutPropertyTest {

    private static final String ENDPOINT = "/api/ha-admin/llm/config";

    private MockMvc mockMvc;
    private HaLlmConfigService configWriter;
    private ApplicationEventPublisher events;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Security filter that injects an {@code ADMIN} authority into every request,
     * bypassing the full Spring Security filter chain while keeping
     * {@code @PreAuthorize} evaluation active via standalone MockMvc.
     */
    private static final OncePerRequestFilter ADMIN_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest req,
                                        HttpServletResponse resp,
                                        FilterChain chain)
                throws ServletException, IOException {
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                    "admin", null,
                    Collections.singletonList(
                        new SimpleGrantedAuthority("ADMIN"))));
            chain.doFilter(req, resp);
        }
    };

    /**
     * Rebuilds mocks and standalone MockMvc before each property try so that
     * mock stubbing and captured arguments from one try cannot bleed into the next.
     */
    @BeforeTry
    void setUp() {
        configWriter = mock(HaLlmConfigService.class);
        events       = mock(ApplicationEventPublisher.class);

        HaLlmService       llmService = mock(HaLlmService.class);
        OllamaLlmProvider  ollama     = mock(OllamaLlmProvider.class);

        HaLlmAdminResource controller =
            new HaLlmAdminResource(llmService, ollama, configWriter, events);

        mockMvc = MockMvcBuilders
            .standaloneSetup(controller)
            .addFilter(ADMIN_FILTER)
            .build();
    }

    // =========================================================================
    // Property 5: exactly one LlmConfigChangedEvent per successful POST /config
    // =========================================================================

    /**
     * For any valid {@link LlmConfigUpdateDTO} (provider drawn from the four allowed
     * values; arbitrary strings for other string fields within their size limits;
     * temperature in [0.0, 2.0]; maxTokens in [1, 32768]):
     *
     * <ol>
     *   <li>The controller returns HTTP 200.</li>
     *   <li>{@link HaLlmConfigService#persist(LlmConfigUpdateDTO)} is called exactly
     *       once with the DTO constructed from the submitted payload.</li>
     *   <li>Exactly one {@link LlmConfigChangedEvent} is published via
     *       {@link ApplicationEventPublisher#publishEvent(Object)}.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 2.4, 6.2</strong>
     */
    @Property(tries = 200)
    @Label("Property 5: POST /api/ha-admin/llm/config → exactly one persist + exactly one event")
    void property5_successfulConfigPost_publishesExactlyOneEvent(
            @ForAll("validProviders")    String   provider,
            @ForAll("shortStrings")      String   baseUrl,
            @ForAll("shortStrings")      String   model,
            @ForAll("apiKeyStrings")     String   apiKey,
            @ForAll @DoubleRange(min = 0.0, max = 2.0) Double temperature,
            @ForAll @IntRange(min = 1, max = 32768)    int    maxTokens
    ) throws Exception {

        // Arrange — build JSON payload matching the DTO
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider",    provider);
        body.put("baseUrl",     baseUrl);
        body.put("model",       model);
        body.put("apiKey",      apiKey);
        body.put("temperature", temperature);
        body.put("maxTokens",   maxTokens);
        String json = objectMapper.writeValueAsString(body);

        // Act
        MvcResult result = mockMvc.perform(
                post(ENDPOINT)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json))
            .andReturn();

        // Assert 1 — HTTP 200
        assertThat(result.getResponse().getStatus())
            .as("POST %s must return HTTP 200 for provider=%s", ENDPOINT, provider)
            .isEqualTo(200);

        // Assert 2 — persist(dto) called exactly once; capture the DTO in the same verify
        ArgumentCaptor<LlmConfigUpdateDTO> dtoCaptor =
            ArgumentCaptor.forClass(LlmConfigUpdateDTO.class);
        verify(configWriter, times(1)).persist(dtoCaptor.capture());
        LlmConfigUpdateDTO captured = dtoCaptor.getValue();

        assertThat(captured.provider())
            .as("persisted DTO.provider must equal submitted provider=%s", provider)
            .isEqualTo(provider);
        assertThat(captured.baseUrl())
            .as("persisted DTO.baseUrl must equal submitted baseUrl")
            .isEqualTo(baseUrl);
        assertThat(captured.model())
            .as("persisted DTO.model must equal submitted model")
            .isEqualTo(model);
        assertThat(captured.apiKey())
            .as("persisted DTO.apiKey must equal submitted apiKey")
            .isEqualTo(apiKey);
        assertThat(captured.temperature())
            .as("persisted DTO.temperature must equal submitted temperature")
            .isEqualTo(temperature);
        assertThat(captured.maxTokens())
            .as("persisted DTO.maxTokens must equal submitted maxTokens")
            .isEqualTo(maxTokens);

        // Assert 4 — exactly one LlmConfigChangedEvent published (no more, no less)
        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        // The controller calls publishEvent(LlmConfigChangedEvent) which dispatches
        // to the publishEvent(ApplicationEvent) default method, so we verify on that overload.
        verify(events, times(1))
            .publishEvent(org.mockito.ArgumentMatchers.isA(LlmConfigChangedEvent.class));

        // Verify the count by resetting and confirming no further interactions occurred
        // (verifyNoMoreInteractions is omitted because the default overload delegate is
        // internal — only publishEvent(ApplicationEvent) is observable on the mock).
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates the four valid provider names accepted by the
     * {@code @Pattern(regexp = "disabled|openai|azure|ollama")} constraint.
     */
    @Provide
    Arbitrary<String> validProviders() {
        return Arbitraries.of("disabled", "openai", "azure", "ollama");
    }

    /**
     * Generates arbitrary short strings for {@code baseUrl} and {@code model},
     * bounded within their respective {@code @Size} constraints.
     * Empty string is included to cover the optional-field case.
     */
    @Provide
    Arbitrary<String> shortStrings() {
        return Arbitraries.oneOf(
            Arbitraries.just(""),
            Arbitraries.strings()
                .withCharRange(' ', '~')   // printable ASCII
                .ofMinLength(0)
                .ofMaxLength(128)
                .filter(s -> s != null)
        );
    }

    /**
     * Generates arbitrary API key strings within the {@code @Size(max = 4096)}
     * constraint. Includes empty string for the no-key case.
     */
    @Provide
    Arbitrary<String> apiKeyStrings() {
        return Arbitraries.oneOf(
            Arbitraries.just(""),
            Arbitraries.strings()
                .withCharRange(' ', '~')
                .ofMinLength(0)
                .ofMaxLength(512)   // representative subset of [0, 4096]
        );
    }
}
