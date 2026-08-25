package com.hivearmor.service.correlation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.FindingNote;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.FindingNoteRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Service for correlated finding lifecycle mutations with idempotency (COR-004).
 *
 * <p>Provides:
 * <ul>
 *   <li>{@code changeStatus} — validate transition via state machine, update OS doc, broadcast SSE</li>
 *   <li>{@code assignFinding} — update assignee, broadcast SSE</li>
 *   <li>{@code addNote} — create FindingNote in PostgreSQL, broadcast SSE</li>
 * </ul>
 *
 * <p>All mutations check idempotency keys to prevent duplicate execution.
 *
 * <p>Status state machine:
 * <ul>
 *   <li>new → reviewing (valid)</li>
 *   <li>reviewing → confirmed (valid)</li>
 *   <li>reviewing → dismissed (valid)</li>
 *   <li>confirmed → reviewing (reopen)</li>
 *   <li>dismissed → reviewing (reopen)</li>
 *   <li>All others → 422</li>
 * </ul>
 *
 * <p>SEC-03: OpenSearch update scripts are allowlisted constants (status) or charset-validated
 * assignee tokens. Request strings are never free-form-concatenated into Painless source.
 * Transition {@code reason} stays in the API response / audit path only.
 *
 * <p>Sprint 44 — Correlated Findings.
 */
@Service
public class FindingLifecycleService {

    private static final Logger log = LoggerFactory.getLogger(FindingLifecycleService.class);
    private static final String CLASSNAME = "FindingLifecycleService";

    /** Valid status transitions: key=fromStatus, value=set of allowed toStatuses. */
    private static final Map<String, Set<String>> VALID_TRANSITIONS = Map.of(
        "new", Set.of("reviewing"),
        "reviewing", Set.of("confirmed", "dismissed"),
        "confirmed", Set.of("reviewing"),
        "dismissed", Set.of("reviewing")
    );

    /** Safe assignee tokens only — never free-form text in Painless. */
    private static final Pattern SAFE_ASSIGNEE =
        Pattern.compile("^[a-zA-Z0-9._@+\\-]{1,128}$");

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final CorrelatedFindingService correlatedFindingService;
    private final FindingIdempotencyStore idempotencyStore;
    private final FindingNoteRepository noteRepository;
    private final FindingSseService sseService;
    private final MsspIndexResolver indexResolver;

    public FindingLifecycleService(OpensearchClientBuilder osClient,
                                   ObjectMapper objectMapper,
                                   CorrelatedFindingService correlatedFindingService,
                                   FindingIdempotencyStore idempotencyStore,
                                   FindingNoteRepository noteRepository,
                                   FindingSseService sseService,
                                   MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.correlatedFindingService = correlatedFindingService;
        this.idempotencyStore = idempotencyStore;
        this.noteRepository = noteRepository;
        this.sseService = sseService;
        this.indexResolver = indexResolver;
    }

    // =========================================================================
    // Status change
    // =========================================================================

    /**
     * Changes the status of a correlated finding, enforcing the state machine.
     *
     * @param findingId       the finding identifier
     * @param newStatus       the target status
     * @param reason          optional reason for the transition
     * @param idempotencyKey  client-provided idempotency key
     * @param userId          the actor performing the change
     * @param tenantId        the tenant ID for idempotency storage and SSE
     * @param indexPattern    tenant-scoped index pattern for correlation data
     * @return result map with finding state and transition details
     * @throws InvalidTransitionException if the transition is not valid
     */
    public Map<String, Object> changeStatus(String findingId, String newStatus, String reason,
                                            String idempotencyKey, String userId, Long tenantId,
                                            String indexPattern) throws Exception {
        // Check idempotency
        Optional<String> cached = idempotencyStore.check(idempotencyKey);
        if (cached.isPresent()) {
            return objectMapper.readValue(cached.get(), new com.fasterxml.jackson.core.type.TypeReference<>() {});
        }

        // Fetch current finding
        Optional<Map<String, Object>> findingOpt = correlatedFindingService.getFinding(findingId, indexPattern);
        if (findingOpt.isEmpty()) {
            throw new FindingNotFoundException("Finding not found: " + findingId);
        }

        Map<String, Object> finding = findingOpt.get();
        String currentStatus = finding.get("status") != null
            ? finding.get("status").toString().toLowerCase(Locale.ROOT)
            : "new";

        String targetStatus = newStatus.toLowerCase(Locale.ROOT);

        // Validate transition
        Set<String> allowed = VALID_TRANSITIONS.getOrDefault(currentStatus, Set.of());
        if (!allowed.contains(targetStatus)) {
            throw new InvalidTransitionException(currentStatus, targetStatus, allowed);
        }

        Instant now = Instant.now();
        String updateScript = statusUpdateScript(targetStatus, now);
        if (updateScript == null) {
            throw new InvalidTransitionException(currentStatus, targetStatus, allowed);
        }

        Query updateQuery = Query.of(q -> q.term(t ->
            t.field("id").value(v -> v.stringValue(findingId))));

        final String script = updateScript;
        osClient.execute(os -> {
            os.updateByQuery(updateQuery, indexPattern, script);
            return null;
        });

        // Build response (reason is returned for audit; never written via Painless)
        Map<String, Object> response = new LinkedHashMap<>();

        Map<String, Object> findingResult = new LinkedHashMap<>();
        findingResult.put("id", findingId);
        findingResult.put("status", targetStatus);
        findingResult.put("updatedAt", now.toString());
        response.put("finding", findingResult);

        Map<String, Object> transition = new LinkedHashMap<>();
        transition.put("from", currentStatus);
        transition.put("to", targetStatus);
        transition.put("actor", userId);
        transition.put("timestamp", now.toString());
        if (reason != null && !reason.isBlank()) {
            transition.put("reason", reason);
        }
        response.put("transition", transition);

        // Store idempotency
        String responseJson = objectMapper.writeValueAsString(response);
        idempotencyStore.store(idempotencyKey, findingId, responseJson, tenantId);

        // Broadcast SSE
        Map<String, Object> sseData = new LinkedHashMap<>(response);
        sseData.put("actor", userId);
        sseService.broadcast(tenantId, "finding.updated", sseData);

        return response;
    }

