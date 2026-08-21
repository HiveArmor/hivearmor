package com.hivearmor.web.rest.hunt;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.hunt.HuntPromotionService;
import com.hivearmor.service.hunt.HuntQueryException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * REST controller for promotion actions from hunt search results.
 *
 * <p><strong>HNT-007:</strong> Evidence, investigation, and incident promotion from search.
 */
@RestController
@RequestMapping("/api")
public class HaHuntActionsResource {

    private static final Logger log = LoggerFactory.getLogger(HaHuntActionsResource.class);
    private static final String CLASSNAME = "HaHuntActionsResource";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') "
        + "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private static final Set<String> VALID_ACTIONS = Set.of(
        "create_evidence", "create_investigation", "escalate_incident"
    );

    private final HuntPromotionService promotionService;

    public HaHuntActionsResource(HuntPromotionService promotionService) {
        this.promotionService = promotionService;
    }

    @PostMapping("/ha-hunts/actions/preview")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> previewPromotion(
            @RequestBody Map<String, Object> requestBody) {
        final String ctx = CLASSNAME + ".previewPromotion";
        try {
            String action = (String) requestBody.get("action");
            if (action == null || !VALID_ACTIONS.contains(action)) {
                return badRequest("INVALID_ACTION",
                    "Field 'action' must be one of: create_evidence, create_investigation, escalate_incident");
            }

            List<String> eventIds = readEventIds(requestBody.get("eventIds"));
            if (eventIds == null) {
                return badRequest("INVALID_EVENT_IDS", "Field 'eventIds' must be an array of strings");
            }
            if (eventIds.isEmpty()) {
                return badRequest("EMPTY_EVENT_IDS", "Field 'eventIds' must not be empty");
            }
            if (eventIds.size() > 100) {
                return badRequest("TOO_MANY_EVENTS", "Maximum 100 events can be promoted at once");
            }

            String searchId = readSearchId(requestBody.get("searchId"));
            if (searchId == null) {
                return badRequest("MISSING_SEARCH_ID", "Field 'searchId' is required");
            }

            log.debug("{}: action={}, eventCount={}, searchId={}", ctx, action, eventIds.size(), searchId);
            Map<String, Object> preview = promotionService.preview(
                action, eventIds, searchId, currentOwner(), currentTenantKey());
            return ResponseEntity.ok(preview);

        } catch (HuntQueryException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            log.warn("{}: validation error: {}", ctx, e.getMessage());
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-hunts/actions")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> executePromotion(
            @RequestBody Map<String, Object> requestBody) {
        final String ctx = CLASSNAME + ".executePromotion";
        try {
            String action = (String) requestBody.get("action");
            if (action == null || !VALID_ACTIONS.contains(action)) {
                return badRequest("INVALID_ACTION",
                    "Field 'action' must be one of: create_evidence, create_investigation, escalate_incident");
            }

            List<String> eventIds = readEventIds(requestBody.get("eventIds"));
            if (eventIds == null) {
                return badRequest("INVALID_EVENT_IDS", "Field 'eventIds' must be an array of strings");
            }
            if (eventIds.isEmpty()) {
                return badRequest("EMPTY_EVENT_IDS", "Field 'eventIds' must not be empty");
            }

            String previewToken = (String) requestBody.get("previewToken");
            if (previewToken == null || previewToken.isBlank()) {
                return badRequest("MISSING_PREVIEW_TOKEN", "Field 'previewToken' is required");
            }

            String title = (String) requestBody.get("title");
            if (title == null || title.isBlank()) {
                return badRequest("MISSING_TITLE", "Field 'title' is required");
            }

            String description = (String) requestBody.get("description");
            if (description == null) {
                description = "";
            }

            String searchId = readSearchId(requestBody.get("searchId"));
            if (searchId == null) {
                return badRequest("MISSING_SEARCH_ID", "Field 'searchId' is required");
            }

            Map<String, Object> parameters = (Map<String, Object>) requestBody.get("parameters");
            String userId = currentOwner();
            String tenantId = TenantContext.get() != null ? TenantContext.get() : "default";

            log.debug("{}: action={}, eventCount={}, userId={}, searchId={}", ctx, action, eventIds.size(), userId, searchId);
            Map<String, Object> result = promotionService.execute(
                action, eventIds, title, description, parameters,
                previewToken, userId, tenantId, searchId, userId, currentTenantKey());
            return ResponseEntity.ok(result);

        } catch (HuntQueryException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            log.warn("{}: validation error: {}", ctx, e.getMessage());
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    private String currentOwner() {
        return SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new HuntQueryException("HUNT_PRINCIPAL_REQUIRED", "Authenticated principal is required", 0));
    }

    private String currentTenantKey() {
        String prefix = TenantContext.getClientPrefix();
        return prefix == null || prefix.isBlank() ? "authorized" : prefix;
    }

    @SuppressWarnings("unchecked")
    private List<String> readEventIds(Object eventIdsObj) {
        if (eventIdsObj == null) {
            return List.of();
        }
        if (!(eventIdsObj instanceof List)) {
            return null;
        }
        return (List<String>) eventIdsObj;
    }

    private String readSearchId(Object value) {
        if (!(value instanceof String searchId) || searchId.isBlank()) {
            return null;
        }
        return searchId;
    }

    private ResponseEntity<Map<String, Object>> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("error", errorCode);
        error.put("message", message);
        return ResponseEntity.badRequest().body(error);
    }
}
