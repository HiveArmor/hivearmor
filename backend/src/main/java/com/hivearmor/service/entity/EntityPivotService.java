package com.hivearmor.service.entity;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Generates signed pivot descriptors for entity navigation (ENT-004).
 *
 * <p>For each entity, produces 4 pivot descriptors:
 * <ol>
 *   <li>Dossier — full entity profile page</li>
 *   <li>Hunt — contextual hunt query based on entity type</li>
 *   <li>Alerts — filtered alert view for this entity</li>
 *   <li>Incidents — filtered incident view for this entity</li>
 * </ol>
 *
 * <p>Each pivot is signed with HMAC-SHA256 using the shared {@code ha.pivot.signing.secret}
 * to prevent tampering with pivot parameters.
 *
 * <p>Sprint 45 — Entity Intelligence Core.
 */
@Service
public class EntityPivotService {

    private static final Logger log = LoggerFactory.getLogger(EntityPivotService.class);
    private static final String CLASSNAME = "EntityPivotService";

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    @Value("${ha.pivot.signing.secret}")
    private String signingSecret;

    private final ObjectMapper objectMapper;

    public EntityPivotService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Generates 4 pivot descriptors for the given entity.
     *
     * @param entityId    the entity identifier (e.g., "ent-host-fin-wks-044")
     * @param entityType  the entity type (host, user, ip, domain)
     * @param entityValue the entity value (e.g., "FIN-WKS-044")
     * @return list of pivot descriptor maps
     */
    public List<Map<String, Object>> generatePivots(String entityId, String entityType, String entityValue) {
        List<Map<String, Object>> pivots = new ArrayList<>();
        int pivotIndex = 1;

        // 1. Dossier pivot
        pivots.add(buildDossierPivot(entityId, entityType, entityValue, pivotIndex++));

        // 2. Hunt pivot
        pivots.add(buildHuntPivot(entityId, entityType, entityValue, pivotIndex++));

        // 3. Alerts pivot
        pivots.add(buildAlertsPivot(entityId, entityType, entityValue, pivotIndex++));

        // 4. Incidents pivot
        pivots.add(buildIncidentsPivot(entityId, entityType, entityValue, pivotIndex++));

        return pivots;
    }

    // =========================================================================
    // Pivot builders
    // =========================================================================

    /**
     * Dossier pivot: route /entities/{id}/dossier, params { entityId, type, value }.
     */
    private Map<String, Object> buildDossierPivot(String entityId, String entityType,
                                                   String entityValue, int index) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("entityId", entityId);
        parameters.put("type", entityType);
        parameters.put("value", entityValue);

        String route = "/entities/" + entityId + "/dossier";
        String signature = signParameters(parameters);

        return buildPivotDescriptor(
            "pvt-" + String.format("%03d", index),
            "dossier",
            "View Dossier",
            route,
            parameters,
            signature
        );
    }

    /**
     * Hunt pivot: route /hunt, params { query: field:value based on entity type }.
     *
     * <p>Field mapping:
     * <ul>
     *   <li>host → host.name</li>
     *   <li>user → user.name</li>
     *   <li>ip → (source.ip OR destination.ip)</li>
     *   <li>domain → dns.question.name</li>
     * </ul>
     */
    private Map<String, Object> buildHuntPivot(String entityId, String entityType,
                                               String entityValue, int index) {
        String query = buildHuntQuery(entityType, entityValue);

        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("query", query);

        String route = "/hunt";
        String signature = signParameters(parameters);

        return buildPivotDescriptor(
            "pvt-" + String.format("%03d", index),
            "hunt",
            "Hunt Activity",
            route,
            parameters,
            signature
        );
    }

    /**
     * Alerts pivot: route /alerts, params { entityFilter: value }.
     */
    private Map<String, Object> buildAlertsPivot(String entityId, String entityType,
                                                  String entityValue, int index) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("entityFilter", entityValue);

        String route = "/alerts";
        String signature = signParameters(parameters);

        return buildPivotDescriptor(
            "pvt-" + String.format("%03d", index),
            "alerts",
            "View Alerts",
            route,
            parameters,
            signature
        );
    }

    /**
     * Incidents pivot: route /incidents, params { entityFilter: value }.
     */
    private Map<String, Object> buildIncidentsPivot(String entityId, String entityType,
                                                     String entityValue, int index) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("entityFilter", entityValue);

        String route = "/incidents";
        String signature = signParameters(parameters);

        return buildPivotDescriptor(
            "pvt-" + String.format("%03d", index),
            "incidents",
            "View Incidents",
            route,
            parameters,
            signature
        );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Builds the hunt query based on entity type.
     *
     * <p>Field mapping:
     * <ul>
     *   <li>host → host.name:"value"</li>
     *   <li>user → user.name:"value"</li>
     *   <li>ip → source.ip:"value" OR destination.ip:"value"</li>
     *   <li>domain → dns.question.name:"value"</li>
     * </ul>
     */
    private String buildHuntQuery(String entityType, String entityValue) {
        return switch (entityType != null ? entityType.toLowerCase() : "") {
            case "host" -> "host.name:\"" + entityValue + "\"";
            case "user" -> "user.name:\"" + entityValue + "\"";
            case "ip" -> "source.ip:\"" + entityValue + "\" OR destination.ip:\"" + entityValue + "\"";
            case "domain" -> "dns.question.name:\"" + entityValue + "\"";
            default -> "\"" + entityValue + "\"";
        };
    }

    /**
     * Signs the parameters map using HMAC-SHA256.
     *
     * <p>Serializes the parameters to JSON and signs the resulting string.
     *
     * @param parameters the pivot parameters to sign
     * @return signature in format "hmac-sha256:{hex}"
     */
    private String signParameters(Map<String, Object> parameters) {
        try {
            String json = objectMapper.writeValueAsString(parameters);
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            SecretKeySpec secretKeySpec = new SecretKeySpec(
                signingSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
            mac.init(secretKeySpec);
            byte[] hmacBytes = mac.doFinal(json.getBytes(StandardCharsets.UTF_8));
            return "hmac-sha256:" + bytesToHex(hmacBytes);
        } catch (Exception e) {
            log.error("{}.signParameters: failed to sign pivot parameters: {}",
                CLASSNAME, e.getMessage());
            throw new RuntimeException("Failed to sign pivot parameters", e);
        }
    }

    /**
     * Verifies that a signature matches the HMAC-SHA256 of the given parameters.
     *
     * @param parameters the pivot parameters to verify
     * @param signature  the signature to check (format: "hmac-sha256:{hex}")
     * @return true if the signature is valid
     */
    public boolean verifySignature(Map<String, Object> parameters, String signature) {
        if (parameters == null || signature == null) {
            return false;
        }
        String expected = signParameters(parameters);
        return expected.equals(signature);
    }

    /**
     * Builds a pivot descriptor map.
     */
    private Map<String, Object> buildPivotDescriptor(String id, String type, String label,
                                                      String route, Map<String, Object> parameters,
                                                      String signature) {
        Map<String, Object> pivot = new LinkedHashMap<>();
        pivot.put("id", id);
        pivot.put("type", type);
        pivot.put("label", label);
        pivot.put("route", route);
        pivot.put("parameters", parameters);
        pivot.put("signature", signature);
        return pivot;
    }

    /**
     * Converts a byte array to lowercase hex string.
     */
    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
