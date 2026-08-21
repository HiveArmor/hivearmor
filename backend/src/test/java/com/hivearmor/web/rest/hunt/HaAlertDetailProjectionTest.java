package com.hivearmor.web.rest.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.AlertActionResolver;
import com.hivearmor.service.hunt.HaAlertFacetService;
import com.hivearmor.service.hunt.HaAlertQueryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unit tests for the comprehensive alert detail projection in {@link HaAlertQueueResource}.
 *
 * <p><strong>Validates: Requirements 7.1, 7.2, 7.3, 7.4</strong>
 *
 * <p>Covers:
 * <ul>
 *   <li>Detail includes MITRE ATT&CK fields when present in the alert document</li>
 *   <li>Detail includes risk score breakdown</li>
 *   <li>Detail includes threat intel matches</li>
 *   <li>Detail includes timeline, available actions</li>
 *   <li>Detail includes version, dataCompleteness, primaryEntity, assignee, tenant, sla, tags</li>
 *   <li>Non-existent alert returns 404</li>
 * </ul>
 */
@DisplayName("HaAlertQueueResource — alert detail projection")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@SuppressWarnings({"unchecked", "rawtypes"})
class HaAlertDetailProjectionTest {

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
        AlertActionResolver actionResolver = new AlertActionResolver();
        HaAlertQueueResource resource = new HaAlertQueueResource(
            osClient, indexResolver, objectMapper,
            alertQueryService, facetService, actionResolver);
        mockMvc = MockMvcBuilders.standaloneSetup(resource).build();

