package com.hivearmor.service.session;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.UtmInvestigationSession;
import com.hivearmor.domain.UtmSessionItem;
import com.hivearmor.domain.incident.UtmIncident;
import com.hivearmor.domain.incident.enums.IncidentStatusEnum;
import com.hivearmor.repository.UtmInvestigationSessionRepository;
import com.hivearmor.repository.UtmSessionItemRepository;
import com.hivearmor.repository.incident.UtmIncidentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * INV-012 — Governed investigation → incident promotion (preview + commit).
 * Direct convert-to-incident remains deprecated; callers must use previewToken.
 */
@Service
@Transactional
public class InvestigationPromotionService {

    private static final Logger log = LoggerFactory.getLogger(InvestigationPromotionService.class);
    private static final long TOKEN_EXPIRY_SECONDS = 5 * 60;
    private static final String HMAC_ALGO = "HmacSHA256";

    private final InvestigationSessionService sessionService;
    private final UtmInvestigationSessionRepository sessionRepository;
    private final UtmSessionItemRepository itemRepository;
    private final UtmIncidentRepository incidentRepository;
    private final ObjectMapper objectMapper;

    @Value("${hivearmor.promotion.secret:hivearmor-promotion-secret-key-default}")
    private String promotionSecret;

    public InvestigationPromotionService(
        InvestigationSessionService sessionService,
        UtmInvestigationSessionRepository sessionRepository,
        UtmSessionItemRepository itemRepository,
        UtmIncidentRepository incidentRepository,
        ObjectMapper objectMapper
    ) {
        this.sessionService = sessionService;
        this.sessionRepository = sessionRepository;
        this.itemRepository = itemRepository;
        this.incidentRepository = incidentRepository;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> previewPromotion(Long sessionId, String currentUser, boolean isAdminOrManager) {
        // Authorize via existing session load (throws 404/403).
        sessionService.getSession(sessionId, currentUser, isAdminOrManager);
        UtmInvestigationSession session = loadSessionEntity(sessionId);

        if ("CONVERTED".equals(session.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Session is already converted to incident " + session.getIncidentId());
        }
        if (!"ACTIVE".equals(session.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Only ACTIVE sessions can be promoted (status=" + session.getStatus() + ")");
        }

        List<UtmSessionItem> items = itemRepository.findBySessionIdOrderByAddedAtDesc(sessionId);
        int alertCount = 0;
        int entityCount = 0;
        int eventCount = 0;
        int otherCount = 0;
        for (UtmSessionItem item : items) {
            String type = item.getItemType() != null ? item.getItemType().toUpperCase() : "";
            switch (type) {
                case "ALERT" -> alertCount++;
                case "ENTITY" -> entityCount++;
                case "LOG_EVENT", "EVENT" -> eventCount++;
                default -> otherCount++;
            }
        }

        String recommendedPriority = "P3";
        int recommendedSeverity = 2;
        List<String> severityReasons = new ArrayList<>();
        severityReasons.add("Default medium priority (P3) until workspace severity projection ships");
        if (alertCount >= 5) {
            recommendedPriority = "P2";
            recommendedSeverity = 3;
            severityReasons.add(alertCount + " pinned alerts elevate recommended priority to P2");
        }

        List<String> missingPrerequisites = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        if (items.isEmpty()) {
            warnings.add("No pinned artifacts — incident will carry session metadata only");
        }
        if (session.getAssignedTo() == null || session.getAssignedTo().isBlank()) {
            warnings.add("Session has no assigned owner; incident assignee will be unset");
        }
        if (session.getDescription() == null || session.getDescription().isBlank()) {
            warnings.add("Session description is empty; incident description will be minimal");
        }

        String previewToken;
        try {
            previewToken = generatePreviewToken(sessionId, session.getVersion(), currentUser);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not mint promotion preview token");
        }

        Map<String, Object> incidentSummary = new LinkedHashMap<>();
        incidentSummary.put("title", session.getSessionName());
        incidentSummary.put("descriptionExcerpt", truncate(session.getDescription(), 240));
        incidentSummary.put("recommendedSeverity", recommendedSeverity);
        incidentSummary.put("recommendedPriority", recommendedPriority);
        incidentSummary.put("severityReasons", severityReasons);
        incidentSummary.put("assignee", session.getAssignedTo());
        incidentSummary.put("targetTenantId", session.getTenantId());

        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("totalArtifacts", items.size());
        evidence.put("alertCount", alertCount);
        evidence.put("entityCount", entityCount);
        evidence.put("eventCount", eventCount);
        evidence.put("otherCount", otherCount);

        Map<String, Object> blastRadius = new LinkedHashMap<>();
        blastRadius.put("createsIncident", true);
        blastRadius.put("marksSessionConverted", true);
        blastRadius.put("linksSessionIncidentId", true);
        blastRadius.put("doesNotAutoLinkOpenSearchAlertsYet", true);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("sessionId", sessionId);
        response.put("sessionVersion", session.getVersion());
        response.put("incidentSummary", incidentSummary);
        response.put("eligibleEvidence", evidence);
        response.put("duplicateOrSimilarIncidents", List.of());
        response.put("policyGates", List.of("Requires Analyst or higher", "Preview token expires in 5 minutes"));
        response.put("missingPrerequisites", missingPrerequisites);
        response.put("warnings", warnings);
        response.put("blastRadius", blastRadius);
        response.put("previewToken", previewToken);
        response.put("expiresInSeconds", TOKEN_EXPIRY_SECONDS);
        return response;
    }

    public Map<String, Object> promote(
        Long sessionId,
        String previewToken,
        Long expectedVersion,
        String reason,
        String idempotencyKey,
        String currentUser,
        boolean isAdminOrManager
    ) {
        if (previewToken == null || previewToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "previewToken is required");
        }
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "reason is required");
        }
        if (expectedVersion == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "expectedVersion is required");
        }