    // =========================================================================
    // Assignment
    // =========================================================================

    /**
     * Assigns or reassigns a correlated finding.
     *
     * @param findingId      the finding identifier
     * @param assignee       the new assignee (null to unassign)
     * @param idempotencyKey client-provided idempotency key
     * @param userId         the actor performing the change
     * @param tenantId       the tenant ID
     * @param indexPattern   tenant-scoped index pattern
     * @return result map with finding state and previous assignee
     */
    public Map<String, Object> assignFinding(String findingId, String assignee,
                                             String idempotencyKey, String userId,
                                             Long tenantId, String indexPattern) throws Exception {
        // Check idempotency
        Optional<String> cached = idempotencyStore.check(idempotencyKey);
        if (cached.isPresent()) {
            return objectMapper.readValue(cached.get(), new com.fasterxml.jackson.core.type.TypeReference<>() {});
        }

        // Fetch current finding
        Optional<Map<String, Object>> findingOpt = correlatedFindingService.getFinding(findingId, indexPattern);
        if (findingOpt.isEmpty()) {
            throw new FindingNotFoundException("Finding not found: " + findingId);
        }

        Map<String, Object> finding = findingOpt.get();
        String previousAssignee = finding.get("assignee") != null ? finding.get("assignee").toString() : null;

        Instant now = Instant.now();
        String updateScript = assigneeUpdateScript(assignee, now);
        if (updateScript == null) {
            throw new IllegalArgumentException(
                "Assignee must be null (unassign) or match [a-zA-Z0-9._@+-]{1,128}");
        }

        Query updateQuery = Query.of(q -> q.term(t ->
            t.field("id").value(v -> v.stringValue(findingId))));

        final String script = updateScript;
        osClient.execute(os -> {
            os.updateByQuery(updateQuery, indexPattern, script);
            return null;
        });

        // Build response
        Map<String, Object> response = new LinkedHashMap<>();

        Map<String, Object> findingResult = new LinkedHashMap<>();
        findingResult.put("id", findingId);
        findingResult.put("assignee", assignee);
        findingResult.put("updatedAt", now.toString());
        response.put("finding", findingResult);
        response.put("previousAssignee", previousAssignee);

        // Store idempotency
        String responseJson = objectMapper.writeValueAsString(response);
        idempotencyStore.store(idempotencyKey, findingId, responseJson, tenantId);

        // Broadcast SSE
        Map<String, Object> sseData = new LinkedHashMap<>(response);
        sseData.put("actor", userId);
        sseService.broadcast(tenantId, "finding.updated", sseData);

        return response;
    }

    // =========================================================================
    // Notes
    // =========================================================================