        // Set up security context with SOC_ANALYST role
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
            "analyst1", "password",
            List.of(new SimpleGrantedAuthority("ROLE_SOC_ANALYST")));
        SecurityContextHolder.getContext().setAuthentication(auth);

        TenantContext.set("cwm");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-cwm-*");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    // =========================================================================
    // Task 8 sub-task 11: detail includes MITRE fields when present
    // =========================================================================

    @Test
    @DisplayName("Detail projection includes MITRE ATT&CK mapping when fields are present")
    void detailIncludesMitreFields_whenPresent() throws Exception {
        Map<String, Object> alertSource = buildAlertWithMitre();
        stubOsExecute("alert-123", alertSource);

        MvcResult result = mockMvc.perform(get("/api/ha-alerts/alert-123"))
            .andExpect(status().isOk())
            .andReturn();

        Map<String, Object> body = objectMapper.readValue(
            result.getResponse().getContentAsString(), Map.class);

        // Verify MITRE mapping is present
        assertThat(body).containsKey("mitreAttack");
        Map<String, Object> mitre = (Map<String, Object>) body.get("mitreAttack");
        assertThat(mitre).isNotNull();
        assertThat(mitre.get("tacticId")).isEqualTo("TA0001");
        assertThat(mitre.get("tacticName")).isEqualTo("Initial Access");
        assertThat(mitre.get("techniqueName")).isEqualTo("Phishing");
        assertThat(mitre.get("techniqueId")).isEqualTo("T1566");
        assertThat(mitre.get("subTechnique")).isEqualTo("T1566.001");
    }

    @Test
    @DisplayName("Detail projection omits MITRE mapping when fields are absent")
    void detailOmitsMitreFields_whenAbsent() throws Exception {
        Map<String, Object> alertSource = buildBasicAlert();
        stubOsExecute("alert-456", alertSource);

        MvcResult result = mockMvc.perform(get("/api/ha-alerts/alert-456"))
            .andExpect(status().isOk())
            .andReturn();

        Map<String, Object> body = objectMapper.readValue(
            result.getResponse().getContentAsString(), Map.class);

        // MITRE mapping should not be present
        assertThat(body).doesNotContainKey("mitreAttack");
    }

    // =========================================================================
    // Risk score breakdown
    // =========================================================================

    @Test
    @DisplayName("Detail projection includes risk score breakdown")
    void detailIncludesRiskBreakdown() throws Exception {
        Map<String, Object> alertSource = buildAlertWithMitre();
        List<Map<String, Object>> factors = new ArrayList<>();
        factors.add(new LinkedHashMap<>(Map.of("name", "severity", "weight", 0.4, "contribution", 3.6)));
        factors.add(new LinkedHashMap<>(Map.of("name", "recurrence", "weight", 0.3, "contribution", 2.1)));
        alertSource.put("riskFactors", factors);
        stubOsExecute("alert-789", alertSource);

        MvcResult result = mockMvc.perform(get("/api/ha-alerts/alert-789"))
            .andExpect(status().isOk())
            .andReturn();

        Map<String, Object> body = objectMapper.readValue(
            result.getResponse().getContentAsString(), Map.class);
        assertThat(body).containsKey("riskBreakdown");
        List<Map<String, Object>> breakdown = (List<Map<String, Object>>) body.get("riskBreakdown");
        assertThat(breakdown).hasSize(2);
        assertThat(breakdown.get(0).get("name")).isEqualTo("severity");
    }

    // =========================================================================
    // Threat intelligence matches
    // =========================================================================

    @Test
    @DisplayName("Detail projection includes threat intel matches from array field")
    void detailIncludesThreatIntelMatches() throws Exception {
        Map<String, Object> alertSource = buildBasicAlert();
        List<Map<String, Object>> indicators = new ArrayList<>();
        indicators.add(new LinkedHashMap<>(Map.of("source", "AlienVault", "type", "ip", "confidence", 85, "lastSeen", "2026-01-15T10:00:00Z")));
        alertSource.put("threatIntelIndicators", indicators);
        stubOsExecute("alert-ti", alertSource);

        MvcResult result = mockMvc.perform(get("/api/ha-alerts/alert-ti"))
            .andExpect(status().isOk())
            .andReturn();

        Map<String, Object> body = objectMapper.readValue(
            result.getResponse().getContentAsString(), Map.class);
        List<Map<String, Object>> matches = (List<Map<String, Object>>) body.get("threatIntelMatches");
        assertThat(matches).hasSize(1);
        assertThat(matches.get(0).get("source")).isEqualTo("AlienVault");
    }

    // =========================================================================
    // Timeline
    // =========================================================================

    @Test
    @DisplayName("Detail projection includes timeline with creation event")
    void detailIncludesTimeline() throws Exception {
        Map<String, Object> alertSource = buildBasicAlert();
        alertSource.put("@timestamp", "2026-01-15T08:00:00Z");
        List<Map<String, Object>> history = new ArrayList<>();
        history.add(new LinkedHashMap<>(Map.of("timestamp", "2026-01-15T09:00:00Z", "actor", "analyst1", "detail", "Ack")));
        alertSource.put("statusHistory", history);
        stubOsExecute("alert-tl", alertSource);

        MvcResult result = mockMvc.perform(get("/api/ha-alerts/alert-tl"))
            .andExpect(status().isOk())
            .andReturn();

        Map<String, Object> body = objectMapper.readValue(
            result.getResponse().getContentAsString(), Map.class);
        List<Map<String, Object>> timeline = (List<Map<String, Object>>) body.get("timeline");
        assertThat(timeline).isNotEmpty();
        assertThat(timeline.size()).isGreaterThanOrEqualTo(2);
    }

    // =========================================================================
    // Metadata fields
    // =========================================================================

    @Test
    @DisplayName("Detail includes version, dataCompleteness, primaryEntity, assignee, tenant, sla, tags")
    void detailIncludesMetadataFields() throws Exception {
        Map<String, Object> alertSource = buildFullAlert();
        stubOsExecute("alert-meta", alertSource);

        MvcResult result = mockMvc.perform(get("/api/ha-alerts/alert-meta"))
            .andExpect(status().isOk())
            .andReturn();

        Map<String, Object> body = objectMapper.readValue(
            result.getResponse().getContentAsString(), Map.class);
        assertThat(body).containsKey("version");
        assertThat(body).containsKey("dataCompleteness");
        assertThat(body).containsKey("primaryEntity");
        assertThat(body).containsKey("assignee");
        assertThat(body).containsKey("tenant");
        assertThat(body).containsKey("sla");
        assertThat(body).containsKey("tags");

        // Validate primary entity
        Map<String, Object> pe = (Map<String, Object>) body.get("primaryEntity");
        assertThat(pe.get("id")).isEqualTo("host-001");
        assertThat(pe.get("type")).isEqualTo("host");

        // Validate assignee
        Map<String, Object> assignee = (Map<String, Object>) body.get("assignee");
        assertThat(assignee).isNotNull();
        assertThat(assignee.get("displayName")).isEqualTo("John Doe");

        // Validate tags
        List<String> tags = (List<String>) body.get("tags");
        assertThat(tags).containsExactly("phishing", "priority");
    }

    // =========================================================================
    // Available actions
    // =========================================================================

    @Test
    @DisplayName("Detail includes availableActions array with correct structure")
    void detailIncludesAvailableActions() throws Exception {
        Map<String, Object> alertSource = buildBasicAlert();
        alertSource.put("tenantId", "cwm");
        stubOsExecute("alert-actions", alertSource);

        MvcResult result = mockMvc.perform(get("/api/ha-alerts/alert-actions"))
            .andExpect(status().isOk())
            .andReturn();

        Map<String, Object> body = objectMapper.readValue(
            result.getResponse().getContentAsString(), Map.class);
        assertThat(body).containsKey("availableActions");
        List<Map<String, Object>> actions = (List<Map<String, Object>>) body.get("availableActions");
        assertThat(actions).hasSize(4);

        for (Map<String, Object> action : actions) {
            assertThat(action).containsKey("id");
            assertThat(action).containsKey("allowed");
            assertThat(action).containsKey("requiresReason");
            assertThat(action).containsKey("requiresPreview");
            assertThat(action.get("allowed")).isEqualTo(true);
        }
    }

    // =========================================================================
    // 404 for non-existent alert
    // =========================================================================

    @Test
    @DisplayName("Non-existent alert returns 404 (no enumeration)")
    void nonExistentAlert_returns404() throws Exception {
        stubOsExecuteEmpty();

        mockMvc.perform(get("/api/ha-alerts/nonexistent-id"))
            .andExpect(status().isNotFound());
    }

    // =========================================================================
    // Data completeness
    // =========================================================================

    @Test
    @DisplayName("Alert with MITRE + riskFactors + statusHistory returns dataCompleteness=full")
    void fullDataCompleteness() throws Exception {
        Map<String, Object> alertSource = buildAlertWithMitre();
        alertSource.put("riskFactors", new ArrayList<>(List.of(
            new LinkedHashMap<>(Map.of("name", "sev", "weight", 1.0, "contribution", 9.0)))));
        alertSource.put("statusHistory", new ArrayList<>(List.of(
            new LinkedHashMap<>(Map.of("timestamp", "2026-01-01T00:00:00Z", "actor", "sys")))));
        stubOsExecute("alert-full", alertSource);

        MvcResult result = mockMvc.perform(get("/api/ha-alerts/alert-full"))
            .andExpect(status().isOk())
            .andReturn();

        Map<String, Object> body = objectMapper.readValue(
            result.getResponse().getContentAsString(), Map.class);
        assertThat(body.get("dataCompleteness")).isEqualTo("full");
    }

    @Test
    @DisplayName("Alert with only basic fields returns dataCompleteness=triage")
    void triageDataCompleteness() throws Exception {
        Map<String, Object> alertSource = new LinkedHashMap<>();
        alertSource.put("name", "Basic alert");
        alertSource.put("status", 1);
        alertSource.put("severity", 3);
        alertSource.put("tenantId", "cwm");
        stubOsExecute("alert-basic", alertSource);

        MvcResult result = mockMvc.perform(get("/api/ha-alerts/alert-basic"))
            .andExpect(status().isOk())
            .andReturn();

        Map<String, Object> body = objectMapper.readValue(
            result.getResponse().getContentAsString(), Map.class);
        assertThat(body.get("dataCompleteness")).isEqualTo("triage");
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Map<String, Object> buildBasicAlert() {
        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("name", "Suspicious login attempt");
        alert.put("description", "Multiple failed login attempts detected");
        alert.put("severity", 7);
        alert.put("riskScore", 72);
        alert.put("confidence", 85);
        alert.put("status", 1);
        alert.put("category", "authentication");
        alert.put("@timestamp", "2026-01-15T08:00:00Z");
        alert.put("tenantId", "cwm");
        alert.put("version", 3);
        return alert;
    }

    private Map<String, Object> buildAlertWithMitre() {
        Map<String, Object> alert = buildBasicAlert();
        alert.put("mitreTacticId", "TA0001");
        alert.put("mitreTacticName", "Initial Access");
        alert.put("mitreTechniqueName", "Phishing");
        alert.put("mitreTechniqueId", "T1566");
        alert.put("mitreSubTechnique", "T1566.001");
        return alert;
    }

    private Map<String, Object> buildFullAlert() {
        Map<String, Object> alert = buildAlertWithMitre();
        alert.put("riskFactors", new ArrayList<>(List.of(
            new LinkedHashMap<>(Map.of("name", "severity", "weight", 0.5, "contribution", 4.5)))));
        alert.put("primaryEntityId", "host-001");
        alert.put("primaryEntityType", "host");
        alert.put("primaryEntityLabel", "server-dc01");
        alert.put("primaryEntityRiskScore", 65);
        alert.put("assigneeId", 42L);
        alert.put("assigneeName", "John Doe");
        alert.put("tenantId", "cwm");
        alert.put("tenantName", "CWM Security");
        alert.put("slaStatus", "on_track");
        alert.put("slaDueAt", "2026-01-16T08:00:00Z");
        alert.put("tags", new ArrayList<>(List.of("phishing", "priority")));
        alert.put("version", 5);
        alert.put("statusHistory", new ArrayList<>(List.of(
            new LinkedHashMap<>(Map.of("timestamp", "2026-01-15T09:00:00Z", "actor", "analyst1", "detail", "Acknowledged")))));
        return alert;
    }

    /**
     * Stubs osClient.execute() to return a SearchResponse with one hit.
     * Uses builder patterns since opensearch-java uses final methods that can't be mocked
     * with the subclass mock maker.
     */
    private void stubOsExecute(String alertId, Map<String, Object> source) throws Exception {
        when(osClient.execute(any())).thenAnswer(invocation -> {
            // Build a real SearchResponse using the opensearch-java builder
            return SearchResponse.searchResponseOf(r -> r
                .took(5)
                .timedOut(false)
                .shards(s -> s.total(1).successful(1).failed(0))
                .hits(h -> h
                    .total(t -> t.value(1L).relation(TotalHitsRelation.Eq))
                    .hits(List.of(Hit.of(hit -> hit
                        .index("v3-hive-alert-cwm-2026.01.15")
                        .id(alertId)
                        .source((Map) source))))));
        });
    }

    private void stubOsExecuteEmpty() throws Exception {
        when(osClient.execute(any())).thenAnswer(invocation -> {
            return SearchResponse.searchResponseOf(r -> r
                .took(1)
                .timedOut(false)
                .shards(s -> s.total(1).successful(1).failed(0))
                .hits(h -> h
                    .total(t -> t.value(0L).relation(TotalHitsRelation.Eq))
                    .hits(Collections.emptyList())));
        });
    }
}
