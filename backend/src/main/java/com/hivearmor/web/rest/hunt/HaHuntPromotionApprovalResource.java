package com.hivearmor.web.rest.hunt;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.hunt.HuntPromotionApprovalService;
import com.hivearmor.service.hunt.HuntPromotionService;
import com.hivearmor.service.hunt.HuntQueryException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * HNT-007 SOC Manager approval workflow for gated hunt promotions.
 */
@RestController
@RequestMapping("/api")
public class HaHuntPromotionApprovalResource {

    private static final Logger log = LoggerFactory.getLogger(HaHuntPromotionApprovalResource.class);

    private static final String ANALYST_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') "
            + "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private static final String MANAGER_AUTH =
        "hasAuthority('ROLE_SOC_MANAGER') or hasAuthority('ROLE_ADMIN')";

    private static final Set<String> VALID_ACTIONS = Set.of(
        "create_evidence", "create_investigation", "escalate_incident"
    );

    private final HuntPromotionApprovalService approvalService;
    private final HuntPromotionService promotionService;

    public HaHuntPromotionApprovalResource(
        HuntPromotionApprovalService approvalService,
        HuntPromotionService promotionService
    ) {
        this.approvalService = approvalService;
        this.promotionService = promotionService;
    }

    @PostMapping("/ha-hunts/approvals")
    @PreAuthorize(ANALYST_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> requestApproval(@RequestBody Map<String, Object> body) {
        try {
            String action = (String) body.get("action");
            if (action == null || !VALID_ACTIONS.contains(action)) {
                return badRequest("INVALID_ACTION", "Field 'action' must be a valid hunt promotion action");
            }
            String searchId = asNonBlankString(body.get("searchId"));
            if (searchId == null) {
                return badRequest("MISSING_SEARCH_ID", "Field 'searchId' is required");
            }
            List<String> eventIds = (List<String>) body.get("eventIds");
            if (eventIds == null || eventIds.isEmpty()) {
                return badRequest("EMPTY_EVENT_IDS", "Field 'eventIds' must not be empty");
            }
            String rationale = asNonBlankString(body.get("rationale"));
            if (rationale == null) {
                return badRequest("MISSING_RATIONALE", "Field 'rationale' is required");
            }
            String previewToken = asNonBlankString(body.get("previewToken"));
            if (previewToken == null) {
                return badRequest("MISSING_PREVIEW_TOKEN", "Field 'previewToken' is required");
            }

            // Bind request to a valid preview for the same action/events/search.
            promotionService.validatePreviewToken(previewToken, action, eventIds, searchId);

            String owner = currentOwner();
            Map<String, Object> created = approvalService.requestApproval(
                action, eventIds, searchId, owner, currentTenantKey(), rationale
            );
            return ResponseEntity.ok(created);
        } catch (HuntQueryException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            log.warn("hunt approval request validation: {}", e.getMessage());
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } catch (Exception e) {
            log.error("hunt approval request failed: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @GetMapping("/ha-hunts/approvals")
    @PreAuthorize(MANAGER_AUTH)
    public ResponseEntity<List<Map<String, Object>>> listApprovals(
        @RequestParam(value = "state", required = false) String state
    ) {
        try {
            return ResponseEntity.ok(approvalService.list(currentTenantKey(), state));
        } finally {
            TenantContext.clear();
        }
    }

    @GetMapping("/ha-hunts/approvals/{approvalId}")
    @PreAuthorize(ANALYST_AUTH)
    public ResponseEntity<?> getApproval(@PathVariable String approvalId) {
        try {
            return ResponseEntity.ok(approvalService.get(approvalId, currentTenantKey()));
        } catch (IllegalArgumentException e) {
            return badRequest("VALIDATION_ERROR", e.getMessage());
        } finally {
            TenantContext.clear();
        }
    }

    @PostMapping("/ha-hunts/approvals/{approvalId}/decision")
    @PreAuthorize(MANAGER_AUTH)
    public ResponseEntity<Map<String, Object>> decide(
        @PathVariable String approvalId,
        @RequestBody Map<String, Object> body
    ) {
        try {
            String decision = asNonBlankString(body.get("decision"));
            String rationale = asNonBlankString(body.get("rationale"));
            Map<String, Object> result = approvalService.decide(
                approvalId, decision, rationale, currentOwner(), currentTenantKey()
            );
            return ResponseEntity.ok(result);
        } catch (AccessDeniedException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            log.warn("hunt approval decision validation: {}", e.getMessage());
            return badRequest("VALIDATION_ERROR", e.getMessage());
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

    private static String asNonBlankString(Object value) {
        if (!(value instanceof String text) || text.isBlank()) {
            return null;
        }
        return text.trim();
    }

    private ResponseEntity<Map<String, Object>> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("error", errorCode);
        error.put("message", message);
        return ResponseEntity.badRequest().body(error);
    }
}
