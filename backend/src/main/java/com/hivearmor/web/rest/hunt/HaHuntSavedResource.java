package com.hivearmor.web.rest.hunt;

import com.hivearmor.domain.HuntHistory;
import com.hivearmor.domain.SavedHunt;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.hunt.HuntHistoryService;
import com.hivearmor.service.hunt.SavedHuntService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * REST controller for saved hunts CRUD and query history (HNT-005).
 *
 * <p>Endpoints:
 * <ul>
 *   <li>{@code GET /api/ha-hunts/saved} — list saved hunts</li>
 *   <li>{@code POST /api/ha-hunts/saved} — create a saved hunt</li>
 *   <li>{@code PATCH /api/ha-hunts/saved/{huntId}} — update a saved hunt</li>
 *   <li>{@code DELETE /api/ha-hunts/saved/{huntId}} — delete a saved hunt</li>
 *   <li>{@code GET /api/ha-hunts/history} — list query history</li>
 *   <li>{@code DELETE /api/ha-hunts/history} — clear query history</li>
 * </ul>
 *
 * <p>Security: accessible only to ROLE_SOC_ANALYST, ROLE_SOC_MANAGER, ROLE_ANALYST, ROLE_ADMIN.
 */
@RestController
@RequestMapping("/api")
public class HaHuntSavedResource {

    private static final Logger log = LoggerFactory.getLogger(HaHuntSavedResource.class);
    private static final String CLASSNAME = "HaHuntSavedResource";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') " +
        "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private final SavedHuntService savedHuntService;
    private final HuntHistoryService huntHistoryService;

    public HaHuntSavedResource(SavedHuntService savedHuntService,
                               HuntHistoryService huntHistoryService) {
        this.savedHuntService = savedHuntService;
        this.huntHistoryService = huntHistoryService;
    }

    // =========================================================================
    // GET /ha-hunts/saved — List saved hunts
    // =========================================================================

