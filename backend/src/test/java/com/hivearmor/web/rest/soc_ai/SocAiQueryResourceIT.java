package com.hivearmor.web.rest.soc_ai;

import com.hivearmor.HiveArmorApp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for SocAiQueryResource (S-8B).
 *
 * When SOC_AI_BASE_URL is not set (default in unit tests),
 * the resource returns a graceful fallback — never a 500.
 *
 * Run: cd backend && mvn -s settings.xml test -Dtest=SocAiQueryResourceIT
 */
@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
class SocAiQueryResourceIT {

    @Autowired
    private MockMvc mockMvc;

    // ── /query ─────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void query_noAiKey_returnsGracefulFallback() throws Exception {
        mockMvc.perform(post("/api/ha-soc-ai/query")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"prompt\":\"What is the top threat today?\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.answer", notNullValue()))
            .andExpect(jsonPath("$.confidence").isNumber());
    }

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void query_emptyPrompt_returns400() throws Exception {
        mockMvc.perform(post("/api/ha-soc-ai/query")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"prompt\":\"\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void query_unauthenticated_returns401() throws Exception {
        mockMvc.perform(post("/api/ha-soc-ai/query")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"prompt\":\"test\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "readonly", authorities = {"ROLE_READ_ONLY"})
    void query_readOnlyRole_returns403() throws Exception {
        mockMvc.perform(post("/api/ha-soc-ai/query")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"prompt\":\"test\"}"))
            .andExpect(status().isForbidden());
    }

    // ── /enrich-alert ──────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void enrichAlert_noAiKey_returnsGracefulFallback() throws Exception {
        mockMvc.perform(post("/api/ha-soc-ai/enrich-alert")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"alertId\":\"alert-123\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary", notNullValue()));
    }

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void enrichAlert_missingAlertId_returns400() throws Exception {
        mockMvc.perform(post("/api/ha-soc-ai/enrich-alert")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"alertId\":\"\"}"))
            .andExpect(status().isBadRequest());
    }
}