    /**
     * Adds an analyst note to a correlated finding.
     *
     * @param findingId      the finding identifier
     * @param content        the note content
     * @param mentions       optional @mentions (comma-separated or JSON array)
     * @param idempotencyKey client-provided idempotency key
     * @param userId         the actor (author)
     * @param tenantId       the tenant ID
     * @return result map with the created note
     */
    @Transactional
    public Map<String, Object> addNote(String findingId, String content, String mentions,
                                       String idempotencyKey, String userId,
                                       Long tenantId) throws Exception {
        // Check idempotency
        Optional<String> cached = idempotencyStore.check(idempotencyKey);
        if (cached.isPresent()) {
            return objectMapper.readValue(cached.get(), new com.fasterxml.jackson.core.type.TypeReference<>() {});
        }

        // Create note in PostgreSQL
        FindingNote note = new FindingNote();
        note.setId(UUID.randomUUID().toString());
        note.setFindingId(findingId);
        note.setContent(content);
        note.setAuthor(userId);
        note.setMentions(mentions);
        note.setTenantId(tenantId);
        note.setCreatedAt(Instant.now());

        noteRepository.save(note);

        // Build response
        Map<String, Object> response = new LinkedHashMap<>();
        Map<String, Object> noteResult = new LinkedHashMap<>();
        noteResult.put("id", note.getId());
        noteResult.put("content", note.getContent());
        noteResult.put("author", note.getAuthor());
        noteResult.put("createdAt", note.getCreatedAt().toString());
        noteResult.put("mentions", parseMentions(mentions));
        response.put("note", noteResult);

        // Store idempotency
        String responseJson = objectMapper.writeValueAsString(response);
        idempotencyStore.store(idempotencyKey, findingId, responseJson, tenantId);

        // Broadcast SSE
        Map<String, Object> sseData = new LinkedHashMap<>();
        sseData.put("findingId", findingId);
        sseData.put("note", noteResult);
        sseData.put("actor", userId);
        sseService.broadcast(tenantId, "finding.updated", sseData);

        return response;
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Returns the set of allowed transitions for a given status.
     */
    public Set<String> getAllowedTransitions(String currentStatus) {
        return VALID_TRANSITIONS.getOrDefault(
            currentStatus != null ? currentStatus.toLowerCase(Locale.ROOT) : "new",
            Set.of());
    }

    /**
     * Fixed Painless status assignment for an allowlisted target. Never interpolates
     * request strings into script source. Returns {@code null} when status is unknown.
     */
    static String statusUpdateScript(String status, Instant updatedAt) {
        String ts = updatedAt.toString();
        return switch (status) {
            case "new" -> "ctx._source.status = 'new'; ctx._source.updatedAt = '" + ts + "';";
            case "reviewing" -> "ctx._source.status = 'reviewing'; ctx._source.updatedAt = '" + ts + "';";
            case "confirmed" -> "ctx._source.status = 'confirmed'; ctx._source.updatedAt = '" + ts + "';";
            case "dismissed" -> "ctx._source.status = 'dismissed'; ctx._source.updatedAt = '" + ts + "';";
            default -> null;
        };
    }

    /**
     * Fixed Painless assignee update. Unassign uses a constant script; assign embeds only
     * charset-validated tokens (no quotes/semicolons/backslash).
     */
    static String assigneeUpdateScript(String assignee, Instant updatedAt) {
        String ts = updatedAt.toString();
        if (assignee == null || assignee.isBlank()) {
            return "ctx._source.assignee = null; ctx._source.updatedAt = '" + ts + "';";
        }
        if (!SAFE_ASSIGNEE.matcher(assignee).matches()) {
            return null;
        }
        return "ctx._source.assignee = '" + assignee + "'; ctx._source.updatedAt = '" + ts + "';";
    }

    private List<String> parseMentions(String mentions) {
        if (mentions == null || mentions.isBlank()) {
            return List.of();
        }
        // Try JSON array format first
        try {
            return objectMapper.readValue(mentions, new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
        } catch (Exception e) {
            // Fallback to comma-separated
            return Arrays.asList(mentions.split(","));
        }
    }

    // =========================================================================
    // Exception types
    // =========================================================================

    /**
     * Thrown when a status transition is not valid per the state machine.
     */
    public static class InvalidTransitionException extends RuntimeException {
        private final String fromStatus;
        private final String toStatus;
        private final Set<String> allowedTransitions;

        public InvalidTransitionException(String from, String to, Set<String> allowed) {
            super("Invalid transition from '" + from + "' to '" + to + "'. Allowed: " + allowed);
            this.fromStatus = from;
            this.toStatus = to;
            this.allowedTransitions = allowed;
        }

        public String getFromStatus() { return fromStatus; }
        public String getToStatus() { return toStatus; }
        public Set<String> getAllowedTransitions() { return allowedTransitions; }
    }

    /**
     * Thrown when a finding cannot be found by ID.
     */
    public static class FindingNotFoundException extends RuntimeException {
        public FindingNotFoundException(String message) {
            super(message);
        }
    }
}
