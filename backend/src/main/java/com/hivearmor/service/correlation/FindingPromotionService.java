package com.hivearmor.service.correlation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

/**
 * Service for incident promotion from correlated findings (COR-005).
 *
 * <p>Implements a two-phase promotion flow:
 * <ul>
 *   <li>{@code previewPromotion} — dry-run that generates a preview and a signed token</li>
 *   <li>{@code executePromotion} — validates token, creates incident, links alerts, updates finding</li>
 * </ul>
 *
 * <p>The preview token is an HMAC-SHA256 signed payload with 5-minute expiry,
 * binding the finding ID and timestamp to prevent replay/substitution attacks.
 *
 * <p>Sprint 44 — Correlated Findings.
 */
@Service
public class FindingPromotionService {

    private static final Logger log = LoggerFactory.getLogger(FindingPromotionService.class);
    private static final String CLASSNAME = "FindingPromotionService";

    /** Token expiry: 5 minutes. */
    private static final long TOKEN_EXPIRY_SECONDS = 5 * 60;

    /** HMAC algorithm. */
    private static final String HMAC_ALGO = "HmacSHA256";

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final CorrelatedFindingService correlatedFindingService;
    private final FindingSseService sseService;
    private final MsspIndexResolver indexResolver;

    @Value("${hivearmor.promotion.secret:hivearmor-promotion-secret-key-default}")
    private String promotionSecret;

    public FindingPromotionService(OpensearchClientBuilder osClient,
                                   ObjectMapper objectMapper,
                                   CorrelatedFindingService correlatedFindingService,
                                   FindingSseService sseService,
                                   MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.correlatedFindingService = correlatedFindingService;
        this.sseService = sseService;
        this.indexResolver = indexResolver;
    }

    // =========================================================================
    // Preview (COR-005)
    // =========================================================================

