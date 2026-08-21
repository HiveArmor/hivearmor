package com.hivearmor.web.rest;

import com.hivearmor.HiveArmorApp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for EntityGraphResource (S-8A).
 *
 * All OpenSearch calls fall back gracefully when the index is absent —
 * the resource returns empty arrays / empty graph, never 500.
 *
 * Run: cd backend && mvn -s settings.xml test -Dtest=EntityGraphResourceIT
 */
@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
class EntityGraphResourceIT {

    @Autowired
    private MockMvc mockMvc;

    // ── search ─────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void search_withValidQuery_returns200() throws Exception {
        mockMvc.perform(get("/api/ha-entities/search")
                .param("q", "192.168")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));
    }

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void search_emptyQuery_returnsEmptyArray() throws Exception {
        mockMvc.perform(get("/api/ha-entities/search")
                .param("q", "")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(content().string("[]"));
    }

    @Test
    void search_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/api/ha-entities/search")
                .param("q", "192.168")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isUnauthorized());
    }

    // ── timeline ──────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void timeline_validEntity_returns200WithArray() throws Exception {
        mockMvc.perform(get("/api/ha-entities/ip/192.168.1.1/timeline")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));
    }

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void timeline_invalidEntityType_returns400() throws Exception {
        mockMvc.perform(get("/api/ha-entities/invalid-type/test/timeline")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest());
    }

    // ── graph ─────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void graph_validEntity_returnsGraphStructure() throws Exception {
        mockMvc.perform(get("/api/ha-entities/ip/192.168.1.1/graph")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nodes").isArray())
            .andExpect(jsonPath("$.edges").isArray());
    }

    @Test
    void graph_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/api/ha-entities/ip/192.168.1.1/graph")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isUnauthorized());
    }
}
