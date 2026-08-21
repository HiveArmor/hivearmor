package com.hivearmor.service.graph;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Generates signed pivot descriptors for graph nodes with role-based filtering (CON-004).
 *
 * <p>For each entity node in the constellation graph, produces pivot descriptors:
 * <ul>
 *   <li><b>Navigation pivots</b> (SOC_ANALYST — always included): dossier, hunt, alerts, incidents</li>
 *   <li><b>Action pivots</b> (SOC_MANAGER only): isolate (for hosts), block (for IPs/domains)</li>
 * </ul>
 *
 * <p>Each pivot is signed with HMAC-SHA256 using the shared {@code ha.pivot.signing.secret}
 * to prevent tampering. Parameters use opaque entityId (not raw entity value) to prevent
 * URL enumeration attacks.
 *
 * <p>Sprint 48 — Threat Constellation.
 */
@Service
public class GraphPivotService {

    private static final Logger log = LoggerFactory.getLogger(GraphPivotService.class);
    private static final String CLASSNAME = "GraphPivotService";

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    /** Role required for navigation pivots (base level). */
    private static final String ROLE_SOC_ANALYST = "ROLE_SOC_ANALYST";

    /** Role required for action pivots (elevated). */
    private static final String ROLE_SOC_MANAGER = "ROLE_SOC_MANAGER";

    /** Entity types that support the "isolate" action pivot. */
    private static final Set<String> ISOLATE_ENTITY_TYPES = Set.of("host");

    /** Entity types that support the "block" action pivot. */
    private static final Set<String> BLOCK_ENTITY_TYPES = Set.of("ip", "domain");

    @Value("${ha.pivot.signing.secret}")
    private String signingSecret;

    private final ObjectMapper objectMapper;

    public GraphPivotService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Generates pivot descriptors for a graph node, filtered by user roles.
     *
     * <p>Navigation pivots (dossier, hunt, alerts, incidents) are always included.
     * Action pivots (isolate, block) are only included if the user has SOC_MANAGER role.
     *
     * @param entityId    opaque entity identifier (e.g., "ent-host-fin-wks-044")
     * @param entityType  entity type (host, user, ip, domain, process, file)
     * @param entityValue display value (e.g., "FIN-WKS-044")
     * @param userRoles   collection of user role strings from SecurityContext
     * @return list of pivot descriptor maps
     */
    public List<Map<String, Object>> generatePivots(String entityId, String entityType,
                                                    String entityValue,
                                                    Collection<String> userRoles) {
        List<Map<String, Object>> pivots = new ArrayList<>();
        int pivotIndex = 1;

        // Navigation pivots — always included (require SOC_ANALYST, which is base level)
        pivots.add(buildDossierPivot(entityId, entityType, entityValue, pivotIndex++));
        pivots.add(buildHuntPivot(entityId, entityType, entityValue, pivotIndex++));
        pivots.add(buildAlertsPivot(entityId, entityType, entityValue, pivotIndex++));
        pivots.add(buildIncidentsPivot(entityId, entityType, entityValue, pivotIndex++));

        // Action pivots — only if user has SOC_MANAGER (or ADMIN) role
        boolean hasManagerRole = userRoles != null && userRoles.stream()
            .anyMatch(r -> ROLE_SOC_MANAGER.equals(r) || "ROLE_ADMIN".equals(r));

        if (hasManagerRole) {
            String normalizedType = entityType != null ? entityType.toLowerCase() : "";

            // Isolate pivot — for host entities
            if (ISOLATE_ENTITY_TYPES.contains(normalizedType)) {
                pivots.add(buildIsolatePivot(entityId, entityType, entityValue, pivotIndex++));
            }

            // Block pivot — for IP and domain entities
            if (BLOCK_ENTITY_TYPES.contains(normalizedType)) {
                pivots.add(buildBlockPivot(entityId, entityType, entityValue, pivotIndex++));
            }
        }

        return pivots;
    }

    /**
     * Convenience method that extracts user roles from the current SecurityContext.
     *
     * @param entityId    opaque entity identifier
     * @param entityType  entity type
     * @param entityValue display value
     * @return list of pivot descriptor maps
     */
    public List<Map<String, Object>> generatePivots(String entityId, String entityType,
                                                    String entityValue) {
        Collection<String> userRoles = extractCurrentUserRoles();
        return generatePivots(entityId, entityType, entityValue, userRoles);
    }

    // =========================================================================
    // Navigation Pivot Builders
    // =========================================================================

    /**
     * Dossier pivot: route /entities/{entityId}/dossier.
     * Parameters use opaque entityId (not raw value).
     */
    private Map<String, Object> buildDossierPivot(String entityId, String entityType,
                                                   String entityValue, int index) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("entityId", entityId);

        String route = "/entities/" + entityId + "/dossier";
        String signature = signParameters(parameters);

