package com.hivearmor.web.rest.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.User;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.HaHuntIdempotencyService;
import com.hivearmor.service.hunt.InvestigationEventPublisher;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for {@link HaAlertBulkResource}.
 *
 * <p>Tests focus on:
 * <ul>
 *   <li>Sub-task 11: Status change without reason returns 400 REASON_REQUIRED
 *   <li>Sub-task 12: Partial failure returns per-alert error details
 * </ul>
 *
 * <p>Uses standalone MockMvc with Mockito — no Spring context or database required.
 *
 * Run with: cd backend && mvn -s settings.xml test -Dtest=HaAlertBulkResourceTest
 */
@ExtendWith(MockitoExtension.class)
class HaAlertBulkResourceTest {

    private static final String STATUS_ENDPOINT = "/api/ha-alerts/bulk/status";
    private static final String STATUS_PREVIEW_ENDPOINT = "/api/ha-alerts/bulk/status/preview";

    private MockMvc mockMvc;

    @Mock
    private OpensearchClientBuilder osClient;

    @Mock
    private MsspIndexResolver indexResolver;

    @Mock
    private UserRepository userRepository;

    @Mock
    private HaHuntIdempotencyService idempotencyService;

    @Mock
    private InvestigationEventPublisher investigationEventPublisher;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        HaAlertBulkResource resource = new HaAlertBulkResource(
            osClient, indexResolver, objectMapper, userRepository, idempotencyService, investigationEventPublisher);
        this.mockMvc = MockMvcBuilders.standaloneSetup(resource).build();

        // Set up security context — simulate SOC analyst
        setSecurityContext("analyst");

        // Mock user resolution
        User analystUser = new User();
        analystUser.setId(100L);
        analystUser.setLogin("analyst");
        lenient().when(userRepository.findOneByLogin("analyst")).thenReturn(Optional.of(analystUser));

