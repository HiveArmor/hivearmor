package com.hivearmor.web.rest.evidence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.HiveArmorApp;
import com.hivearmor.domain.UtmEvidenceBoard;
import com.hivearmor.domain.UtmEvidenceItem;
import com.hivearmor.repository.UtmEvidenceBoardRepository;
import com.hivearmor.repository.UtmEvidenceItemRepository;
import com.hivearmor.repository.UtmEvidencePlacementRepository;
import com.hivearmor.service.dto.EvidenceItemDTO;
import com.hivearmor.service.dto.EvidencePlacementDTO;
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
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for EvidenceResource.
 * S-4A
 *
 * Run with: cd backend && mvn -s settings.xml test -Dtest=EvidenceResourceIT
 */
@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
@Transactional
class EvidenceResourceIT {

    private static final Long TEST_INCIDENT_ID = 999L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UtmEvidenceItemRepository itemRepository;

    @Autowired
    private UtmEvidenceBoardRepository boardRepository;

    @Autowired
    private UtmEvidencePlacementRepository placementRepository;

    @BeforeEach
    void setUp() {
        placementRepository.deleteAll();
        boardRepository.deleteAll();
        itemRepository.deleteAll();
    }

    /**
     * POST /api/ha-incidents/{id}/evidence → 201 with body
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void addItem_returnsCreated() throws Exception {
        EvidenceItemDTO request = new EvidenceItemDTO(
                null, TEST_INCIDENT_ID, "NOTE", "Test note title",
                "Note content", null, null, null, null, null
        );

        mockMvc.perform(post("/api/ha-incidents/{id}/evidence", TEST_INCIDENT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.title", is("Test note title")))
                .andExpect(jsonPath("$.itemType", is("NOTE")))
                .andExpect(jsonPath("$.createdBy", is("analyst1")));
    }

    /**
     * GET /api/ha-incidents/{id}/evidence → 200 with list
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void listItems_returnsOkWithList() throws Exception {
        // Seed one item
        UtmEvidenceItem item = new UtmEvidenceItem();
        item.setIncidentId(TEST_INCIDENT_ID);
        item.setItemType("ALERT");
        item.setTitle("Alert card");
        item.setCreatedBy("analyst1");
        item.setCreatedAt(Instant.now());
        item.setUpdatedAt(Instant.now());
        itemRepository.saveAndFlush(item);

        mockMvc.perform(get("/api/ha-incidents/{id}/evidence", TEST_INCIDENT_ID)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].title", is("Alert card")));
    }

    /**
     * GET /api/ha-incidents/{id}/evidence-boards/main → 200 with board
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void getMainBoard_returnsOkAndLazilyCreates() throws Exception {
        mockMvc.perform(get("/api/ha-incidents/{id}/evidence-boards/main", TEST_INCIDENT_ID)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.incidentId", is(TEST_INCIDENT_ID.intValue())))
                .andExpect(jsonPath("$.name", is("Main Board")));
    }

    /**
     * PUT /api/ha-incidents/{id}/evidence-boards/{boardId}/placements
     * With wrong (stale) version → 409 Conflict
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void savePlacements_withConflictVersion_returns409() throws Exception {
        // Set up a board and an item
        UtmEvidenceBoard board = new UtmEvidenceBoard();
        board.setIncidentId(TEST_INCIDENT_ID);
        board.setName("Main Board");
        board.setCreatedAt(Instant.now());
        board.setUpdatedAt(Instant.now());
        board = boardRepository.saveAndFlush(board);

        UtmEvidenceItem item = new UtmEvidenceItem();
        item.setIncidentId(TEST_INCIDENT_ID);
        item.setItemType("NOTE");
        item.setTitle("Note");
        item.setCreatedBy("analyst1");
        item.setCreatedAt(Instant.now());
        item.setUpdatedAt(Instant.now());
        item = itemRepository.saveAndFlush(item);

        // First save at version 0 — succeeds and bumps stored version to 1
        EvidencePlacementDTO placement = new EvidencePlacementDTO(
                null, board.getId(), item.getId(), 10, 20, 200, 150, 0
        );
        Map<String, Object> firstRequest = Map.of(
                "placements", List.of(placement),
                "version", 0
        );
        mockMvc.perform(put("/api/ha-incidents/{id}/evidence-boards/{boardId}/placements",
                        TEST_INCIDENT_ID, board.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(firstRequest)))
                .andExpect(status().isOk());

        // Second save still submitting version 0 — now stale, expect 409
        mockMvc.perform(put("/api/ha-incidents/{id}/evidence-boards/{boardId}/placements",
                        TEST_INCIDENT_ID, board.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(firstRequest)))
                .andExpect(status().isConflict());
    }

    /**
     * READ_ONLY user can GET evidence items.
     */
    @Test
    @WithMockUser(username = "readonly1", authorities = {"ROLE_READ_ONLY"})
    void listItems_readOnlyUser_canGet() throws Exception {
        mockMvc.perform(get("/api/ha-incidents/{id}/evidence", TEST_INCIDENT_ID)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk());
    }
}