        return buildPivotDescriptor(
            "pvt-" + String.format("%03d", index),
            "dossier",
            "View Dossier",
            route,
            parameters,
            signature,
            ROLE_SOC_ANALYST
        );
    }

    /**
     * Hunt pivot: route /hunt with query parameter based on entity type.
     */
    private Map<String, Object> buildHuntPivot(String entityId, String entityType,
                                               String entityValue, int index) {
        String query = buildHuntQuery(entityType, entityValue);

        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("entityId", entityId);
        parameters.put("query", query);

        String route = "/hunt";
        String signature = signParameters(parameters);

        return buildPivotDescriptor(
            "pvt-" + String.format("%03d", index),
            "hunt",
            "Hunt Activity",
            route,
            parameters,
            signature,
            ROLE_SOC_ANALYST
        );
    }

    /**
     * Alerts pivot: route /alerts, filtered by entity.
     */
    private Map<String, Object> buildAlertsPivot(String entityId, String entityType,
                                                  String entityValue, int index) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("entityId", entityId);

        String route = "/alerts";
        String signature = signParameters(parameters);

        return buildPivotDescriptor(
            "pvt-" + String.format("%03d", index),
            "alerts",
            "View Alerts",
            route,
            parameters,
            signature,
            ROLE_SOC_ANALYST
        );
    }

    /**
     * Incidents pivot: route /incidents, filtered by entity.
     */
    private Map<String, Object> buildIncidentsPivot(String entityId, String entityType,
                                                     String entityValue, int index) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("entityId", entityId);

        String route = "/incidents";
        String signature = signParameters(parameters);

        return buildPivotDescriptor(
            "pvt-" + String.format("%03d", index),
            "incidents",
            "View Incidents",
            route,
            parameters,
            signature,
            ROLE_SOC_ANALYST
        );
    }

    // =========================================================================
    // Action Pivot Builders (SOC_MANAGER only)
    // =========================================================================

    /**
     * Isolate pivot: route /response-actions/isolate — for host entities.
     */
    private Map<String, Object> buildIsolatePivot(String entityId, String entityType,
                                                   String entityValue, int index) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("entityId", entityId);
        parameters.put("type", entityType);

        String route = "/response-actions/isolate";
        String signature = signParameters(parameters);

        return buildPivotDescriptor(
            "pvt-" + String.format("%03d", index),
            "isolate",
            "Isolate Host",
            route,
            parameters,
            signature,
            ROLE_SOC_MANAGER
        );
    }

    /**
     * Block pivot: route /response-actions/block — for IP and domain entities.
     */
    private Map<String, Object> buildBlockPivot(String entityId, String entityType,
                                                 String entityValue, int index) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("entityId", entityId);
        parameters.put("type", entityType);

        String route = "/response-actions/block";
        String signature = signParameters(parameters);

        return buildPivotDescriptor(
            "pvt-" + String.format("%03d", index),
            "block",
            "Block " + capitalizeType(entityType),
            route,
            parameters,
            signature,
            ROLE_SOC_MANAGER
        );
    }

    // =========================================================================
    // HMAC Signing
    // =========================================================================

    /**
     * Signs the parameters map using HMAC-SHA256.
     *
     * <p>Serializes parameters to JSON and signs the resulting string using
     * {@code ha.pivot.signing.secret}.
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

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Extracts user roles from the current Spring SecurityContext.
     */
    private Collection<String> extractCurrentUserRoles() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return List.of();
        }
        return auth.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .collect(Collectors.toList());
    }

    /**
     * Builds the hunt query based on entity type.
     */
    private String buildHuntQuery(String entityType, String entityValue) {
        return switch (entityType != null ? entityType.toLowerCase() : "") {
            case "host" -> "host.name:\"" + entityValue + "\"";
            case "user" -> "user.name:\"" + entityValue + "\"";
            case "ip" -> "source.ip:\"" + entityValue + "\" OR destination.ip:\"" + entityValue + "\"";
            case "domain" -> "dns.question.name:\"" + entityValue + "\"";
            case "process" -> "process.name:\"" + entityValue + "\"";
            case "file" -> "file.name:\"" + entityValue + "\"";
            default -> "\"" + entityValue + "\"";
        };
    }

    /**
     * Builds a pivot descriptor map including the requiredRole field.
     */
    private Map<String, Object> buildPivotDescriptor(String id, String type, String label,
                                                      String route, Map<String, Object> parameters,
                                                      String signature, String requiredRole) {
        Map<String, Object> pivot = new LinkedHashMap<>();
        pivot.put("id", id);
        pivot.put("type", type);
        pivot.put("label", label);
        pivot.put("route", route);
        pivot.put("parameters", parameters);
        pivot.put("signature", signature);
        pivot.put("requiredRole", requiredRole);
        return pivot;
    }

    /**
     * Capitalizes entity type for display in pivot labels (e.g., "ip" → "IP", "domain" → "Domain").
     */
    private String capitalizeType(String entityType) {
        if (entityType == null || entityType.isBlank()) return "Entity";
        if ("ip".equalsIgnoreCase(entityType)) return "IP";
        return entityType.substring(0, 1).toUpperCase() + entityType.substring(1).toLowerCase();
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