        // Mock index resolution
        lenient().when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-*");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Sub-task 11: Status change without reason returns 400 REASON_REQUIRED
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Closing alerts without a reasonCode MUST return 400 BAD_REQUEST with
     * error code REASON_REQUIRED. No OpenSearch update should be performed.
     *
     * Validates: Requirement 5.3 — reasonCode required for closed/true_positive/false_positive/benign_positive
     */
    @Test
    void executeStatus_closedWithoutReason_returns400() throws Exception {
        String body = objectMapper.writeValueAsString(new java.util.LinkedHashMap<String, Object>() {{
            put("alertIds", List.of("alert-1", "alert-2"));
            put("targetStatus", "closed");
            put("previewToken", "some-token");
            put("itemVersions", new java.util.LinkedHashMap<>());
        }});

        mockMvc.perform(post(STATUS_ENDPOINT)
                .header("Idempotency-Key", "test-key-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("REASON_REQUIRED"))
            .andExpect(jsonPath("$.message").exists());

        // Verify no OpenSearch operations were attempted
        verifyNoInteractions(osClient);
    }

    /**
     * true_positive without reasonCode MUST also return 400 REASON_REQUIRED.
     *
     * Validates: Requirement 5.3
     */
    @Test
    void executeStatus_truePositiveWithoutReason_returns400() throws Exception {
        String body = objectMapper.writeValueAsString(new java.util.LinkedHashMap<String, Object>() {{
            put("alertIds", List.of("alert-1"));
            put("targetStatus", "true_positive");
            put("previewToken", "some-token");
            put("itemVersions", new java.util.LinkedHashMap<>());
        }});

        mockMvc.perform(post(STATUS_ENDPOINT)
                .header("Idempotency-Key", "test-key-2")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("REASON_REQUIRED"));

        verifyNoInteractions(osClient);
    }

    /**
     * false_positive without reasonCode MUST return 400 REASON_REQUIRED.
     *
     * Validates: Requirement 5.3
     */
    @Test
    void executeStatus_falsePositiveWithoutReason_returns400() throws Exception {
        String body = objectMapper.writeValueAsString(new java.util.LinkedHashMap<String, Object>() {{
            put("alertIds", List.of("alert-1"));
            put("targetStatus", "false_positive");
            put("previewToken", "some-token");
            put("itemVersions", new java.util.LinkedHashMap<>());
        }});

        mockMvc.perform(post(STATUS_ENDPOINT)
                .header("Idempotency-Key", "test-key-3")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("REASON_REQUIRED"));

        verifyNoInteractions(osClient);
    }

    /**
     * benign_positive without reasonCode MUST return 400 REASON_REQUIRED.
     *
     * Validates: Requirement 5.3
     */
    @Test
    void executeStatus_benignPositiveWithoutReason_returns400() throws Exception {
        String body = objectMapper.writeValueAsString(new java.util.LinkedHashMap<String, Object>() {{
            put("alertIds", List.of("alert-1"));
            put("targetStatus", "benign_positive");
            put("previewToken", "some-token");
            put("itemVersions", new java.util.LinkedHashMap<>());
        }});

        mockMvc.perform(post(STATUS_ENDPOINT)
                .header("Idempotency-Key", "test-key-4")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("REASON_REQUIRED"));

        verifyNoInteractions(osClient);
    }

    /**
     * "open" status does NOT require reasonCode — should NOT return REASON_REQUIRED.
     * (It will fail for a different reason — invalid preview token — proving
     * the reasonCode check was bypassed for non-classifying statuses.)
     *
     * Validates: Requirement 5.3 (only closed/true_positive/false_positive/benign_positive)
     */
    @Test
    void executeStatus_openWithoutReason_doesNotReturnReasonRequired() throws Exception {
        String body = objectMapper.writeValueAsString(new java.util.LinkedHashMap<String, Object>() {{
            put("alertIds", List.of("alert-1"));
            put("targetStatus", "open");
            put("previewToken", "some-invalid-token");
            put("itemVersions", new java.util.LinkedHashMap<>());
        }});

        mockMvc.perform(post(STATUS_ENDPOINT)
                .header("Idempotency-Key", "test-key-5")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest())
            // Should fail with INVALID_PREVIEW_TOKEN, NOT REASON_REQUIRED
            .andExpect(jsonPath("$.errorCode").value("INVALID_PREVIEW_TOKEN"));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Sub-task 12: Partial failure returns per-alert error details
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * When some alerts fail during bulk status change (e.g., not found), the overall
     * response is still 200 OK but individual alert results contain error details.
     * This proves partial failure does NOT abort the batch.
     *
     * Validates: Requirement 5.2, Non-functional Reliability requirement
     */
    @Test
    void executeStatus_partialFailure_returnsPerAlertErrors() throws Exception {
        // We need a valid preview token for this test. We'll call preview first,
        // then extract the token from the response, then call execute.
        // Since we can't easily mock OpenSearch here without the client, we instead
        // test via the resource directly.

        // Create resource instance directly for this test
        HaAlertBulkResource resource = new HaAlertBulkResource(
            osClient, indexResolver, objectMapper, userRepository, idempotencyService, investigationEventPublisher);

        // First, call preview to get a token
        TenantContext.set("test-tenant");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-test-tenant-*");

        // Mock osClient.execute to throw for search (simulating partial OS failure)
        when(osClient.execute(any())).thenThrow(new RuntimeException("OpenSearch connection refused"));

        java.util.Map<String, Object> previewBody = new java.util.LinkedHashMap<>();
        previewBody.put("alertIds", List.of("alert-1", "alert-2", "alert-3"));
        previewBody.put("targetStatus", "in_review");

        org.springframework.http.ResponseEntity<?> previewResponse = resource.previewStatusChange(previewBody);

        // Extract preview token from response
        TenantContext.set("test-tenant");
        @SuppressWarnings("unchecked")
        java.util.Map<String, Object> previewResult = (java.util.Map<String, Object>) previewResponse.getBody();
        String previewToken = (String) previewResult.get("previewToken");

        // Now call execute with the valid token — OS will throw for each alert
        java.util.Map<String, Object> executeBody = new java.util.LinkedHashMap<>();
        executeBody.put("alertIds", List.of("alert-1", "alert-2", "alert-3"));
        executeBody.put("targetStatus", "in_review");
        executeBody.put("previewToken", previewToken);
        executeBody.put("itemVersions", new java.util.LinkedHashMap<>());

        // Mock idempotency to return empty (no cached response)
        when(idempotencyService.findCachedResponse(anyString(), anyString(), anyLong()))
            .thenReturn(Optional.empty());

        org.springframework.http.ResponseEntity<?> executeResponse =
            resource.executeStatusChange("idempotency-key-partial", executeBody);

        // Response should be 200 OK (partial failure does not abort the batch)
        assert executeResponse.getStatusCode().value() == 200 : "Expected 200 OK for partial failure";

        @SuppressWarnings("unchecked")
        java.util.Map<String, Object> responseBody = (java.util.Map<String, Object>) executeResponse.getBody();

        // Should have auditId and results
        assert responseBody.containsKey("auditId") : "Expected auditId in response";
        assert responseBody.containsKey("results") : "Expected results in response";

        @SuppressWarnings("unchecked")
        List<java.util.Map<String, Object>> results =
            (List<java.util.Map<String, Object>>) responseBody.get("results");

        // All 3 alerts should have individual results (even though all failed)
        assert results.size() == 3 : "Expected 3 per-alert results, got " + results.size();

        // Each result should have alertId and error details
        for (java.util.Map<String, Object> result : results) {
            assert result.containsKey("alertId") : "Each result must have alertId";
            assert result.containsKey("status") : "Each result must have status";
            assert result.containsKey("error") : "Each failed result must have error details";
            // Status should be "error" (not 500, not exception)
            assert "error".equals(result.get("status")) : "Expected status=error, got " + result.get("status");
        }
    }

    /**
     * Verifies that per-alert results include the alertId in the error response,
     * enabling the client to show which specific alerts failed.
     *
     * Validates: Requirement 5.2
     */
    @Test
    void executeStatus_perAlertResults_includeAlertId() throws Exception {
        HaAlertBulkResource resource = new HaAlertBulkResource(
            osClient, indexResolver, objectMapper, userRepository, idempotencyService, investigationEventPublisher);

        TenantContext.set("test-tenant");
        when(indexResolver.resolveAlertIndexPattern()).thenReturn("v3-hive-alert-test-tenant-*");
        when(osClient.execute(any())).thenThrow(new RuntimeException("Connection timeout"));

        // Get preview token
        java.util.Map<String, Object> previewBody = new java.util.LinkedHashMap<>();
        previewBody.put("alertIds", List.of("ALT-001", "ALT-002"));
        previewBody.put("targetStatus", "in_review");

        org.springframework.http.ResponseEntity<?> previewResponse = resource.previewStatusChange(previewBody);
        @SuppressWarnings("unchecked")
        java.util.Map<String, Object> previewResult = (java.util.Map<String, Object>) previewResponse.getBody();
        String previewToken = (String) previewResult.get("previewToken");

        // Execute
        TenantContext.set("test-tenant");
        java.util.Map<String, Object> executeBody = new java.util.LinkedHashMap<>();
        executeBody.put("alertIds", List.of("ALT-001", "ALT-002"));
        executeBody.put("targetStatus", "in_review");
        executeBody.put("previewToken", previewToken);
        executeBody.put("itemVersions", new java.util.LinkedHashMap<>());

        when(idempotencyService.findCachedResponse(anyString(), anyString(), anyLong()))
            .thenReturn(Optional.empty());

        org.springframework.http.ResponseEntity<?> response =
            resource.executeStatusChange("key-alert-id-check", executeBody);

        @SuppressWarnings("unchecked")
        java.util.Map<String, Object> responseBody = (java.util.Map<String, Object>) response.getBody();
        @SuppressWarnings("unchecked")
        List<java.util.Map<String, Object>> results =
            (List<java.util.Map<String, Object>>) responseBody.get("results");

        // Verify each result includes the correct alertId
        assert "ALT-001".equals(results.get(0).get("alertId")) : "First result should reference ALT-001";
        assert "ALT-002".equals(results.get(1).get("alertId")) : "Second result should reference ALT-002";
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private void setSecurityContext(String login) {
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
            login,
            "password",
            List.of(new SimpleGrantedAuthority("ROLE_SOC_ANALYST"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
    }
}
