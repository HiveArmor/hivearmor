package com.hivearmor.web.rest;

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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for DatasetResource.
 * S-7A
 *
 * Run with: cd backend && mvn -s settings.xml test -Dtest=DatasetResourceIT
 */
@SpringBootTest(classes = HiveArmorApp.class)
@AutoConfigureMockMvc
class DatasetResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void getDatasets_authenticated_returnsAtLeastFiveDatasets() throws Exception {
        mockMvc.perform(get("/api/ha-datasets").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(5))))
                .andExpect(jsonPath("$[0].id", notNullValue()))
                .andExpect(jsonPath("$[0].label", notNullValue()))
                .andExpect(jsonPath("$[0].indexPattern", notNullValue()))
                .andExpect(jsonPath("$[0].description", notNullValue()));
    }

    @Test
    @WithMockUser(username = "analyst", authorities = {"ROLE_ANALYST"})
    void getDatasets_containsAlerts() throws Exception {
        mockMvc.perform(get("/api/ha-datasets").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem("alerts")))
                .andExpect(jsonPath("$[*].indexPattern", hasItem("v3-hive-alert-*")));
    }

    @Test
    @WithMockUser(username = "readonly", authorities = {"ROLE_READ_ONLY"})
    void getDatasets_readOnlyRole_returns200() throws Exception {
        mockMvc.perform(get("/api/ha-datasets").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk());
    }

    @Test
    void getDatasets_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/api/ha-datasets").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized());
    }
}
