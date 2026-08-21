package com.hivearmor.web.rest.evidence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.HiveArmorApp;
import com.hivearmor.domain.UtmEvidenceItem;
import com.hivearmor.domain.incident.UtmIncidentHistory;
import com.hivearmor.domain.incident.UtmIncidentNote;
import com.hivearmor.domain.incident.enums.IncidentHistoryActionEnum;
import com.hivearmor.repository.UtmEvidenceItemRepository;
import com.hivearmor.repository.incident.UtmIncidentHistoryRepository;
import com.hivearmor.repository.incident.UtmIncidentNoteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for GET /api/ha-incidents/{id}/timeline (S-4B).
 *
 * Run with: cd backend && mvn -s settings.xml test -Dtest=TimelineResourceIT
 */
@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
@Transactional
class TimelineResourceIT {

    private static final Long TEST_INCIDENT_ID = 9991L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UtmIncidentHistoryRepository historyRepository;

    @Autowired
    private UtmIncidentNoteRepository noteRepository;

    @Autowired
    private UtmEvidenceItemRepository evidenceItemRepository;

    @BeforeEach
    void setUp() {
        evidenceItemRepository.deleteAll();
        noteRepository.deleteAll();
        historyRepository.deleteAll();
    }

    /**
     * GET /api/ha-incidents/{id}/timeline → 200 with a List (possibly empty).
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void getTimeline_returnsOk() throws Exception {
        mockMvc.perform(get("/api/ha-incidents/{id}/timeline", TEST_INCIDENT_ID)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));
    }

    /**
     * Empty incident (no history, notes, or evidence) → 200 with empty list, NOT 500.
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void getTimeline_emptyIncident_returnsEmptyList() throws Exception {
        mockMvc.perform(get("/api/ha-incidents/{id}/timeline", TEST_INCIDENT_ID)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    /**
     * READ_ONLY role can GET timeline.
     */
    @Test
    @WithMockUser(username = "readonly1", authorities = {"ROLE_READ_ONLY"})
    void getTimeline_readOnlyRole_canAccess() throws Exception {
        mockMvc.perform(get("/api/ha-incidents/{id}/timeline", TEST_INCIDENT_ID)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk());
    }

    /**
     * Timeline with events from multiple sources is sorted ascending by eventAt.
     * Seeds:
     *  - a history row at T+1
     *  - a note at T+0
     *  - an evidence item at T+2
     * Expects order: note → history → evidence.
     */
    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void getTimeline_multipleSources_sortedAscending() throws Exception {
        Instant base = Instant.now().truncatedTo(ChronoUnit.SECONDS);

        // Note at T+0
        UtmIncidentNote note = new UtmIncidentNote();
        note.setIncidentId(TEST_INCIDENT_ID);
        note.setNoteText("First analyst note");
        note.setNoteSendDate(base);
        note.setNoteSendBy("analyst1");
        noteRepository.saveAndFlush(note);

        // History entry at T+1
        UtmIncidentHistory history = new UtmIncidentHistory();
        history.setIncidentId(TEST_INCIDENT_ID);
        history.setActionDate(base.plusSeconds(1));
        history.setActionType(IncidentHistoryActionEnum.INCIDENT_STATUS_CHANGE);
        history.setActionCreatedBy("analyst1");
        history.setAction("Status changed to IN_REVIEW");
        historyRepository.saveAndFlush(history);

        // Evidence item at T+2
        UtmEvidenceItem evidence = new UtmEvidenceItem();
        evidence.setIncidentId(TEST_INCIDENT_ID);
        evidence.setItemType("NOTE");
        evidence.setTitle("Evidence card");
        evidence.setCreatedBy("analyst1");
        evidence.setCreatedAt(base.plusSeconds(2));
        evidence.setUpdatedAt(base.plusSeconds(2));
        evidenceItemRepository.saveAndFlush(evidence);

        MvcResult result = mockMvc.perform(get("/api/ha-incidents/{id}/timeline", TEST_INCIDENT_ID)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        List<Map<String, Object>> events = objectMapper.readValue(
                body,
                objectMapper.getTypeFactory().constructCollectionType(List.class, Map.class)
        );

        // Should have at least 3 events (note + history + evidence; alert-linked rows=0)
        assertThat(events).hasSizeGreaterThanOrEqualTo(3);

        // Verify ascending sort: each eventAt should be <= the next
        for (int i = 0; i < events.size() - 1; i++) {
            String t1 = (String) events.get(i).get("eventAt");
            String t2 = (String) events.get(i + 1).get("eventAt");
            if (t1 != null && t2 != null) {
                assertThat(Instant.parse(t1)).isBeforeOrEqualTo(Instant.parse(t2));
            }
        }

        // First event (from the note) should be of type NOTE
        assertThat(events.get(0).get("eventType")).isEqualTo("NOTE");
    }
}