    /**
     * Generates a promotion preview for a correlated finding.
     *
     * <p>Builds an incident preview structure from the finding data, generates warnings
     * for potential issues, and creates a signed preview token (5-min expiry).
     *
     * @param findingId    the finding identifier
     * @param indexPattern tenant-scoped index pattern
     * @return preview response with preview structure, warnings, and token
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> previewPromotion(String findingId, String indexPattern) throws Exception {
        // Fetch the complete finding
        Optional<Map<String, Object>> findingOpt = correlatedFindingService.getFinding(findingId, indexPattern);
        if (findingOpt.isEmpty()) {
            throw new FindingLifecycleService.FindingNotFoundException("Finding not found: " + findingId);
        }

        Map<String, Object> finding = findingOpt.get();

        // Build incident preview
        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("title", finding.get("title"));

        // Build description from narrative summary
        String narrative = finding.get("narrative") != null ? finding.get("narrative").toString() : "";
        String description = "Incident created from correlated finding " + findingId + ". " +
            buildDescriptionFromStages(finding);
        preview.put("description", description);
        preview.put("severity", finding.get("severity"));

        // Entities list (values only for preview)
        List<String> entityValues = new ArrayList<>();
        Object entitiesObj = finding.get("entities");
        if (entitiesObj instanceof List<?> entitiesList) {
            for (Object entity : entitiesList) {
                if (entity instanceof Map<?, ?> entityMap) {
                    Object value = entityMap.get("value");
                    if (value != null) entityValues.add(value.toString());
                }
            }
        }
        preview.put("entities", entityValues);

        // Alert count
        int alertCount = finding.get("signalCount") != null
            ? ((Number) finding.get("signalCount")).intValue() : 0;
        preview.put("alertCount", alertCount);

        // Evidence count (stages)
        Object stagesObj = finding.get("stages");
        int evidenceCount = stagesObj instanceof List<?> stageList ? stageList.size() : 0;
        preview.put("evidenceCount", evidenceCount);

        // Timeline from stages
        List<Map<String, Object>> timeline = buildTimeline(finding);
        preview.put("timeline", timeline);

        // MITRE tactics
        preview.put("mitreTactics", finding.get("mitreTactics"));

        // Generate warnings
        List<String> warnings = generateWarnings(finding);

        // Generate preview token (HMAC-signed, 5-min expiry)
        String previewToken = generatePreviewToken(findingId);

        // Build response
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("preview", preview);
        response.put("warnings", warnings);
        response.put("previewToken", previewToken);
        return response;
    }

    // =========================================================================
    // Execute (COR-005)
    // =========================================================================

    /**
     * Executes the incident promotion: validates token, creates incident, links alerts,
     * and updates finding status to "promoted".
     *
     * @param findingId    the finding identifier
     * @param title        optional title override
     * @param description  optional description override
     * @param severity     optional severity override
     * @param assignee     optional assignee for the new incident
     * @param previewToken the signed preview token from the preview step
     * @param userId       the actor executing the promotion
     * @param tenantId     the tenant ID for SSE broadcasting
     * @param indexPattern tenant-scoped index pattern
     * @return promotion result with incident details
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> executePromotion(String findingId, String title, String description,
                                                String severity, String assignee, String previewToken,
                                                String userId, Long tenantId,
                                                String indexPattern) throws Exception {
        // Validate preview token
        if (!validatePreviewToken(findingId, previewToken)) {
            throw new InvalidPreviewTokenException("Preview token is invalid or expired for finding: " + findingId);
        }

        // Fetch the complete finding
        Optional<Map<String, Object>> findingOpt = correlatedFindingService.getFinding(findingId, indexPattern);
        if (findingOpt.isEmpty()) {
            throw new FindingLifecycleService.FindingNotFoundException("Finding not found: " + findingId);
        }

        Map<String, Object> finding = findingOpt.get();

        // Build incident document
        String incidentId = "inc-" + UUID.randomUUID().toString().substring(0, 12);
        Map<String, Object> incident = new LinkedHashMap<>();
        incident.put("id", incidentId);
        incident.put("title", title != null ? title : finding.get("title"));
        incident.put("description", description != null ? description :
            "Incident created from correlated finding " + findingId + ". " + buildDescriptionFromStages(finding));
        incident.put("severity", severity != null ? severity : finding.get("severity"));
        incident.put("status", "open");
        incident.put("assignee", assignee);
        incident.put("createdAt", Instant.now().toString());
        incident.put("updatedAt", Instant.now().toString());
        incident.put("createdBy", userId);
        incident.put("sourceFindingId", findingId);

        // Copy entities
        incident.put("entities", finding.get("entities"));

        // Build timeline from stages
        incident.put("timeline", buildTimeline(finding));

        // MITRE mapping
        incident.put("mitreTactics", finding.get("mitreTactics"));
        incident.put("mitreTechniques", finding.get("mitreTechniques"));

        // Linked alert IDs
        List<String> signalIds = extractSignalIds(finding);
        incident.put("linkedAlertIds", signalIds);

        // Index incident in v3-hive-incident-*
        String incidentIndex = indexResolver.resolveCurrentDayIndex("incident");
        osClient.execute(os -> {
            os.index(incidentIndex, incident);
            return null;
        });

        // Update finding status to "promoted" with incident reference
        String updateScript = "ctx._source.status = 'promoted'; " +
            "ctx._source.incidentId = '" + incidentId + "'; " +
            "ctx._source.updatedAt = '" + Instant.now().toString() + "';";

        Query updateQuery = Query.of(q -> q.term(t ->
            t.field("id").value(v -> v.stringValue(findingId))));

        final String script = updateScript;
        osClient.execute(os -> {
            os.updateByQuery(updateQuery, indexPattern, script);
            return null;
        });

        // Broadcast finding.escalated via SSE
        Map<String, Object> sseData = new LinkedHashMap<>();
        sseData.put("findingId", findingId);
        sseData.put("incidentId", incidentId);
        sseData.put("status", "promoted");
        sseData.put("actor", userId);
        sseService.broadcast(tenantId, "finding.escalated", sseData);

        // Build response
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("incidentId", incidentId);
        response.put("incidentUrl", "/api/ha-incidents/" + incidentId);
        response.put("status", "created");
        response.put("migratedAlerts", signalIds.size());
        response.put("migratedEntities", finding.get("entityCount") != null
            ? ((Number) finding.get("entityCount")).intValue() : 0);
        return response;
    }

    // =========================================================================
    // Token generation / validation
    // =========================================================================

    /**
     * Generates a preview token: Base64(JSON(findingId, issuedAt)) + "." + HMAC signature.
     */
    private String generatePreviewToken(String findingId) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("findingId", findingId);
        payload.put("issuedAt", Instant.now().toEpochMilli());
        payload.put("expiresAt", Instant.now().plusSeconds(TOKEN_EXPIRY_SECONDS).toEpochMilli());

