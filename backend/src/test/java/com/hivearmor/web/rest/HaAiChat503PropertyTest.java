package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.HaAiChatService;
import com.hivearmor.web.rest.errors.HaAiExceptionHandler;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Property 8: {@code LlmNotConfiguredException} maps to HTTP 503 uniformly.
 *
 * <p><strong>Property 8: LlmNotConfiguredException maps to HTTP 503 uniformly</strong><br>
 * For every AI endpoint added by this sprint, when {@code HaLlmService} throws
 * {@link LlmNotConfiguredException}, the HTTP response is status 503 with body
 * {@code {"error":"AI features are disabled — configure an AI provider in Admin → Settings"}}.
 *
 * <p><strong>Validates: Requirements 6.2, 6.3, 13.7</strong>
 */
@Label("Feature: sprint-25-ai-chat, Property 8: LlmNotConfiguredException uniform 503 mapping")
class HaAiChat503PropertyTest {

    private static final String EXPECTED_ERROR_MSG =
        "AI features are disabled \u2014 configure an AI provider in Admin \u2192 Settings";

    private MockMvc mockMvc;
    private HaAiChatService chatService;
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    private static final OncePerRequestFilter ANALYST_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest req,
                                        HttpServletResponse resp,
                                        FilterChain chain)
                throws ServletException, IOException {
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                    "analyst", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_ANALYST"))));
            chain.doFilter(req, resp);
        }
    };

    @BeforeTry
    void setUp() {
        chatService = mock(HaAiChatService.class);
        HaAiChatResource controller = new HaAiChatResource(chatService, mapper);
        mockMvc = MockMvcBuilders
            .standaloneSetup(controller)
            .setControllerAdvice(new HaAiExceptionHandler())
            .addFilter(ANALYST_FILTER)
            .build();
    }

    // =========================================================================
    // Property 8-A: POST /chat → 503 when LlmNotConfiguredException
    // =========================================================================

    @Property(tries = 10)
    @Label("Property 8-A: POST /chat returns 503 when LLM not configured")
    void property8a_chatEndpoint_returns503() throws Exception {
        when(chatService.streamChat(any(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));

        String body = mapper.writeValueAsString(Map.of(
            "messages", List.of(Map.of("role", "user", "content", "hello")),
            "contextType", "general"
        ));

        var result = mockMvc.perform(post("/api/ha-ai/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .content(body))
            .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertErrorBody(result.getResponse().getContentAsString());
    }

    // =========================================================================
    // Property 8-B: POST /triage → 503
    // =========================================================================

    @Property(tries = 10)
    @Label("Property 8-B: POST /triage returns 503 when LLM not configured")
    void property8b_triageEndpoint_returns503() throws Exception {
        when(chatService.generateTriage(anyString(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));

        String body = mapper.writeValueAsString(Map.of("alertId", "alert-1"));

        var result = mockMvc.perform(post("/api/ha-ai/triage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertErrorBody(result.getResponse().getContentAsString());
    }

    // =========================================================================
    // Property 8-C: POST /incident-summary → 503
    // =========================================================================

    @Property(tries = 10)
    @Label("Property 8-C: POST /incident-summary returns 503 when LLM not configured")
    void property8c_incidentSummaryEndpoint_returns503() throws Exception {
        when(chatService.generateIncidentSummary(anyString(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));

        String body = mapper.writeValueAsString(Map.of("incidentId", "inc-1"));

        var result = mockMvc.perform(post("/api/ha-ai/incident-summary")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertErrorBody(result.getResponse().getContentAsString());
    }

    // =========================================================================
    // Property 8-D: POST /chat/history → 503
    // =========================================================================

    @Property(tries = 10)
    @Label("Property 8-D: POST /chat/history returns 503 when LLM not configured")
    void property8d_saveHistoryEndpoint_returns503() throws Exception {
        when(chatService.saveHistory(any(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));

        String body = mapper.writeValueAsString(Map.of(
            "messages", List.of(Map.of("role", "user", "content", "test")),
            "contextType", "general"
        ));

        var result = mockMvc.perform(post("/api/ha-ai/chat/history")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertErrorBody(result.getResponse().getContentAsString());
    }

    // =========================================================================
    // Property 8-E: GET /chat/history → 503
    // =========================================================================

    @Property(tries = 10)
    @Label("Property 8-E: GET /chat/history returns 503 when LLM not configured")
    void property8e_listHistoryEndpoint_returns503() throws Exception {
        when(chatService.getHistory(anyString(), any(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));

        var result = mockMvc.perform(get("/api/ha-ai/chat/history")
                .param("contextType", "general"))
            .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertErrorBody(result.getResponse().getContentAsString());
    }

    // =========================================================================
    // Helper
    // =========================================================================

    private void assertErrorBody(String body) throws Exception {
        assertThat(body).isNotBlank();
        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = mapper.readValue(body, Map.class);
        assertThat(parsed).containsKey("error");
        assertThat(parsed.get("error").toString()).isEqualTo(EXPECTED_ERROR_MSG);
    }
}
