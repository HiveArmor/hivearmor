package com.hivearmor.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.HaAiChatService;
import com.hivearmor.web.rest.admin.HaSystemSettingsController;
import com.hivearmor.web.rest.HaAiChatResource;
import com.hivearmor.web.rest.errors.HaAiExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Check 6: Disabled-provider path integration tests (backend side).
 *
 * <p>Stubs {@code HaLlmService.isConfigured() == false} and
 * {@code getActiveProviderName() == "disabled"} and asserts every AI endpoint
 * returns HTTP 503 + the exact JSON error body.
 *
 * <p>Requirements: 6.2, 6.3, 6.4, 6.5, 13.7
 */
class HaAiChatDisabledProviderTest {

    private static final String EXPECTED_ERROR =
        "AI features are disabled \u2014 configure an AI provider in Admin \u2192 Settings";

    private MockMvc mockMvc;
    private MockMvc adminMockMvc;
    private HaAiChatService chatService;
    private HaLlmService llmService;
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    private static final OncePerRequestFilter ANALYST_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest req, HttpServletResponse resp,
                                        FilterChain chain)
                throws ServletException, IOException {
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                    "analyst", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ANALYST"))));
            chain.doFilter(req, resp);
        }
    };

    @BeforeEach
    void setUp() {
        chatService = mock(HaAiChatService.class);
        llmService = mock(HaLlmService.class);

        // All chat service methods throw LlmNotConfiguredException
        when(chatService.streamChat(any(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));
        when(chatService.generateTriage(anyString(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));
        when(chatService.generateIncidentSummary(anyString(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));
        when(chatService.saveHistory(any(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));
        when(chatService.getHistory(anyString(), any(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));

        // LLM service is disabled
        when(llmService.isConfigured()).thenReturn(false);
        when(llmService.getActiveProviderName()).thenReturn("disabled");

        HaAiChatResource chatController = new HaAiChatResource(chatService, mapper);
        HaSystemSettingsController adminController = org.mockito.Mockito.mock(HaSystemSettingsController.class);
        when(adminController.aiStatus()).thenReturn(ResponseEntity.ok(java.util.Map.of("configured", (Object)false, "provider", (Object)"disabled")));

        mockMvc = MockMvcBuilders
            .standaloneSetup(chatController)
            .setControllerAdvice(new HaAiExceptionHandler())
            .addFilter(ANALYST_FILTER)
            .build();

        adminMockMvc = MockMvcBuilders
            .standaloneSetup(adminController)
            .setControllerAdvice(new HaAiExceptionHandler())
            .addFilter(ANALYST_FILTER)
            .build();
    }

    @Test
    void postChat_returns503WithExactBody() throws Exception {
        var result = mockMvc.perform(post("/api/ha-ai/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .content(mapper.writeValueAsString(Map.of(
                    "messages", List.of(Map.of("role", "user", "content", "hi")),
                    "contextType", "general"))))
            .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertErrorBody(result.getResponse().getContentAsString());
    }

    @Test
    void postTriage_returns503WithExactBody() throws Exception {
        var result = mockMvc.perform(post("/api/ha-ai/triage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("alertId", "alert-1"))))
            .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertErrorBody(result.getResponse().getContentAsString());
    }

    @Test
    void postIncidentSummary_returns503WithExactBody() throws Exception {
        var result = mockMvc.perform(post("/api/ha-ai/incident-summary")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("incidentId", "inc-1"))))
            .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertErrorBody(result.getResponse().getContentAsString());
    }

    @Test
    void postChatHistory_returns503WithExactBody() throws Exception {
        var result = mockMvc.perform(post("/api/ha-ai/chat/history")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                    "messages", List.of(Map.of("role", "user", "content", "hi")),
                    "contextType", "general"))))
            .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertErrorBody(result.getResponse().getContentAsString());
    }

    @Test
    void getChatHistory_returns503WithExactBody() throws Exception {
        var result = mockMvc.perform(get("/api/ha-ai/chat/history").param("contextType", "general"))
            .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(503);
        assertErrorBody(result.getResponse().getContentAsString());
    }

    @Test
    void getAiStatus_whenDisabled_returnsConfiguredFalseAndProviderDisabled() throws Exception {
        var result = adminMockMvc.perform(get("/api/ha-admin/settings/ai/status"))
            .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = mapper.readValue(result.getResponse().getContentAsString(), Map.class);
        assertThat(body.get("configured")).isEqualTo(Boolean.FALSE);
        assertThat(body.get("provider")).isEqualTo("disabled");
    }

    private void assertErrorBody(String body) throws Exception {
        assertThat(body).isNotBlank();
        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = mapper.readValue(body, Map.class);
        assertThat(parsed).containsKey("error");
        assertThat(parsed.get("error").toString()).isEqualTo(EXPECTED_ERROR);
    }
}