        String payloadJson = objectMapper.writeValueAsString(payload);
        String encodedPayload = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));

        String signature = hmacSign(encodedPayload);
        return encodedPayload + "." + signature;
    }

    /**
     * Validates a preview token: checks signature and expiry.
     */
    private boolean validatePreviewToken(String findingId, String token) {
        if (token == null || token.isBlank()) return false;

        String[] parts = token.split("\\.", 2);
        if (parts.length != 2) return false;

        String encodedPayload = parts[0];
        String signature = parts[1];

        // Verify signature
        try {
            String expectedSig = hmacSign(encodedPayload);
            if (!expectedSig.equals(signature)) return false;
        } catch (Exception e) {
            return false;
        }

        // Decode payload and validate
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(encodedPayload);
            String json = new String(decoded, StandardCharsets.UTF_8);
            Map<String, Object> payload = objectMapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<>() {});

            // Check finding ID matches
            String tokenFindingId = payload.get("findingId") != null ? payload.get("findingId").toString() : "";
            if (!findingId.equals(tokenFindingId)) return false;

            // Check expiry
            Object expiresAtObj = payload.get("expiresAt");
            if (expiresAtObj instanceof Number) {
                long expiresAt = ((Number) expiresAtObj).longValue();
                if (Instant.now().toEpochMilli() > expiresAt) return false;
            }

            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String hmacSign(String data) throws Exception {
        Mac mac = Mac.getInstance(HMAC_ALGO);
        SecretKeySpec keySpec = new SecretKeySpec(
            promotionSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGO);
        mac.init(keySpec);
        byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> buildTimeline(Map<String, Object> finding) {
        List<Map<String, Object>> timeline = new ArrayList<>();
        Object stagesObj = finding.get("stages");
        if (stagesObj instanceof List<?> stageList) {
            for (Object stage : stageList) {
                if (stage instanceof Map<?, ?> stageMap) {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("timestamp", stageMap.get("timestamp"));
                    entry.put("description", stageMap.get("description"));
                    entry.put("stage", stageMap.get("name"));
                    timeline.add(entry);
                }
            }
        }
        return timeline;
    }

    @SuppressWarnings("unchecked")
    private String buildDescriptionFromStages(Map<String, Object> finding) {
        StringBuilder sb = new StringBuilder("Attack chain: ");
        Object stagesObj = finding.get("stages");
        if (stagesObj instanceof List<?> stageList) {
            List<String> stageNames = new ArrayList<>();
            for (Object stage : stageList) {
                if (stage instanceof Map<?, ?> stageMap) {
                    Object name = stageMap.get("name");
                    if (name != null) stageNames.add(name.toString());
                }
            }
            sb.append(String.join(" → ", stageNames));
        }
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private List<String> extractSignalIds(Map<String, Object> finding) {
        List<String> signalIds = new ArrayList<>();
        Object stagesObj = finding.get("stages");
        if (stagesObj instanceof List<?> stageList) {
            for (Object stage : stageList) {
                if (stage instanceof Map<?, ?> stageMap) {
                    Object sids = stageMap.get("signalIds");
                    if (sids instanceof List<?> sidList) {
                        for (Object sid : sidList) {
                            if (sid != null) signalIds.add(sid.toString());
                        }
                    }
                }
            }
        }
        return signalIds;
    }

    @SuppressWarnings("unchecked")
    private List<String> generateWarnings(Map<String, Object> finding) {
        List<String> warnings = new ArrayList<>();

        // Check overall confidence
        Object confidenceObj = finding.get("confidence");
        if (confidenceObj instanceof Number) {
            double confidence = ((Number) confidenceObj).doubleValue();
            if (confidence < 0.7) {
                warnings.add("Finding confidence is below 0.7 — may contain false positives");
            }
        }

        // Check correlation reasons for low confidence
        Object reasonsObj = finding.get("correlationReasons");
        if (reasonsObj instanceof List<?> reasonsList) {
            int lowConfidenceCount = 0;
            for (Object reason : reasonsList) {
                if (reason instanceof Map<?, ?> reasonMap) {
                    Object conf = reasonMap.get("confidence");
                    if (conf instanceof Number && ((Number) conf).doubleValue() < 0.7) {
                        lowConfidenceCount++;
                    }
                }
            }
            if (lowConfidenceCount > 0) {
                warnings.add(lowConfidenceCount + " signal(s) have confidence below 0.7 — may be false positive");
            }
        }

        // Check for missing entities
        Object entitiesObj = finding.get("entities");
        if (entitiesObj == null || (entitiesObj instanceof List<?> list && list.isEmpty())) {
            warnings.add("No entities found in finding — incident will lack entity context");
        }

        // Check stages without confirmed signals
        Object stagesObj = finding.get("stages");
        if (stagesObj instanceof List<?> stageList) {
            int unconfirmedStages = 0;
            for (Object stage : stageList) {
                if (stage instanceof Map<?, ?> stageMap) {
                    Object status = stageMap.get("status");
                    if (status != null && !"confirmed".equalsIgnoreCase(status.toString())) {
                        unconfirmedStages++;
                    }
                }
            }
            if (unconfirmedStages > 0) {
                warnings.add(unconfirmedStages + " stage(s) do not have confirmed signals");
            }
        }

        return warnings;
    }

    // =========================================================================
    // Exception types
    // =========================================================================

    /**
     * Thrown when a preview token is invalid or expired.
     */
    public static class InvalidPreviewTokenException extends RuntimeException {
        public InvalidPreviewTokenException(String message) {
            super(message);
        }
    }
}
