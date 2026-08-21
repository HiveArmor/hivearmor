package com.hivearmor.web.rest.hunt;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.HaAlertFacetService;
import com.hivearmor.service.hunt.HaAlertQueryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests for filter validation and error handling in {@link HaAlertQueueResource}.
 *
 * <p>Validates the endpoint-level integration of:
 * <ul>
 *   <li>Unknown filter parameter → 400 INVALID_FILTER</li>
 *   <li>Invalid severity value → 400 INVALID_FILTER</li>
 *   <li>Invalid status value → 400 INVALID_FILTER</li>
 *   <li>q parameter exceeding 1024 chars → 400 QUERY_PARSE_ERROR with offset</li>
 *   <li>Valid new filters (riskMin, sla, threatIntel) are accepted</li>
 * </ul>
 *
 * <p>Satisfies: Sprint 36 Task 2 — S36-T01
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@Tag("Feature: sprint-36-alert-queue-contracts")
class HaAlertQueueFilterValidationTest {

    @Mock
    private OpensearchClientBuilder osClient;

    @Mock
    private MsspIndexResolver indexResolver;

    @Mock
    private HaAlertFacetService facetService;

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        HaAlertQueryService alertQueryService = new HaAlertQueryService();
        HaAlertQueueResource resource = new HaAlertQueueResource(
            osClient, indexResolver, objectMapper, alertQueryService, facetService,
            new com.hivearmor.service.hunt.AlertActionResolver());
        mockMvc = MockMvcBuilders.standaloneSetup(resource).build();
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
    }

    // =========================================================================
    // Unknown filter parameter → 400 INVALID_FILTER
    // =========================================================================

    @Test
    @DisplayName("unknown filter parameter returns 400 INVALID_FILTER")
    void unknownFilterParam_returns400() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        MvcResult result = mockMvc.perform(get("/api/ha-alerts")
                .param("unknownParam", "value")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andReturn();

        Map<String, Object> error = objectMapper.readValue(
            result.getResponse().getContentAsString(), new TypeReference<>() {});
        assertThat(error.get("errorCode")).isEqualTo("INVALID_FILTER");
        assertThat(error.get("message")).asString().contains("unknownParam");
    }

    // =========================================================================
    // Invalid severity value → 400 INVALID_FILTER
    // =========================================================================

    @Test
    @DisplayName("invalid severity value returns 400 INVALID_FILTER")
    void invalidSeverity_returns400() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        MvcResult result = mockMvc.perform(get("/api/ha-alerts")
                .param("severity", "extreme")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andReturn();

        Map<String, Object> error = objectMapper.readValue(
            result.getResponse().getContentAsString(), new TypeReference<>() {});
        assertThat(error.get("errorCode")).isEqualTo("INVALID_FILTER");
        assertThat(error.get("message")).asString().contains("extreme");
    }

    // =========================================================================
    // Invalid status value → 400 INVALID_FILTER
    // =========================================================================

    @Test
    @DisplayName("invalid status value returns 400 INVALID_FILTER")
    void invalidStatus_returns400() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        MvcResult result = mockMvc.perform(get("/api/ha-alerts")
                .param("status", "unknown_status")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andReturn();

        Map<String, Object> error = objectMapper.readValue(
            result.getResponse().getContentAsString(), new TypeReference<>() {});
        assertThat(error.get("errorCode")).isEqualTo("INVALID_FILTER");
        assertThat(error.get("message")).asString().contains("unknown_status");
    }

    // =========================================================================
    // q parameter exceeding 1024 chars → 400 QUERY_PARSE_ERROR
    // =========================================================================

    @Test
    @DisplayName("q exceeding 1024 chars returns 400 QUERY_PARSE_ERROR with offset")
    void queryTooLong_returns400WithOffset() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 1100; i++) sb.append("a");

        MvcResult result = mockMvc.perform(get("/api/ha-alerts")
                .param("q", sb.toString())
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andReturn();

        Map<String, Object> error = objectMapper.readValue(
            result.getResponse().getContentAsString(), new TypeReference<>() {});
        assertThat(error.get("errorCode")).isEqualTo("QUERY_PARSE_ERROR");
        assertThat(error.get("offset")).isEqualTo(1024);
        assertThat(error.get("expectedTokens")).isNotNull();
    }

    // =========================================================================
    // q parameter with parse error → 400 QUERY_PARSE_ERROR
    // =========================================================================

    @Test
    @DisplayName("q with unterminated quote returns 400 QUERY_PARSE_ERROR")
    void queryParseError_returns400() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        MvcResult result = mockMvc.perform(get("/api/ha-alerts")
                .param("q", "\"unterminated phrase")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andReturn();

        Map<String, Object> error = objectMapper.readValue(
            result.getResponse().getContentAsString(), new TypeReference<>() {});
        assertThat(error.get("errorCode")).isEqualTo("QUERY_PARSE_ERROR");
        assertThat(error).containsKey("offset");
        assertThat(error).containsKey("expectedTokens");
    }

    // =========================================================================
    // Invalid riskMin value → 400 INVALID_FILTER
    // =========================================================================

    @Test
    @DisplayName("non-numeric riskMin returns 400 INVALID_FILTER")
    void invalidRiskMin_returns400() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        MvcResult result = mockMvc.perform(get("/api/ha-alerts")
                .param("riskMin", "abc")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andReturn();

        Map<String, Object> error = objectMapper.readValue(
            result.getResponse().getContentAsString(), new TypeReference<>() {});
        assertThat(error.get("errorCode")).isEqualTo("INVALID_FILTER");
    }

    // =========================================================================
    // Invalid SLA value → 400 INVALID_FILTER
    // =========================================================================

    @Test
    @DisplayName("invalid sla value returns 400 INVALID_FILTER")
    void invalidSla_returns400() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        MvcResult result = mockMvc.perform(get("/api/ha-alerts")
                .param("sla", "expired")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andReturn();

        Map<String, Object> error = objectMapper.readValue(
            result.getResponse().getContentAsString(), new TypeReference<>() {});
        assertThat(error.get("errorCode")).isEqualTo("INVALID_FILTER");
    }

    // =========================================================================
    // Invalid threatIntel value → 400 INVALID_FILTER
    // =========================================================================

    @Test
    @DisplayName("invalid threatIntel value returns 400 INVALID_FILTER")
    void invalidThreatIntel_returns400() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        MvcResult result = mockMvc.perform(get("/api/ha-alerts")
                .param("threatIntel", "unmatched")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andReturn();

        Map<String, Object> error = objectMapper.readValue(
            result.getResponse().getContentAsString(), new TypeReference<>() {});
        assertThat(error.get("errorCode")).isEqualTo("INVALID_FILTER");
    }

    // =========================================================================
    // Valid new filter parameters are accepted (no 400)
    // =========================================================================

    @Test
    @DisplayName("valid riskMin, sla, threatIntel params are accepted")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void validNewFilters_accepted() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");

        // Stub osClient.execute() to return a minimal valid response
        when(osClient.execute(any())).thenAnswer(invocation -> {
            // Return null to trigger the resource's null-safe handling path
            // This test validates that filter params are accepted (not rejected as unknown)
            // without requiring a full SearchResponse
            return null;
        });

        // The request should not fail with INVALID_FILTER —
        // it may fail with 500 because of null SearchResponse but that's OK for this test.
        MvcResult result = mockMvc.perform(get("/api/ha-alerts")
                .param("riskMin", "50")
                .param("sla", "at_risk")
                .param("threatIntel", "matched")
                .param("severity", "critical,high")
                .param("status", "active")
                .accept(MediaType.APPLICATION_JSON))
            .andReturn();

        // Verify it did NOT return INVALID_FILTER (it either succeeds or fails for other reasons)
        int status = result.getResponse().getStatus();
        if (status == 400) {
            String body = result.getResponse().getContentAsString();
            Map<String, Object> error = objectMapper.readValue(body, new TypeReference<>() {});
            // If 400, must NOT be INVALID_FILTER — that would mean our valid params were rejected
            assertThat(error.get("errorCode")).isNotEqualTo("INVALID_FILTER");
        }
        // status 200 or 500 (from null response) are both acceptable
    }

    // =========================================================================
    // Valid assignee=me with auth context
    // =========================================================================

    @Test
    @DisplayName("assignee=me with authenticated user is accepted")
    @SuppressWarnings({"unchecked", "rawtypes"})
    void assigneeMe_withAuth_accepted() throws Exception {
        TenantContext.set("acme");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-acme-*");
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken("analyst1", "pass"));

        when(osClient.execute(any())).thenAnswer(invocation -> null);

        MvcResult result = mockMvc.perform(get("/api/ha-alerts")
                .param("assignee", "me")
                .accept(MediaType.APPLICATION_JSON))
            .andReturn();

        // Verify it did NOT return INVALID_FILTER
        int status = result.getResponse().getStatus();
        if (status == 400) {
            String body = result.getResponse().getContentAsString();
            Map<String, Object> error = objectMapper.readValue(body, new TypeReference<>() {});
            assertThat(error.get("errorCode")).isNotEqualTo("INVALID_FILTER");
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================
}