    /**
     * Lists saved hunts visible to the current user (owned + shared).
     * Supports optional search and tag filters.
     *
     * @param search optional name search filter
     * @param tags   optional tag filter (comma-separated)
     * @return 200 OK with { items, total }
     */
    @GetMapping("/ha-hunts/saved")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Map<String, Object>> listSavedHunts(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String tags) {
        try {
            String userId = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            List<SavedHunt> hunts = savedHuntService.list(tenantId, userId, search, tags);

            List<Map<String, Object>> items = hunts.stream()
                .map(this::toSavedHuntMap)
                .toList();

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("items", items);
            response.put("total", items.size());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("{}.listSavedHunts: {}", CLASSNAME, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // POST /ha-hunts/saved — Create a saved hunt
    // =========================================================================

    /**
     * Creates a new saved hunt. Requires name and query in the body.
     *
     * @param body the request body containing hunt data
     * @return 201 Created with the created hunt
     */
    @PostMapping("/ha-hunts/saved")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> createSavedHunt(
            @RequestBody Map<String, Object> body) {
        try {
            // Validate required fields
            String name = (String) body.get("name");
            String query = (String) body.get("query");

            if (name == null || name.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "INVALID_PARAMETER",
                    "message", "Field 'name' is required"));
            }
            if (query == null || query.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "INVALID_PARAMETER",
                    "message", "Field 'query' is required"));
            }

            String userId = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            String description = (String) body.get("description");
            String filters = body.get("filters") != null ? body.get("filters").toString() : null;
            String tags = body.get("tags") != null ? tagsToString(body.get("tags")) : null;
            boolean shared = Boolean.TRUE.equals(body.get("shared"));

            SavedHunt created = savedHuntService.create(
                name, description, query, filters, tags, shared, userId, tenantId);

            return ResponseEntity.status(HttpStatus.CREATED).body(toSavedHuntMap(created));
        } catch (Exception e) {
            log.error("{}.createSavedHunt: {}", CLASSNAME, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // PATCH /ha-hunts/saved/{huntId} — Update a saved hunt
    // =========================================================================

    /**
     * Partially updates an existing saved hunt. Only owner or SOC Manager can update.
     *
     * @param huntId the hunt ID to update
     * @param body   partial update fields
     * @return 200 OK with the updated hunt
     */
    @PatchMapping("/ha-hunts/saved/{huntId}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Map<String, Object>> updateSavedHunt(
            @PathVariable String huntId,
            @RequestBody Map<String, Object> body) {
        try {
            String userId = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            // Normalize tags if present
            if (body.containsKey("tags")) {
                body.put("tags", tagsToString(body.get("tags")));
            }

            SavedHunt updated = savedHuntService.update(huntId, body, userId, tenantId);
            return ResponseEntity.ok(toSavedHuntMap(updated));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "error", "FORBIDDEN",
                "message", e.getMessage()));
        } catch (Exception e) {
            log.error("{}.updateSavedHunt: {}", CLASSNAME, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // DELETE /ha-hunts/saved/{huntId} — Delete a saved hunt
    // =========================================================================

    /**
     * Deletes a saved hunt. Only owner or SOC Manager can delete.
     *
     * @param huntId the hunt ID to delete
     * @return 204 No Content
     */
    @DeleteMapping("/ha-hunts/saved/{huntId}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Void> deleteSavedHunt(@PathVariable String huntId) {
        try {
            String userId = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            savedHuntService.delete(huntId, userId, tenantId);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        } catch (Exception e) {
            log.error("{}.deleteSavedHunt: {}", CLASSNAME, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // GET /ha-hunts/history — List query history
    // =========================================================================

    /**
     * Lists query execution history for the current user.
     * Supports optional date range filtering.
     *
     * @param from optional start date (ISO-8601)
     * @param to   optional end date (ISO-8601)
     * @return 200 OK with { items, total }
     */
    @GetMapping("/ha-hunts/history")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Map<String, Object>> listHistory(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        try {
            String userId = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            Instant fromInstant = from != null ? Instant.parse(from) : null;
            Instant toInstant = to != null ? Instant.parse(to) : null;

            List<HuntHistory> entries = huntHistoryService.list(userId, tenantId, fromInstant, toInstant);

            List<Map<String, Object>> items = entries.stream()
                .map(this::toHistoryMap)
                .toList();

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("items", items);
            response.put("total", items.size());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("{}.listHistory: {}", CLASSNAME, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // DELETE /ha-hunts/history — Clear query history
    // =========================================================================

    /**
     * Clears query history for the current user. Optionally clears only
     * entries before a given date.
     *
     * @param before optional cutoff date (ISO-8601) — only entries before this are deleted
     * @return 200 OK with { deleted: count }
     */
    @DeleteMapping("/ha-hunts/history")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Map<String, Object>> clearHistory(
            @RequestParam(required = false) String before) {
        try {
            String userId = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            Long tenantId = TenantContext.getClientId() != null ? TenantContext.getClientId() : 0L;

            Instant beforeInstant = before != null ? Instant.parse(before) : null;

            long deleted = huntHistoryService.clear(userId, tenantId, beforeInstant);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("deleted", deleted);

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("{}.clearHistory: {}", CLASSNAME, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    /**
     * Converts a SavedHunt entity to a response map.
     */
    private Map<String, Object> toSavedHuntMap(SavedHunt hunt) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", hunt.getId());
        map.put("name", hunt.getName());
        map.put("description", hunt.getDescription());
        map.put("query", hunt.getQuery());
        map.put("filters", hunt.getFilters());
        map.put("schedule", hunt.getSchedule());
        map.put("tags", hunt.getTags() != null ? Arrays.asList(hunt.getTags().split(",")) : List.of());
        map.put("createdBy", hunt.getCreatedBy());
        map.put("createdAt", hunt.getCreatedAt() != null ? hunt.getCreatedAt().toString() : null);
        map.put("updatedAt", hunt.getUpdatedAt() != null ? hunt.getUpdatedAt().toString() : null);
        map.put("lastRunAt", hunt.getLastRunAt() != null ? hunt.getLastRunAt().toString() : null);
        map.put("runCount", hunt.getRunCount());
        map.put("shared", hunt.getShared());
        return map;
    }

    /**
     * Converts a HuntHistory entity to a response map.
     */
    private Map<String, Object> toHistoryMap(HuntHistory entry) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", entry.getId());
        map.put("query", entry.getQuery());
        map.put("filters", entry.getFilters());
        map.put("executedAt", entry.getExecutedAt() != null ? entry.getExecutedAt().toString() : null);
        map.put("duration", entry.getDuration());
        map.put("resultCount", entry.getResultCount());
        map.put("status", entry.getStatus());
        map.put("savedHuntId", entry.getSavedHuntId());
        return map;
    }

    /**
     * Converts a tags value (could be a list or string) to a comma-separated string.
     */
    @SuppressWarnings("unchecked")
    private String tagsToString(Object tags) {
        if (tags instanceof List) {
            return String.join(",", (List<String>) tags);
        } else if (tags instanceof String) {
            return (String) tags;
        }
        return null;
    }
}
