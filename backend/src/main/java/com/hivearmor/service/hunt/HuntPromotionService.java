package com.hivearmor.service.hunt;

import com.hivearmor.domain.incident.UtmIncident;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.dto.EvidenceItemDTO;
import com.hivearmor.service.dto.InvestigationSessionDTO;
import com.hivearmor.service.dto.SessionItemDTO;
import com.hivearmor.service.dto.incident.NewIncidentDTO;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.evidence.EvidenceService;
import com.hivearmor.service.incident.UtmIncidentService;
import com.hivearmor.service.session.InvestigationSessionService;
import com.hivearmor.security.SecurityUtils;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for promoting hunt search results into evidence packages, investigations, or incidents.
 *
 * <p><strong>HNT-007:</strong> Evidence, investigation, and incident promotion from search results.
 *
 * <p>Supports three promotion actions:
 * <ul>
 *   <li>{@code create_evidence} — packages selected events into an evidence document indexed to
 *       {@code v3-hive-evidence-*}</li>
 *   <li>{@code create_investigation} — creates an investigation session and pins selected events</li>
 *   <li>{@code escalate_incident} — creates a tracked incident from the hunt snapshot</li>
 * </ul>
 */
@Service
public class HuntPromotionService {

    private static final Logger log = LoggerFactory.getLogger(HuntPromotionService.class);
    private static final String CLASSNAME = "HuntPromotionService";

    /** JWT token validity: 5 minutes. */
    private static final long TOKEN_VALIDITY_MILLIS = 5 * 60 * 1000L;

    /** Maximum events that can be promoted at once. */
    private static final int MAX_EVENT_IDS = 100;

    private static final DateTimeFormatter INDEX_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy.MM.dd");

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final InvestigationSessionService investigationSessionService;
    private final UtmIncidentService incidentService;
    private final EvidenceService evidenceService;
    private final HaHuntService huntService;
    private final HuntPromotionApprovalService approvalService;

    @Value("${ha.pivot.signing.secret}")
    private String signingSecret;

    private Key jwtKey;

