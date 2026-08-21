package com.hivearmor.web.rest.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.HiveArmorApp;
import com.hivearmor.domain.UtmInvestigationSession;
import com.hivearmor.domain.UtmSessionItem;
import com.hivearmor.repository.UtmInvestigationSessionRepository;
import com.hivearmor.repository.UtmSessionItemRepository;
import com.hivearmor.service.dto.InvestigationSessionDTO;
import com.hivearmor.service.dto.SessionItemDTO;
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
 * Integration tests for InvestigationSessionResource.
 * S-5C
 *
 * Run with: cd backend && mvn -s settings.xml test -Dtest=InvestigationSessionResourceIT
 */
@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
@Transactional
class InvestigationSessionResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UtmInvestigationSessionRepository sessionRepository;

    @Autowired
    private UtmSessionItemRepository itemRepository;

    @BeforeEach
    void setUp() {
        itemRepository.deleteAll();
        sessionRepository.deleteAll();
    }

    // ── POST session ──────────────────────────────────────────────────────────

    /**
     * POST /api/ha-investigation-sessions → 201
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void createSession_returnsCreated() throws Exception {
        InvestigationSessionDTO dto = new InvestigationSessionDTO(
                null, "APT Investigation", "Suspected APT activity", "ACTIVE",
                null, "analyst1", null, null, null, null);

        mockMvc.perform(post("/api/ha-investigation-sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.sessionName", is("APT Investigation")))
                .andExpect(jsonPath("$.createdBy", is("analyst1")))
                .andExpect(jsonPath("$.status", is("ACTIVE")));
    }

    /**
     * READ_ONLY POST → 403
     */
    @Test
    @WithMockUser(username = "readonly1", authorities = {"ROLE_READ_ONLY"})
    void createSession_readOnly_returns403() throws Exception {
        InvestigationSessionDTO dto = new InvestigationSessionDTO(
                null, "Blocked", null, "ACTIVE", null, null, null, null, null, null);

        mockMvc.perform(post("/api/ha-investigation-sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isForbidden());
    }

    // ── GET sessions ──────────────────────────────────────────────────────────

    /**
     * GET /api/ha-investigation-sessions → 200 with X-Total-Count header
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void listSessions_returnsOkWithHeader() throws Exception {
        saveSession("analyst1", "Session A");
        saveSession("analyst1", "Session B");

        mockMvc.perform(get("/api/ha-investigation-sessions")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Total-Count"))
                .andExpect(jsonPath("$", hasSize(2)));
    }

    /**
     * ADMIN sees all sessions, ANALYST sees only own.
     */
    @Test
    @WithMockUser(username = "admin1", authorities = {"ROLE_ADMIN"})
    void listSessions_adminSeesAll() throws Exception {
        saveSession("analyst1", "Session A");
        saveSession("analyst2", "Session B");

        mockMvc.perform(get("/api/ha-investigation-sessions")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)));
    }

    /**
     * READ_ONLY GET → 200 (allowed to read)
     */
    @Test
    @WithMockUser(username = "readonly1", authorities = {"ROLE_READ_ONLY"})
    void listSessions_readOnly_canGet() throws Exception {
        mockMvc.perform(get("/api/ha-investigation-sessions")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk());
    }

    // ── POST item ─────────────────────────────────────────────────────────────

    /**
     * POST /api/ha-investigation-sessions/{id}/items → 201
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void pinItem_returnsCreated() throws Exception {
        UtmInvestigationSession session = saveSession("analyst1", "Session A");

        SessionItemDTO item = new SessionItemDTO(
                null, null, "LOG_EVENT", "doc-abc123",
                "{\"message\":\"test\"}", null, null, null);

        mockMvc.perform(post("/api/ha-investigation-sessions/{id}/items", session.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(item)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.itemType", is("LOG_EVENT")))
                .andExpect(jsonPath("$.itemRef", is("doc-abc123")))
                .andExpect(jsonPath("$.addedBy", is("analyst1")));
    }

    // ── GET items ─────────────────────────────────────────────────────────────

    /**
     * GET /api/ha-investigation-sessions/{id}/items → 200 list
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void listItems_returnsOkList() throws Exception {
        UtmInvestigationSession session = saveSession("analyst1", "Session A");
        saveItem(session, "LOG_EVENT", "doc-1");
        saveItem(session, "ALERT", "alert-42");

        mockMvc.perform(get("/api/ha-investigation-sessions/{id}/items", session.getId())
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)));
    }

    /**
     * GET items with ?type= filter returns only matching items.
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void listItems_withTypeFilter_returnsFiltered() throws Exception {
        UtmInvestigationSession session = saveSession("analyst1", "Session A");
        saveItem(session, "LOG_EVENT", "doc-1");
        saveItem(session, "ALERT", "alert-42");

        mockMvc.perform(get("/api/ha-investigation-sessions/{id}/items", session.getId())
                        .param("type", "ALERT")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].itemType", is("ALERT")));
    }

    // ── DELETE item ───────────────────────────────────────────────────────────

    /**
     * DELETE /api/ha-investigation-sessions/{id}/items/{itemId} → 204
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void unpinItem_returnsNoContent() throws Exception {
        UtmInvestigationSession session = saveSession("analyst1", "Session A");
        UtmSessionItem item = saveItem(session, "LOG_EVENT", "doc-1");

        mockMvc.perform(delete("/api/ha-investigation-sessions/{id}/items/{itemId}",
                        session.getId(), item.getId()))
                .andExpect(status().isNoContent());
    }

    /**
     * DELETE item owned by someone else → 403
     */
    @Test
    @WithMockUser(username = "analyst2", authorities = {"ROLE_ANALYST"})
    void unpinItem_otherUser_returns403() throws Exception {
        UtmInvestigationSession session = saveSession("analyst1", "Session A");
        UtmSessionItem item = saveItem(session, "LOG_EVENT", "doc-1");

        mockMvc.perform(delete("/api/ha-investigation-sessions/{id}/items/{itemId}",
                        session.getId(), item.getId()))
                .andExpect(status().isForbidden());
    }

    // ── Convert to incident ───────────────────────────────────────────────────

    /**
     * POST /api/ha-investigation-sessions/{id}/convert-to-incident → 200 with incidentId field
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void convertToIncident_returnsIncidentId() throws Exception {
        UtmInvestigationSession session = saveSession("analyst1", "Phishing Campaign");

        mockMvc.perform(post("/api/ha-investigation-sessions/{id}/convert-to-incident", session.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.incidentId", notNullValue()));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private UtmInvestigationSession saveSession(String createdBy, String name) {
        UtmInvestigationSession s = new UtmInvestigationSession();
        s.setCreatedBy(createdBy);
        s.setSessionName(name);
        s.setStatus("ACTIVE");
        s.setCreatedAt(Instant.now());
        s.setUpdatedAt(Instant.now());
        return sessionRepository.saveAndFlush(s);
    }

    private UtmSessionItem saveItem(UtmInvestigationSession session, String itemType, String itemRef) {
        UtmSessionItem item = new UtmSessionItem();
        item.setSession(session);
        item.setItemType(itemType);
        item.setItemRef(itemRef);
        item.setAddedBy(session.getCreatedBy());
        item.setAddedAt(Instant.now());
        return itemRepository.saveAndFlush(item);
    }
}
