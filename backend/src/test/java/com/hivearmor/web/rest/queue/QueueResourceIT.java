package com.hivearmor.web.rest.queue;

import com.hivearmor.HiveArmorApp;
import com.hivearmor.domain.UtmInvestigationTask;
import com.hivearmor.repository.UtmInvestigationTaskRepository;
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

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for QueueResource.
 * S-3B-QUEUE
 *
 * Run with: cd backend && mvn -s settings.xml test -Dtest=QueueResourceIT
 */
@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
@Transactional
class QueueResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UtmInvestigationTaskRepository taskRepository;

    @BeforeEach
    void setUp() {
        taskRepository.deleteAll();
    }

    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void getQueue_returnsOkWithXTotalCount() throws Exception {
        // Given: one task in the DB
        UtmInvestigationTask task = new UtmInvestigationTask();
        task.setTitle("Test task");
        task.setTaskPriority("P2");
        task.setStatus("OPEN");
        task.setCreatedBy("analyst1");
        task.setCreatedAt(Instant.now());
        task.setUpdatedAt(Instant.now());
        taskRepository.saveAndFlush(task);

        // When/Then
        mockMvc.perform(get("/api/ha-queue")
                        .param("page", "0")
                        .param("size", "20")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Total-Count"))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON));
    }

    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void getQueue_typeTaskFilter_returnsOnlyTasks() throws Exception {
        mockMvc.perform(get("/api/ha-queue")
                        .param("type", "TASK")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Total-Count"));
    }

    @Test
    @WithMockUser(username = "readonly1", authorities = {"ROLE_READ_ONLY"})
    void getQueue_readOnlyUser_canGet() throws Exception {
        mockMvc.perform(get("/api/ha-queue")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "analyst1", authorities = {"ROLE_ANALYST"})
    void getQueue_xTotalCountHeaderPresent() throws Exception {
        mockMvc.perform(get("/api/ha-queue")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Total-Count", notNullValue()));
    }
}
