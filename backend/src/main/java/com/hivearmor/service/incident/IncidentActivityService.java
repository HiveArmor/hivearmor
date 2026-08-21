package com.hivearmor.service.incident;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.IncidentActivity;
import com.hivearmor.repository.IncidentActivityRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Service for the incident collaboration activity feed.
 *
 * <p>Implements INC-006: Collaboration activity feed within the incident workbench.
 * Provides cursor-paginated activity retrieval, note creation with @mention extraction,
 * and internal activity recording used by other services.
 *
 * <p>Sprint 43 — Incident Workbench.
 */
@Service
@Transactional
public class IncidentActivityService {

    private static final Logger log = LoggerFactory.getLogger(IncidentActivityService.class);
    private static final String CLASSNAME = "IncidentActivityService";

    /** Pattern for @mention extraction. */
    private static final Pattern MENTION_PATTERN = Pattern.compile("@([a-zA-Z0-9._-]+)");

    private final IncidentActivityRepository activityRepository;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private IncidentSseService sseService;

    public IncidentActivityService(IncidentActivityRepository activityRepository,
                                   ObjectMapper objectMapper) {
        this.activityRepository = activityRepository;
        this.objectMapper = objectMapper;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Retrieves the activity feed for an incident with cursor pagination and optional type filter.
     *
     * @param incidentId the incident identifier
     * @param cursor     Base64-encoded cursor (null for first page)
     * @param limit      max items per page
     * @param types      comma-separated activity types to filter (null for all)
     * @param tenantId   the tenant identifier
     * @return paginated activity feed
     */
    public Map<String, Object> getActivity(String incidentId, String cursor, int limit,
                                            String types, Long tenantId) {
        final String ctx = CLASSNAME + ".getActivity";

        try {
            // Fetch activities for this incident
            List<IncidentActivity> allActivities;
            if (types != null && !types.isBlank()) {
                List<String> typeList = Arrays.stream(types.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .toList();
                allActivities = activityRepository.findByIncidentIdAndTypeIn(incidentId, typeList);
                // Sort by createdAt DESC since the repository method doesn't guarantee order
                allActivities = new ArrayList<>(allActivities);
                allActivities.sort((a, b) -> {
                    if (a.getCreatedAt() == null && b.getCreatedAt() == null) return 0;
                    if (a.getCreatedAt() == null) return 1;
                    if (b.getCreatedAt() == null) return -1;
                    return b.getCreatedAt().compareTo(a.getCreatedAt());
                });
            } else {
                allActivities = activityRepository.findByIncidentIdOrderByCreatedAtDesc(incidentId);
            }

            // Filter by tenant
            allActivities = allActivities.stream()
                .filter(a -> tenantId.equals(a.getTenantId()))
                .toList();

            // Apply cursor
            int startIndex = 0;
            if (cursor != null && !cursor.isBlank()) {
                CursorData cursorData = decodeCursor(cursor);
                if (cursorData != null) {
                    for (int i = 0; i < allActivities.size(); i++) {
                        if (allActivities.get(i).getId().equals(cursorData.activityId)) {
                            startIndex = i + 1;
                            break;
                        }
                    }
                }
            }

            // Slice page
            int endIndex = Math.min(startIndex + limit, allActivities.size());
            List<IncidentActivity> page = allActivities.subList(startIndex, endIndex);

            // Build response items
            List<Map<String, Object>> items = new ArrayList<>();
            for (IncidentActivity activity : page) {
                items.add(activityToMap(activity));
            }

            // Build next cursor
            String nextCursor = null;
            if (endIndex < allActivities.size() && !page.isEmpty()) {
                IncidentActivity last = page.get(page.size() - 1);
                nextCursor = encodeCursor(last.getId(), last.getCreatedAt());
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("items", items);
            result.put("cursor", nextCursor);
            return result;

        } catch (Exception e) {
            log.error("{}: failed to get activity for incident {}: {}", ctx, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to get activity: " + e.getMessage(), e);
        }
    }

    /**
     * Adds a note to the incident activity feed.
     *
     * @param incidentId the incident identifier
     * @param content    the note content
     * @param mentions   explicit mentions list (optional, extracted from content if null)
     * @param userId     the user creating the note
     * @param tenantId   the tenant identifier
     * @return the created activity entry
     */
    public Map<String, Object> addNote(String incidentId, String content, List<String> mentions,
                                        String userId, Long tenantId) {
        final String ctx = CLASSNAME + ".addNote";

        try {
            if (content == null || content.isBlank()) {
                throw new IllegalArgumentException("Note content is required");
            }

            // Extract @mentions from content if not provided
            if (mentions == null || mentions.isEmpty()) {
                mentions = extractMentions(content);
            }

            // Create activity entry
            IncidentActivity activity = new IncidentActivity();
            activity.setId(UUID.randomUUID().toString());
            activity.setIncidentId(incidentId);
            activity.setType("note");
            activity.setActorId(userId);
            activity.setContent(content);
            activity.setTenantId(tenantId);

            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("mentions", mentions);
            activity.setMetadata(objectMapper.writeValueAsString(metadata));

            activity = activityRepository.save(activity);

            // Broadcast via SSE
            Map<String, Object> activityMap = activityToMap(activity);
            broadcastActivity(incidentId, activityMap, userId);

            return activityMap;

        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.error("{}: failed to add note for incident {}: {}", ctx, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to add note: " + e.getMessage(), e);
        }
    }

    /**
     * Records an activity entry internally (called by other services).
     *
     * @param incidentId the incident identifier
     * @param type       the activity type (field_change, task_completed, response_action, etc.)
     * @param actorId    the actor who triggered the activity
     * @param content    human-readable description
     * @param metadata   additional metadata map
     * @param tenantId   the tenant identifier
     */
    public void recordActivity(String incidentId, String type, String actorId,
                                String content, Map<String, Object> metadata, Long tenantId) {
        final String ctx = CLASSNAME + ".recordActivity";

        try {
            IncidentActivity activity = new IncidentActivity();
            activity.setId(UUID.randomUUID().toString());
            activity.setIncidentId(incidentId);
            activity.setType(type);
            activity.setActorId(actorId);
            activity.setContent(content);
            activity.setTenantId(tenantId);

            if (metadata != null) {
                activity.setMetadata(objectMapper.writeValueAsString(metadata));
            }

            activityRepository.save(activity);

            // Broadcast via SSE
            Map<String, Object> activityMap = activityToMap(activity);
            broadcastActivity(incidentId, activityMap, actorId);

        } catch (Exception e) {
            log.warn("{}: failed to record activity for incident {}: {}", ctx, incidentId, e.getMessage());
        }
    }

    // =========================================================================
    // Mention extraction
    // =========================================================================

    /**
     * Extracts @mentions from note content.
     */
    private List<String> extractMentions(String content) {
        List<String> mentions = new ArrayList<>();
        Matcher matcher = MENTION_PATTERN.matcher(content);
        while (matcher.find()) {
            String mention = matcher.group(1);
            if (!mentions.contains(mention)) {
                mentions.add(mention);
            }
        }
        return mentions;
    }

    // =========================================================================
    // Cursor pagination
    // =========================================================================

    private static class CursorData {
        final String activityId;
        final String createdAt;

        CursorData(String activityId, String createdAt) {
            this.activityId = activityId;
            this.createdAt = createdAt;
        }
    }

    private String encodeCursor(String activityId, Instant createdAt) {
        try {
            Map<String, String> cursorMap = new LinkedHashMap<>();
            cursorMap.put("activityId", activityId);
            cursorMap.put("createdAt", createdAt != null ? createdAt.toString() : "");
            String json = objectMapper.writeValueAsString(cursorMap);
            return Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8));
        } catch (JsonProcessingException e) {
            log.warn("{}: failed to encode cursor: {}", CLASSNAME, e.getMessage());
            return null;
        }
    }

    private CursorData decodeCursor(String cursor) {
        try {
            byte[] decoded = Base64.getDecoder().decode(cursor);
            String json = new String(decoded, StandardCharsets.UTF_8);
            Map<String, String> cursorMap = objectMapper.readValue(json, new TypeReference<>() {});
            return new CursorData(cursorMap.get("activityId"), cursorMap.get("createdAt"));
        } catch (Exception e) {
            log.warn("{}: failed to decode cursor: {}", CLASSNAME, e.getMessage());
            return null;
        }
    }

    // =========================================================================
    // Actor enrichment (stub)
    // =========================================================================

    /**
     * Resolves an actor ID to display information.
     * Stub — full integration with user service to be done later.
     */
    private Map<String, Object> resolveActor(String actorId) {
        Map<String, Object> actor = new LinkedHashMap<>();
        actor.put("id", actorId);
        // Stub: generate display name from actor ID
        if (actorId != null && actorId.contains(".")) {
            String[] parts = actorId.split("\\.");
            String displayName = Arrays.stream(parts)
                .map(p -> p.substring(0, 1).toUpperCase() + p.substring(1))
                .reduce((a, b) -> a + " " + b)
                .orElse(actorId);
            actor.put("displayName", displayName);
        } else {
            actor.put("displayName", actorId != null ? actorId : "System");
        }
        actor.put("avatar", null);
        return actor;
    }

    // =========================================================================
    // SSE broadcast
    // =========================================================================

    private void broadcastActivity(String incidentId, Map<String, Object> activityData, String actorId) {
        if (sseService == null) return;
        try {
            Map<String, Object> eventData = new LinkedHashMap<>();
            eventData.put("type", "activity.created");
            eventData.put("timestamp", Instant.now().toString());
            eventData.put("data", activityData);
            eventData.put("actor", actorId);
            sseService.broadcast(incidentId, "activity.created", eventData, actorId);
        } catch (Exception e) {
            log.warn("{}: failed to broadcast SSE for activity: {}", CLASSNAME, e.getMessage());
        }
    }

    // =========================================================================
    // Mapping helpers
    // =========================================================================

    /**
     * Converts an IncidentActivity entity to a response map with actor enrichment.
     */
    private Map<String, Object> activityToMap(IncidentActivity activity) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", activity.getId());
        map.put("type", activity.getType());
        map.put("actor", resolveActor(activity.getActorId()));
        map.put("timestamp", activity.getCreatedAt() != null ? activity.getCreatedAt().toString() : null);
        map.put("content", activity.getContent());

        // Parse metadata JSON
        if (activity.getMetadata() != null && !activity.getMetadata().isBlank()) {
            try {
                Map<String, Object> metadata = objectMapper.readValue(
                    activity.getMetadata(), new TypeReference<>() {});
                map.put("metadata", metadata);
            } catch (Exception e) {
                map.put("metadata", null);
            }
        } else {
            map.put("metadata", null);
        }

        return map;
    }
}
