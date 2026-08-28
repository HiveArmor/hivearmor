package com.hivearmor.web.rest.intelligence;

import com.hivearmor.HiveArmorApp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
class IntelligenceFindingResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void listFindings_returns200() throws Exception {
        mockMvc.perform(get("/api/ha-intelligence/findings"))
            .andExpect(status().isOk())
            .andExpect(header().exists("X-Total-Count"));
    }

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void createFinding_returns201WithFacts() throws Exception {
        mockMvc.perform(post("/api/ha-intelligence/findings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "title": "Test finding",
                      "summary": "Summary",
                      "answer": "Answer",
                      "facts": [{"text": "Observed IOC in feed"}],
                      "inferences": [{"text": "Possible C2"}],
                      "contradictions": [],
                      "missingEvidence": ["Endpoint logs"],
                      "confidence": 0.5,
                      "confidenceExplanation": "STAGING CANDIDATE",
                      "sources": [],
                      "provenance": "manual"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id", notNullValue()))
            .andExpect(jsonPath("$.facts[0].text", containsString("Observed IOC")));
    }

    @Test
    void listFindings_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/api/ha-intelligence/findings"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "readonly", authorities = {"ROLE_READ_ONLY"})
    void listFindings_readOnly_returns403() throws Exception {
        mockMvc.perform(get("/api/ha-intelligence/findings"))
            .andExpect(status().isForbidden());
    }
}
