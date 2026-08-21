package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.HiveArmorApp;
import com.hivearmor.domain.UtmSavedQuery;
import com.hivearmor.repository.UtmSavedQueryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for SavedQueryResource.
 * S-5B
 *
 * Run with: cd backend && mvn -s settings.xml test -Dtest=SavedQueryResourceIT
 */
@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
@Transactional
class SavedQueryResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UtmSavedQueryRepository savedQueryRepository;

    @BeforeEach
    void setUp() {
        savedQueryRepository.deleteAll();
    }

    // ── POST ─────────────────────────────────────────────────────────────────

    /**
     * POST /api/ha-saved-queries → 201 with body
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void createQuery_returnsCreated() throws Exception {
        UtmSavedQuery request = buildQuery(null, "My Query", "event.outcome:failure", "v3-hive-*");

        mockMvc.perform(post("/api/ha-saved-queries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.queryName", is("My Query")))
                .andExpect(jsonPath("$.userLogin", is("analyst1")));
    }

    /**
     * READ_ONLY POST → 403
     */
    @Test
    @WithMockUser(username = "readonly1", authorities = {"ROLE_READ_ONLY"})
    void createQuery_readOnly_returns403() throws Exception {
        UtmSavedQuery request = buildQuery(null, "Blocked", "test", "v3-hive-*");

        mockMvc.perform(post("/api/ha-saved-queries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden());
    }

    // ── GET ──────────────────────────────────────────────────────────────────

    /**
     * GET /api/ha-saved-queries → 200 with list (own + shared)
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void listQueries_returnsOkWithList() throws Exception {
        // Own query
        savedQueryRepository.saveAndFlush(buildQuery("analyst1", "Own Query", "event.outcome:failure", "v3-hive-*"));
        // Shared by another user
        UtmSavedQuery shared = buildQuery("other_user", "Shared Query", "process.name:bash", "v3-hive-*");
        shared.setIsShared(true);
        savedQueryRepository.saveAndFlush(shared);
        // Private query of another user — should NOT appear
        savedQueryRepository.saveAndFlush(buildQuery("other_user", "Private", "private:query", "v3-hive-*"));

        mockMvc.perform(get("/api/ha-saved-queries")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Total-Count"))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[*].queryName", containsInAnyOrder("Own Query", "Shared Query")));
    }

    /**
     * READ_ONLY GET → 200 (allowed to read)
     */
    @Test
    @WithMockUser(username = "readonly1", authorities = {"ROLE_READ_ONLY"})
    void listQueries_readOnly_canGet() throws Exception {
        savedQueryRepository.saveAndFlush(buildQuery("readonly1", "RO Query", "source.ip:*", "v3-hive-*"));

        mockMvc.perform(get("/api/ha-saved-queries")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    // ── PUT ──────────────────────────────────────────────────────────────────

    /**
     * PUT /api/ha-saved-queries/{id} own query → 200
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void updateQuery_ownQuery_returnsOk() throws Exception {
        UtmSavedQuery saved = savedQueryRepository.saveAndFlush(
                buildQuery("analyst1", "Original Name", "event.outcome:failure", "v3-hive-*"));

        UtmSavedQuery update = buildQuery(null, "Renamed Query", "event.outcome:failure", "v3-hive-*");

        mockMvc.perform(put("/api/ha-saved-queries/{id}", saved.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.queryName", is("Renamed Query")));
    }

    /**
     * PUT /api/ha-saved-queries/{id} query owned by someone else → 403
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void updateQuery_otherUsersQuery_returns403() throws Exception {
        UtmSavedQuery saved = savedQueryRepository.saveAndFlush(
                buildQuery("other_user", "Other's Query", "event.outcome:failure", "v3-hive-*"));

        UtmSavedQuery update = buildQuery(null, "Hijacked", "bad:query", "v3-hive-*");

        mockMvc.perform(put("/api/ha-saved-queries/{id}", saved.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isForbidden());
    }

    // ── DELETE ───────────────────────────────────────────────────────────────

    /**
     * DELETE /api/ha-saved-queries/{id} own query → 204
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void deleteQuery_ownQuery_returnsNoContent() throws Exception {
        UtmSavedQuery saved = savedQueryRepository.saveAndFlush(
                buildQuery("analyst1", "To Delete", "event.outcome:failure", "v3-hive-*"));

        mockMvc.perform(delete("/api/ha-saved-queries/{id}", saved.getId()))
                .andExpect(status().isNoContent());
    }

    /**
     * DELETE /api/ha-saved-queries/{id} query owned by someone else → 403
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void deleteQuery_otherUsersQuery_returns403() throws Exception {
        UtmSavedQuery saved = savedQueryRepository.saveAndFlush(
                buildQuery("other_user", "Protected", "event.outcome:failure", "v3-hive-*"));

        mockMvc.perform(delete("/api/ha-saved-queries/{id}", saved.getId()))
                .andExpect(status().isForbidden());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private UtmSavedQuery buildQuery(String userLogin, String name, String queryText, String indexPattern) {
        UtmSavedQuery q = new UtmSavedQuery();
        q.setUserLogin(userLogin != null ? userLogin : "analyst1");
        q.setQueryName(name);
        q.setQueryText(queryText);
        q.setIndexPattern(indexPattern);
        q.setIsShared(false);
        q.setCreatedAt(Instant.now());
        q.setUpdatedAt(Instant.now());
        return q;
    }
}