        sessionService.getSession(sessionId, currentUser, isAdminOrManager);
        UtmInvestigationSession session = loadSessionEntity(sessionId);

        if (!validatePreviewToken(sessionId, session.getVersion(), currentUser, previewToken)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Preview token is invalid, expired, or does not match this session/version/actor");
        }
        if (!expectedVersion.equals(session.getVersion())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Session version mismatch; refresh and request a new promotion preview");
        }
        if ("CONVERTED".equals(session.getStatus()) && session.getIncidentId() != null) {
            // Idempotent retry after success
            Map<String, Object> already = new LinkedHashMap<>();
            already.put("incidentId", session.getIncidentId());
            already.put("sessionId", sessionId);
            already.put("status", "already_converted");
            already.put("idempotencyKey", idempotencyKey);
            return already;
        }

        Long incidentId = createIncidentFromSession(session, currentUser, reason);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("incidentId", incidentId);
        result.put("sessionId", sessionId);
        result.put("status", "created");
        result.put("reason", reason.trim());
        result.put("idempotencyKey", idempotencyKey != null ? idempotencyKey : null);
        result.put("auditReference", "investigation-promote-" + sessionId + "-" + incidentId);
        log.info("INV-012 promoted session id={} to incident id={} by user={} reasonLen={}",
            sessionId, incidentId, currentUser, reason.trim().length());
        return result;
    }

    private Long createIncidentFromSession(UtmInvestigationSession session, String currentUser, String reason) {
        String rawName = session.getSessionName();
        String suffix = " [sess-" + session.getId() + "]";
        String incidentName = rawName.length() + suffix.length() <= 250
            ? rawName + suffix
            : rawName.substring(0, 250 - suffix.length()) + suffix;

        String baseDesc = "Created from investigation session #" + session.getId();
        if (session.getDescription() != null && !session.getDescription().isBlank()) {
            baseDesc += ": " + session.getDescription().substring(0, Math.min(session.getDescription().length(), 1600));
        }
        baseDesc += " | Promotion reason: " + reason.trim().substring(0, Math.min(reason.trim().length(), 200));

        UtmIncident incident = new UtmIncident();
        incident.setIncidentName(incidentName);
        incident.setIncidentDescription(baseDesc);
        incident.setIncidentStatus(IncidentStatusEnum.OPEN);
        incident.setIncidentSeverity(2);
        incident.setIncidentCreatedDate(Instant.now());
        incident.setIncidentPriority("P3");
        incident.setSlaBreached(false);
        if (session.getAssignedTo() != null) {
            incident.setIncidentAssignedTo(session.getAssignedTo());
        }

        UtmIncident savedIncident = incidentRepository.save(incident);

        session.setStatus("CONVERTED");
        session.setIncidentId(savedIncident.getId());
        session.setUpdatedAt(Instant.now());
        sessionRepository.save(session);

        return savedIncident.getId();
    }

    private UtmInvestigationSession loadSessionEntity(Long sessionId) {
        return sessionRepository.findById(sessionId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
    }

    private String generatePreviewToken(Long sessionId, Long version, String actor) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sessionId", sessionId);
        payload.put("version", version != null ? version : 0L);
        payload.put("actor", actor);
        payload.put("nonce", UUID.randomUUID().toString());
        payload.put("issuedAt", Instant.now().toEpochMilli());
        payload.put("expiresAt", Instant.now().plusSeconds(TOKEN_EXPIRY_SECONDS).toEpochMilli());

        String payloadJson = objectMapper.writeValueAsString(payload);
        String encodedPayload = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));
        return encodedPayload + "." + hmacSign(encodedPayload);
    }

    private boolean validatePreviewToken(Long sessionId, Long version, String actor, String token) {
        String[] parts = token.split("\\.", 2);
        if (parts.length != 2) return false;
        try {
            if (!hmacSign(parts[0]).equals(parts[1])) return false;
            byte[] decoded = Base64.getUrlDecoder().decode(parts[0]);
            Map<String, Object> payload = objectMapper.readValue(
                new String(decoded, StandardCharsets.UTF_8),
                new TypeReference<>() {}
            );
            if (!String.valueOf(sessionId).equals(String.valueOf(payload.get("sessionId")))) return false;
            long tokenVersion = payload.get("version") instanceof Number n ? n.longValue() : -1L;
            long expected = version != null ? version : 0L;
            if (tokenVersion != expected) return false;
            if (!actor.equals(String.valueOf(payload.get("actor")))) return false;
            Object expiresAtObj = payload.get("expiresAt");
            if (expiresAtObj instanceof Number n && Instant.now().toEpochMilli() > n.longValue()) return false;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String hmacSign(String data) throws Exception {
        Mac mac = Mac.getInstance(HMAC_ALGO);
        mac.init(new SecretKeySpec(promotionSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGO));
        byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
    }

    private static String truncate(String value, int max) {
        if (value == null || value.isBlank()) return "";
        return value.length() <= max ? value : value.substring(0, max) + "…";
    }
}
