package com.hivearmor.web.rest.hunt;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.HaSuppressionAnalysisService;
import com.hivearmor.service.hunt.dto.SuppressionPreviewRequest;
import com.hivearmor.service.hunt.dto.SuppressionPreviewResponse;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * HiveArmor REST controller for suppression preview impact analysis.
 *
 * <p>{@code POST /api/ha-alerts/{alertId}/suppression-preview} — accepts a proposed
 * suppression condition and returns a read-only impact projection showing how many
 * historical alerts match, projected volume reduction, affected tenants/data sources,
 * false-negative risk prompts, and governance metadata.
 *
 * <p><strong>Read-only guarantee:</strong> This endpoint does NOT create, update, or
 * delete any stored data. It does NOT write to any OpenSearch index. The entire
 * operation is a pure analytical read against historical alert data.
 *
 * <p>Requires {@code ROLE_SOC_MANAGER}, {@code ROLE_SOC_LEAD}, or {@code ROLE_ADMIN} authority.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2).
 */
@RestController
@RequestMapping("/api")
public class HaSuppressionPreviewResource {

    private static final Logger log = LoggerFactory.getLogger(HaSuppressionPreviewResource.class);
    private static final String CLASSNAME = "HaSuppressionPreviewResource";

    private static final String SUPPRESSION_PREVIEW_AUTH =
        "hasAnyAuthority('ROLE_SOC_MANAGER', 'ROLE_SOC_LEAD', 'ROLE_ADMIN')";

    private final HaSuppressionAnalysisService suppressionAnalysisService;
    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;

    public HaSuppressionPreviewResource(HaSuppressionAnalysisService suppressionAnalysisService,
                                        OpensearchClientBuilder osClient,
                                        MsspIndexResolver indexResolver) {
        this.suppressionAnalysisService = suppressionAnalysisService;
        this.osClient = osClient;
        this.indexResolver = indexResolver;
    }

    /**
     * POST /api/ha-alerts/{alertId}/suppression-preview
     *
     * <p>Returns a read-only impact analysis for a proposed suppression condition against
     * the specified alert's context. No mutations occur — this is a pure analytical query
     * against historical alert data in OpenSearch.
     *
     * @param alertId the source alert ID that triggered the suppression dialog
     * @param request the request body containing the proposed suppression condition tuples
     * @return ResponseEntity containing the {@link SuppressionPreviewResponse}, or an error
     */
    @PostMapping("/ha-alerts/{alertId}/suppression-preview")
    @PreAuthorize(SUPPRESSION_PREVIEW_AUTH)
    public ResponseEntity<?> preview(@PathVariable String alertId,
                                     @RequestBody SuppressionPreviewRequest request) {
        try {
            // ─── Task 3.17: Validate proposed condition is not empty ─────────────
            if (request.conditions() == null || request.conditions().isEmpty()) {
                return badRequest("INVALID_CONDITION",
                    "Proposed suppression condition must contain at least one condition tuple");
            }

            // ─── Task 3.18: Verify alert exists ─────────────────────────────────
            String indexPattern = indexResolver.resolveAlertIndexPattern();
            SearchRequest existsRequest = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(q -> q.ids(ids -> ids.values(alertId)))
                .size(0));

            SearchResponse<Void> existsResponse = osClient.execute(os -> os.search(existsRequest, Void.class));
            long alertCount = existsResponse.hits().total() != null
                ? existsResponse.hits().total().value() : 0;

            if (alertCount == 0) {
                return notFound("Alert not found: " + alertId);
            }

            // ─── Task 3.19: Read-only analysis — no mutations, no index writes ──
            SuppressionPreviewResponse response =
                suppressionAnalysisService.analyzeImpact(alertId, request.conditions());

            return ResponseEntity.ok(response);

        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_CONDITION", e.getMessage());
        } catch (Exception e) {
            log.error("{}.preview: alertId={}, error={}", CLASSNAME, alertId, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Builds a 400 Bad Request response with a structured error body.
     */
    private ResponseEntity<Map<String, Object>> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.badRequest().body(error);
    }

    /**
     * Builds a 404 Not Found response with a structured error body.
     */
    private ResponseEntity<Map<String, Object>> notFound(String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.status(404).body(error);
    }
}