    public HuntPromotionService(OpensearchClientBuilder osClient,
                                MsspIndexResolver indexResolver,
                                InvestigationSessionService investigationSessionService,
                                UtmIncidentService incidentService,
                                EvidenceService evidenceService,
                                HaHuntService huntService,
                                HuntPromotionApprovalService approvalService) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.investigationSessionService = investigationSessionService;
        this.incidentService = incidentService;
        this.evidenceService = evidenceService;
        this.huntService = huntService;
        this.approvalService = approvalService;
    }

    @PostConstruct
    void initKey() {
        // Derive a 256-bit key from the signing secret for JWT operations
        byte[] keyBytes = signingSecret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            // Pad with SHA-256 hash if secret is too short
            try {
                keyBytes = MessageDigest.getInstance("SHA-256").digest(keyBytes);
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException("SHA-256 not available", e);
            }
        }
        this.jwtKey = Keys.hmacShaKeyFor(Arrays.copyOf(keyBytes, 32));
    }

    // =========================================================================
    // Preview (subtasks 6.2, 6.3, 6.4)
    // =========================================================================

    /**
     * Generates a preview of the promotion action including entity extraction,
     * suggested title/description, and a signed previewToken.
     *
     * @param action              the promotion action type (create_evidence, create_investigation, escalate_incident)
     * @param eventIds            list of event document IDs to promote
     * @param searchId            hunt search session that authorized the selection
     * @param owner               authenticated principal
     * @param tenantKey           authorized tenant key for the hunt session
     * @return a preview response map
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> preview(String action, List<String> eventIds,
                                       String searchId, String owner, String tenantKey) throws Exception {
        final String ctx = CLASSNAME + ".preview";
        log.debug("{}: action={}, eventCount={}, searchId={}", ctx, action, eventIds.size(), searchId);

        HuntSearchSessionStore.Session session = requireSearchSession(searchId, owner, tenantKey);
        List<Map<String, Object>> events = fetchEventsFromSession(eventIds, session);

        Map<String, List<String>> entities = extractEntities(events);

        // Build entity list for the preview
        List<String> entityList = buildEntityList(entities);

        // Generate title (subtask 6.4)
        String dominantCategory = findDominantCategory(events);
        String title = generateTitle(action, dominantCategory, events.size(), entities);

        // Generate description
        String description = generateDescription(action, events.size(), entities, dominantCategory);

        // Generate preview token (JWT, 5-min expiry, action + eventIds hash + permission version)
        String permissionVersion = currentPermissionVersion();
        String principal = owner == null ? "" : owner;
        boolean approvalRequired = requiresApproval(action, events.size());
        String previewToken = generatePreviewToken(action, eventIds, searchId, permissionVersion, principal);

        // Build warnings
        List<String> warnings = new ArrayList<>();
        if (events.size() > 50) {
            warnings.add("Large promotion: " + events.size() + " events may take longer to process");
        }
        if (approvalRequired) {
            warnings.add("Manager approval is required before execute (approvalId)");
        }

        // Build response
        Map<String, Object> previewContent = new LinkedHashMap<>();
        previewContent.put("title", title);
        previewContent.put("description", description);
        previewContent.put("entities", entityList);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", action);
        result.put("eventCount", events.size());
        result.put("preview", previewContent);
        result.put("warnings", warnings);
        result.put("previewToken", previewToken);
        result.put("permissionVersion", permissionVersion);
        result.put("approvalRequired", approvalRequired);
        if (approvalRequired) {
            result.put("approvalRequestPath", "/api/ha-hunts/approvals");
        }
        result.put("expiresInSeconds", TOKEN_VALIDITY_MILLIS / 1000L);

        return result;
    }

    // =========================================================================
    // Execute (subtasks 6.5, 6.6, 6.7, 6.8, 6.9)
    // =========================================================================

    /**
     * Executes the promotion action after validating the previewToken.
     *
     * @param action              the promotion action type
     * @param eventIds            list of event document IDs
     * @param title               user-confirmed title
     * @param description         user-confirmed description
     * @param parameters          optional additional parameters
     * @param previewToken        JWT token from the preview step
     * @param userId              the executing user's ID
     * @param tenantId            the tenant ID
     * @param searchId            hunt search session that authorized the selection
     * @param owner               authenticated principal
     * @param tenantKey           authorized tenant key for the hunt session
     * @return execution result map
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> execute(String action, List<String> eventIds,
                                       String title, String description,
                                       Map<String, Object> parameters,
                                       String previewToken, String userId,
                                       String tenantId, String searchId,
                                       String owner, String tenantKey) throws Exception {
        final String ctx = CLASSNAME + ".execute";
        log.debug("{}: action={}, eventCount={}, userId={}, searchId={}", ctx, action, eventIds.size(), userId, searchId);

        HuntSearchSessionStore.Session session = requireSearchSession(searchId, owner, tenantKey);
        validatePreviewToken(previewToken, action, eventIds, searchId);
        boolean approvalRequired = requiresApproval(action, eventIds.size());
        if (approvalRequired) {
            Object approvalId = parameters == null ? null : parameters.get("approvalId");
            String approvalIdText = approvalId == null ? null : approvalId.toString();
            approvalService.consumeApproved(
                approvalIdText, action, eventIds, searchId, owner, tenantKey
            );
        }
        fetchEventsFromSession(eventIds, session);

        switch (action) {
            case "create_evidence":
                return createEvidence(eventIds, title, description, userId, tenantId, session, parameters);
            case "create_investigation":
                return createInvestigation(eventIds, title, description, userId, tenantId);
            case "escalate_incident":
                return escalateIncident(eventIds, title, description, parameters, userId, tenantId, searchId);
            default:
                throw new IllegalArgumentException("Unknown action: " + action);
        }
    }

    // =========================================================================
    // Preview Token (subtask 6.5)
    // =========================================================================

    /**
     * Generates a JWT preview token with 5-minute expiry.
     * Binds action, eventIds hash, searchId, principal, and permissionVersion.
     */
    String generatePreviewToken(String action, List<String> eventIds, String searchId) {
        return generatePreviewToken(action, eventIds, searchId, currentPermissionVersion(),
            SecurityUtils.getCurrentUserLogin().orElse(""));
    }

    String generatePreviewToken(String action, List<String> eventIds, String searchId,
                                String permissionVersion, String principal) {
        String eventIdsHash = hashEventIds(eventIds);

        Date now = new Date();
        Date expiry = new Date(now.getTime() + TOKEN_VALIDITY_MILLIS);

        return Jwts.builder()
            .setSubject("hunt-promotion-preview")
            .claim("action", action)
            .claim("eventIdsHash", eventIdsHash)
            .claim("searchId", searchId)
            .claim("permissionVersion", permissionVersion)
            .claim("principal", principal)
            .setIssuedAt(now)
            .setExpiration(expiry)
            .signWith(jwtKey, SignatureAlgorithm.HS256)
            .compact();
    }

    /**
     * Validates a preview token: signature, expiry, action, searchId, eventIds hash,
     * principal, and permission version.
     *
     * @throws IllegalArgumentException if the token is invalid or expired
     */
    public void validatePreviewToken(String previewToken, String action, List<String> eventIds, String searchId) {
        final String ctx = CLASSNAME + ".validatePreviewToken";
        try {
            Claims claims = Jwts.parserBuilder()
                .setSigningKey(jwtKey)
                .build()
                .parseClaimsJws(previewToken)
                .getBody();

            String tokenAction = claims.get("action", String.class);
            if (!action.equals(tokenAction)) {
                throw new IllegalArgumentException("Preview token action mismatch: expected '"
                    + action + "', got '" + tokenAction + "'");
            }

            String tokenSearchId = claims.get("searchId", String.class);
            if (!searchId.equals(tokenSearchId)) {
                throw new IllegalArgumentException("Preview token search session mismatch");
            }

            String tokenHash = claims.get("eventIdsHash", String.class);
            String currentHash = hashEventIds(eventIds);
            if (!currentHash.equals(tokenHash)) {
                throw new IllegalArgumentException("Preview token eventIds mismatch — events changed since preview");
            }

            String tokenPrincipal = claims.get("principal", String.class);
            String currentPrincipal = SecurityUtils.getCurrentUserLogin().orElse("");
            if (tokenPrincipal != null && !tokenPrincipal.isBlank() && !tokenPrincipal.equals(currentPrincipal)) {
                throw new IllegalArgumentException("Preview token principal mismatch");
            }

            String tokenPermissionVersion = claims.get("permissionVersion", String.class);
            String currentVersion = currentPermissionVersion();
            if (tokenPermissionVersion != null && !tokenPermissionVersion.isBlank()
                && !tokenPermissionVersion.equals(currentVersion)) {
                throw new IllegalArgumentException(
                    "Preview token permission version mismatch — re-run preview after role changes");
            }

        } catch (ExpiredJwtException e) {
            throw new IllegalArgumentException("Preview token expired. Please generate a new preview.");
        } catch (IllegalArgumentException e) {
            throw e; // re-throw our own validation errors
        } catch (Exception e) {
            log.warn("{}: token validation failed: {}", ctx, e.getMessage());
            throw new IllegalArgumentException("Invalid preview token");
        }
    }

    static boolean requiresApproval(String action, int eventCount) {
        if ("escalate_incident".equals(action) || "create_investigation".equals(action)) {
            return true;
        }
        // Large create_evidence batches require manager approval.
        return "create_evidence".equals(action) && eventCount > 25;
    }

    String currentPermissionVersion() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities() == null) {
            return "anonymous";
        }
        String joined = auth.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .sorted()
            .collect(Collectors.joining("|"));
        return hashEventIds(List.of(joined));
    }

    // =========================================================================
    // create_evidence (subtask 6.6)
    // =========================================================================

    /**
     * Builds an evidence document with event references, timestamp range, and entity summary.
     * Indexes the document to {@code v3-hive-evidence-{tenantPrefix}-YYYY.MM.DD}.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> createEvidence(List<String> eventIds, String title,
                                               String description, String userId,
                                               String tenantId, HuntSearchSessionStore.Session session,
                                               Map<String, Object> parameters) throws Exception {
        final String ctx = CLASSNAME + ".createEvidence";

        List<Map<String, Object>> events = fetchEventsFromSession(eventIds, session);

        // Extract timestamp range
        String earliestTimestamp = null;
        String latestTimestamp = null;
        for (Map<String, Object> event : events) {
            String ts = getNestedString(event, "@timestamp");
            if (ts != null) {
                if (earliestTimestamp == null || ts.compareTo(earliestTimestamp) < 0) {
                    earliestTimestamp = ts;
                }
                if (latestTimestamp == null || ts.compareTo(latestTimestamp) > 0) {
                    latestTimestamp = ts;
                }
            }
        }

        // Extract entities for the evidence document
        Map<String, List<String>> entities = extractEntities(events);

        // Build the evidence document
        String evidenceId = UUID.randomUUID().toString();
        Map<String, Object> evidenceDoc = new LinkedHashMap<>();
        evidenceDoc.put("id", evidenceId);
        evidenceDoc.put("title", title);
        evidenceDoc.put("description", description);
        evidenceDoc.put("type", "evidence");
        evidenceDoc.put("status", "created");
        evidenceDoc.put("createdBy", userId);
        evidenceDoc.put("createdAt", Instant.now().toString());
        evidenceDoc.put("eventCount", events.size());
        evidenceDoc.put("eventIds", eventIds);
        evidenceDoc.put("timestampRange", Map.of(
            "earliest", earliestTimestamp != null ? earliestTimestamp : "",
            "latest", latestTimestamp != null ? latestTimestamp : ""
        ));
        evidenceDoc.put("entities", entities);
        evidenceDoc.put("tenantId", tenantId);

        // Index to v3-hive-evidence-{tenantPrefix}-YYYY.MM.DD
        String tenantPrefix = com.hivearmor.multitenancy.TenantContext.get();
        String date = LocalDate.now().format(INDEX_DATE_FORMAT);
        String evidenceIndex;
        if (tenantPrefix != null && !tenantPrefix.isBlank()) {
            evidenceIndex = "v3-hive-evidence-" + tenantPrefix + "-" + date;
        } else {
            evidenceIndex = "v3-hive-evidence-" + date;
        }

        log.info("{}: indexing evidence document id={} to index={}", ctx, evidenceId, evidenceIndex);
        osClient.execute(os -> os.index(evidenceIndex, evidenceDoc));
        List<Map<String, Object>> eventOutcomes = attachHuntEventsToIncident(parameters, eventIds, session.searchId(), userId);

        // Build response (subtask 6.9) with retry-safe per-event outcomes
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("actionId", UUID.randomUUID().toString());
        result.put("resultType", "evidence");
        result.put("resultId", evidenceId);
        result.put("status", "created");
        result.put("url", "/evidence/" + evidenceId);
        result.put("eventOutcomes", eventOutcomes);

        return result;
    }

    // =========================================================================
    // create_investigation (subtask 6.7 — placeholder)
    // =========================================================================

    /**
     * Creates an investigation session and pins each authorized hunt event as LOG_EVENT evidence.
     */
    private Map<String, Object> createInvestigation(List<String> eventIds, String title,
                                                    String description, String userId,
                                                    String tenantId) {
        final String ctx = CLASSNAME + ".createInvestigation";

        InvestigationSessionDTO created = investigationSessionService.createSession(
            new InvestigationSessionDTO(
                null,
                title,
                description == null || description.isBlank()
                    ? "Created from hunt (" + eventIds.size() + " events)"
                    : description,
                "ACTIVE",
                userId,
                userId,
                null,
                null,
                null,
                0
            ),
            userId
        );

        for (String eventId : eventIds) {
            try {
                investigationSessionService.pinItem(
                    created.id(),
                    new SessionItemDTO(null, created.id(), "LOG_EVENT", eventId, null, null, userId, null),
                    userId,
                    true
                );
            } catch (Exception pinEx) {
                log.warn("{}: failed to pin event {} to session {}: {}",
                    ctx, eventId, created.id(), pinEx.getMessage());
            }
        }

        log.info("{}: created investigation id={}, title='{}', eventCount={}, tenant={}, userId={}",
            ctx, created.id(), title, eventIds.size(), tenantId, userId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("actionId", UUID.randomUUID().toString());
        result.put("resultType", "investigation");
        result.put("resultId", String.valueOf(created.id()));
        result.put("status", "created");
        result.put("url", "/investigations/" + created.id());
        return result;
    }

    // =========================================================================
    // escalate_incident
    // =========================================================================

    /**
     * Creates or links a tracked incident and attaches hunt events as evidence items.
     */
    private Map<String, Object> escalateIncident(List<String> eventIds, String title,
                                                 String description,
                                                 Map<String, Object> parameters,
                                                 String userId, String tenantId,
                                                 String searchId) {
        final String ctx = CLASSNAME + ".escalateIncident";

        if (parameters != null && parameters.get("incidentId") != null
                && !parameters.get("incidentId").toString().isBlank()) {
            String existingId = parameters.get("incidentId").toString();
            attachHuntEvents(existingId, eventIds, searchId, userId);
            Map<String, Object> linked = new LinkedHashMap<>();
            linked.put("actionId", UUID.randomUUID().toString());
            linked.put("resultType", "incident");
            linked.put("resultId", existingId);
            linked.put("status", "linked");
            linked.put("url", "/incidents/" + existingId);
            return linked;
        }

        NewIncidentDTO dto = new NewIncidentDTO();
        dto.setIncidentName(title);
        String boundedDescription = description == null || description.isBlank()
            ? "Created from authorized hunt snapshot " + searchId
            : description;
        if (boundedDescription.length() > 2000) {
            boundedDescription = boundedDescription.substring(0, 2000);
        }
        dto.setIncidentDescription(boundedDescription);
        dto.setIncidentAssignedTo(userId);

        UtmIncident created = incidentService.createIncident(dto);
        attachHuntEvents(String.valueOf(created.getId()), eventIds, searchId, userId);

        log.info("{}: created incident id={}, title='{}', eventCount={}, tenant={}, userId={}",
            ctx, created.getId(), title, eventIds.size(), tenantId, userId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("actionId", UUID.randomUUID().toString());
        result.put("resultType", "incident");
        result.put("resultId", String.valueOf(created.getId()));
        result.put("status", "created");
        result.put("url", "/incidents/" + created.getId());
        return result;
    }

    private List<Map<String, Object>> attachHuntEventsToIncident(Map<String, Object> parameters, List<String> eventIds,
                                                                 String searchId, String userId) {
        if (parameters == null || parameters.get("incidentId") == null
                || parameters.get("incidentId").toString().isBlank()) {
            List<Map<String, Object>> skipped = new ArrayList<>();
            for (String eventId : eventIds) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("eventId", eventId);
                row.put("status", "indexed_only");
                row.put("detail", "no incidentId; evidence package indexed without incident attach");
                skipped.add(row);
            }
            return skipped;
        }
        return attachHuntEvents(parameters.get("incidentId").toString(), eventIds, searchId, userId);
    }

    private List<Map<String, Object>> attachHuntEvents(String incidentIdValue, List<String> eventIds, String searchId, String userId) {
        List<Map<String, Object>> outcomes = new ArrayList<>();
        long incidentId;
        try {
            incidentId = Long.parseLong(incidentIdValue);
        } catch (NumberFormatException e) {
            log.warn("{}.attachHuntEvents: incident id is not numeric: {}", CLASSNAME, incidentIdValue);
            for (String eventId : eventIds) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("eventId", eventId);
                row.put("status", "failed");
                row.put("detail", "incident id is not numeric");
                outcomes.add(row);
            }
            return outcomes;
        }
        for (String eventId : eventIds) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("eventId", eventId);
            try {
                evidenceService.addItem(
                    incidentId,
                    new EvidenceItemDTO(
                        null,
                        incidentId,
                        "LOG_EVENT",
                        "Hunt snapshot event",
                        "searchId=" + searchId,
                        eventId,
                        null,
                        userId,
                        null,
                        null),
                    userId);
                row.put("status", "created");
                row.put("detail", "attached to incident " + incidentId);
            } catch (Exception e) {
                log.warn("{}.attachHuntEvents: failed for event {}: {}", CLASSNAME, eventId, e.getMessage());
                row.put("status", "failed");
                row.put("detail", e.getMessage() == null ? "attach failed" : e.getMessage());
            }
            outcomes.add(row);
        }
        return outcomes;
    }

    // =========================================================================
    // Entity extraction (subtask 6.3)
    // =========================================================================

    /**
     * Scans events for unique source.ip, destination.ip, host.name, user.name,
     * file.hash.sha256 — deduplicates into entity lists.
     */
    @SuppressWarnings("unchecked")
    Map<String, List<String>> extractEntities(List<Map<String, Object>> events) {
        Set<String> sourceIps = new LinkedHashSet<>();
        Set<String> destIps = new LinkedHashSet<>();
        Set<String> hostnames = new LinkedHashSet<>();
        Set<String> users = new LinkedHashSet<>();
        Set<String> hashes = new LinkedHashSet<>();

        for (Map<String, Object> event : events) {
            // source.ip
            String srcIp = getNestedString(event, "source.ip");
            if (srcIp != null && !srcIp.isBlank()) {
                sourceIps.add(srcIp);
            }

            // destination.ip
            String dstIp = getNestedString(event, "destination.ip");
            if (dstIp != null && !dstIp.isBlank()) {
                destIps.add(dstIp);
            }

            // host.name
            String hostname = getNestedString(event, "host.name");
            if (hostname != null && !hostname.isBlank()) {
                hostnames.add(hostname);
            }

            // user.name
            String user = getNestedString(event, "user.name");
            if (user != null && !user.isBlank()) {
                users.add(user);
            }

            // file.hash.sha256
            String hash = getNestedString(event, "file.hash.sha256");
            if (hash != null && !hash.isBlank()) {
                hashes.add(hash);
            }
        }

        Map<String, List<String>> entities = new LinkedHashMap<>();
        if (!sourceIps.isEmpty()) entities.put("source_ips", new ArrayList<>(sourceIps));
        if (!destIps.isEmpty()) entities.put("destination_ips", new ArrayList<>(destIps));
        if (!hostnames.isEmpty()) entities.put("hostnames", new ArrayList<>(hostnames));
        if (!users.isEmpty()) entities.put("users", new ArrayList<>(users));
        if (!hashes.isEmpty()) entities.put("file_hashes", new ArrayList<>(hashes));

        return entities;
    }

    // =========================================================================
    // Title generation (subtask 6.4)
    // =========================================================================

    /**
     * Generates a suggested title based on action type and dominant event category.
     */
    String generateTitle(String action, String dominantCategory, int eventCount,
                         Map<String, List<String>> entities) {
        String prefix;
        switch (action) {
            case "create_evidence":
                prefix = buildCategoryPrefix(dominantCategory) + " Evidence";
                break;
            case "create_investigation":
                prefix = buildCategoryPrefix(dominantCategory) + " Investigation";
                break;
            case "escalate_incident":
                prefix = buildCategoryPrefix(dominantCategory) + " Incident";
                break;
            default:
                prefix = "Promotion";
        }

        // Add context from entities
        int hostsAffected = entities.getOrDefault("hostnames", Collections.emptyList()).size();
        if (hostsAffected > 1) {
            return prefix + " - " + eventCount + " events, " + hostsAffected + " hosts affected";
        }
        return prefix + " - " + eventCount + " events";
    }

    /**
     * Generates a suggested description based on the promotion context.
     */
    String generateDescription(String action, int eventCount,
                               Map<String, List<String>> entities, String dominantCategory) {
        StringBuilder sb = new StringBuilder();
        sb.append("Promotion of ").append(eventCount).append(" event(s)");

        if (dominantCategory != null) {
            sb.append(" from category '").append(dominantCategory).append("'");
        }

        sb.append(". ");

        // Add entity summary
        List<String> entitySummary = new ArrayList<>();
        if (entities.containsKey("source_ips")) {
            entitySummary.add(entities.get("source_ips").size() + " source IP(s)");
        }
        if (entities.containsKey("hostnames")) {
            entitySummary.add(entities.get("hostnames").size() + " host(s)");
        }
        if (entities.containsKey("users")) {
            entitySummary.add(entities.get("users").size() + " user(s)");
        }

        if (!entitySummary.isEmpty()) {
            sb.append("Involves: ").append(String.join(", ", entitySummary)).append(".");
        }

        return sb.toString();
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    private HuntSearchSessionStore.Session requireSearchSession(String searchId, String owner, String tenantKey) {
        if (searchId == null || searchId.isBlank()) {
            throw new HuntQueryException("HUNT_SEARCH_ID_REQUIRED", "Field 'searchId' is required", 0);
        }
        return huntService.requireSession(searchId, owner, tenantKey);
    }

    /**
     * Fetches selected events only from the caller's hunt snapshot (PIT or session indices).
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Map<String, Object>> fetchEventsFromSession(List<String> eventIds,
                                                             HuntSearchSessionStore.Session session) throws Exception {
        SearchRequest.Builder builder = new SearchRequest.Builder()
            .query(Query.of(q -> q.ids(i -> i.values(eventIds))))
            .size(Math.min(eventIds.size(), MAX_EVENT_IDS));
        if (session.pitId() == null || session.pitId().isBlank()) {
            builder.index(session.indices()).ignoreUnavailable(true).allowNoIndices(true);
        } else {
            builder.pit(org.opensearch.client.opensearch.core.search.Pit.of(p -> p.id(session.pitId()).keepAlive("2m")));
        }
        SearchResponse<Map> response = osClient.execute(os -> os.search(builder.build(), Map.class));

        List<Map<String, Object>> events = new ArrayList<>();
        if (response.hits() != null && response.hits().hits() != null) {
            for (Hit<Map> hit : response.hits().hits()) {
                if (hit.source() != null) {
                    Map<String, Object> source = new LinkedHashMap<>((Map<String, Object>) hit.source());
                    source.put("_id", hit.id());
                    events.add(source);
                }
            }
        }
        if (events.isEmpty()) {
            throw new HuntQueryException("HUNT_EVENT_NOT_FOUND", "None of the specified events exist in this hunt snapshot", 0);
        }
        if (events.size() < eventIds.size()) {
            throw new HuntQueryException(
                "HUNT_EVENT_NOT_IN_SNAPSHOT",
                "One or more selected events are not members of this hunt snapshot",
                0);
        }
        return events;
    }

    /**
     * Determines the most common event.category across all events.
     */
    private String findDominantCategory(List<Map<String, Object>> events) {
        Map<String, Integer> categoryCounts = new HashMap<>();
        for (Map<String, Object> event : events) {
            String category = getNestedString(event, "event.category");
            if (category != null && !category.isBlank()) {
                categoryCounts.merge(category, 1, Integer::sum);
            }
        }
        return categoryCounts.entrySet().stream()
            .max(Map.Entry.comparingByValue())
            .map(Map.Entry::getKey)
            .orElse(null);
    }

    /**
     * Builds the category-based prefix for titles.
     */
    private String buildCategoryPrefix(String category) {
        if (category == null) return "Security";
        switch (category.toLowerCase()) {
            case "network":
                return "Network C2";
            case "process":
                return "Process Execution";
            case "file":
                return "File Activity";
            case "authentication":
            case "iam":
                return "Authentication";
            case "registry":
                return "Registry Modification";
            default:
                return "Security";
        }
    }

    /**
     * Builds a flat entity list for the preview response.
     */
    private List<String> buildEntityList(Map<String, List<String>> entities) {
        List<String> list = new ArrayList<>();
        entities.forEach((type, values) -> {
            for (String value : values) {
                list.add(type + ":" + value);
            }
        });
        return list;
    }

    /**
     * Computes a SHA-256 hash of the sorted eventIds for token validation.
     */
    private String hashEventIds(List<String> eventIds) {
        try {
            List<String> sorted = new ArrayList<>(eventIds);
            Collections.sort(sorted);
            String joined = String.join(",", sorted);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(joined.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    /**
     * Navigates nested maps to retrieve a string value by dot-separated path.
     */
    @SuppressWarnings("unchecked")
    private String getNestedString(Map<String, Object> map, String path) {
        String[] parts = path.split("\\.");
        Object current = map;
        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return null;
            }
        }
        if (current instanceof String) {
            return (String) current;
        }
        if (current != null) {
            return current.toString();
        }
        return null;
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
