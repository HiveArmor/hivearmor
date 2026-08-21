package com.hivearmor.web.rest.hunt;

import com.hivearmor.domain.HaAlertView;
import com.hivearmor.repository.HaAlertViewRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * REST controller for saved alert view CRUD operations.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>GET    /api/ha-alert-views?scope=me  — user's views + shared views
 *   <li>POST   /api/ha-alert-views           — create a new saved view (201)
 *   <li>PATCH  /api/ha-alert-views/{id}      — partial update, increment version
 *   <li>DELETE /api/ha-alert-views/{id}      — delete; built-in IDs 1–10 return 400
 *   <li>POST   /api/ha-alert-views/{id}/set-default — mark as default
 * </ul>
 *
 * <p>All endpoints require {@code ROLE_ANALYST}, {@code ROLE_SOC_MANAGER}, or {@code ROLE_ADMIN} authority.
 *
 * <p>IDs 1–10 are reserved for built-in system views and cannot be deleted
 * or have their filter_ast modified.
 */
@RestController
@RequestMapping("/api")
public class HaAlertViewResource {

    private static final Logger log = LoggerFactory.getLogger(HaAlertViewResource.class);
    private static final String ENTITY_NAME = "haAlertView";
    private static final long BUILTIN_VIEW_MAX_ID = 10L;

    private static final String ALERT_VIEW_AUTH =
        "hasAuthority('" + AuthoritiesConstants.ANALYST + "') or hasAuthority('" +
        AuthoritiesConstants.SOC_MANAGER + "') or hasAuthority('" +
        AuthoritiesConstants.ADMIN + "')";

    private final HaAlertViewRepository alertViewRepository;
    private final UserRepository userRepository;

    public HaAlertViewResource(HaAlertViewRepository alertViewRepository,
                               UserRepository userRepository) {
        this.alertViewRepository = alertViewRepository;
        this.userRepository = userRepository;
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-alert-views?scope=me
    // -------------------------------------------------------------------------

    /**
     * Returns all views owned by the authenticated user plus shared views.
     */
    @GetMapping("/ha-alert-views")
    @PreAuthorize(ALERT_VIEW_AUTH)
    public ResponseEntity<List<HaAlertView>> getAlertViews(
            @RequestParam(name = "scope", defaultValue = "me") String scope) {

        Long userId = resolveCurrentUserId();
        List<HaAlertView> views = alertViewRepository.findAccessibleByOwnerId(userId);
        log.debug("GET /api/ha-alert-views?scope={} — user={} returned {} views", scope, userId, views.size());
        return ResponseEntity.ok(views);
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-alert-views
    // -------------------------------------------------------------------------

    /**
     * Creates a new saved view owned by the authenticated user.
     */
    @PostMapping("/ha-alert-views")
    @PreAuthorize(ALERT_VIEW_AUTH)
    public ResponseEntity<HaAlertView> createAlertView(@RequestBody HaAlertView view) throws URISyntaxException {
        if (view.getId() != null) {
            throw new BadRequestAlertException("A new alert view cannot already have an ID", ENTITY_NAME, "idexists");
        }
        if (view.getName() == null || view.getName().isBlank()) {
            throw new BadRequestAlertException("View name is required", ENTITY_NAME, "nameblank");
        }
        if (view.getFilterAst() == null || view.getFilterAst().isBlank()) {
            throw new BadRequestAlertException("filter_ast is required", ENTITY_NAME, "filterastblank");
        }

        Long userId = resolveCurrentUserId();
        view.setOwnerId(userId);
        view.setVersion(1);
        view.setCreatedAt(Instant.now());
        view.setUpdatedAt(Instant.now());

        HaAlertView saved = alertViewRepository.save(view);
        log.debug("POST /api/ha-alert-views — created id={} for user={}", saved.getId(), userId);

        return ResponseEntity
                .created(new URI("/api/ha-alert-views/" + saved.getId()))
                .body(saved);
    }

    // -------------------------------------------------------------------------
    // PATCH /api/ha-alert-views/{id}
    // -------------------------------------------------------------------------

    /**
     * Partial update of a saved view. Increments version and sets updated_at.
     * Returns 403 if the view is not owned by the requesting user and is not shared.
     * Protected built-in views (IDs 1–10) cannot have their filter_ast modified.
     */
    @PatchMapping("/ha-alert-views/{id}")
    @PreAuthorize(ALERT_VIEW_AUTH)
    @Transactional
    public ResponseEntity<HaAlertView> partialUpdateAlertView(
            @PathVariable Long id,
            @RequestBody Map<String, Object> updates) {

        HaAlertView existing = alertViewRepository.findById(id).orElse(null);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        Long userId = resolveCurrentUserId();

        // Only the owner or users viewing a shared view can update
        if (!userId.equals(existing.getOwnerId()) && !Boolean.TRUE.equals(existing.getIsShared())) {
            return ResponseEntity.status(403).build();
        }

        boolean isBuiltin = existing.getId() != null && existing.getId() <= BUILTIN_VIEW_MAX_ID;

        // Apply partial updates
        if (updates.containsKey("name")) {
            existing.setName((String) updates.get("name"));
        }
        if (updates.containsKey("filter_ast") || updates.containsKey("filterAst")) {
            if (isBuiltin) {
                throw new BadRequestAlertException(
                        "Built-in view filter cannot be modified", ENTITY_NAME, "BUILTIN_VIEW_IMMUTABLE");
            }
            String filterAst = updates.containsKey("filter_ast")
                    ? (String) updates.get("filter_ast")
                    : (String) updates.get("filterAst");
            existing.setFilterAst(filterAst);
        }
        if (updates.containsKey("sort")) {
            existing.setSort((String) updates.get("sort"));
        }
        if (updates.containsKey("visible_columns") || updates.containsKey("visibleColumns")) {
            String vc = updates.containsKey("visible_columns")
                    ? (String) updates.get("visible_columns")
                    : (String) updates.get("visibleColumns");
            existing.setVisibleColumns(vc);
        }
        if (updates.containsKey("density")) {
            existing.setDensity((String) updates.get("density"));
        }
        if (updates.containsKey("is_shared") || updates.containsKey("isShared")) {
            Object val = updates.containsKey("is_shared") ? updates.get("is_shared") : updates.get("isShared");
            existing.setIsShared(val instanceof Boolean ? (Boolean) val : Boolean.parseBoolean(val.toString()));
        }

        // Increment version and update timestamp
        existing.setVersion(existing.getVersion() + 1);
        existing.setUpdatedAt(Instant.now());

        HaAlertView saved = alertViewRepository.save(existing);
        log.debug("PATCH /api/ha-alert-views/{} — updated by user={}, new version={}", id, userId, saved.getVersion());
        return ResponseEntity.ok(saved);
    }

    // -------------------------------------------------------------------------
    // DELETE /api/ha-alert-views/{id}
    // -------------------------------------------------------------------------

    /**
     * Deletes a saved view. Returns 400 BUILTIN_VIEW_IMMUTABLE for IDs 1–10.
     * Returns 403 if the requesting user is not the owner.
     */
    @DeleteMapping("/ha-alert-views/{id}")
    @PreAuthorize(ALERT_VIEW_AUTH)
    public ResponseEntity<Void> deleteAlertView(@PathVariable Long id) {
        // Protect built-in views (IDs 1–10)
        if (id <= BUILTIN_VIEW_MAX_ID) {
            throw new BadRequestAlertException(
                    "Built-in views cannot be deleted", ENTITY_NAME, "BUILTIN_VIEW_IMMUTABLE");
        }

        HaAlertView existing = alertViewRepository.findById(id).orElse(null);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        Long userId = resolveCurrentUserId();
        if (!userId.equals(existing.getOwnerId())) {
            return ResponseEntity.status(403).build();
        }

        alertViewRepository.deleteById(id);
        log.debug("DELETE /api/ha-alert-views/{} — deleted by user={}", id, userId);
        return ResponseEntity.noContent().build();
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-alert-views/{id}/set-default
    // -------------------------------------------------------------------------

    /**
     * Sets the specified view as the user's default (is_default=true) and clears
     * is_default for all other views owned by the same user.
     */
    @PostMapping("/ha-alert-views/{id}/set-default")
    @PreAuthorize(ALERT_VIEW_AUTH)
    @Transactional
    public ResponseEntity<HaAlertView> setDefaultView(@PathVariable Long id) {
        HaAlertView existing = alertViewRepository.findById(id).orElse(null);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        Long userId = resolveCurrentUserId();

        // Clear default for all views owned by this user
        alertViewRepository.clearDefaultForOwner(userId);

        // Set this view as default
        existing.setIsDefault(true);
        existing.setUpdatedAt(Instant.now());
        HaAlertView saved = alertViewRepository.save(existing);

        log.debug("POST /api/ha-alert-views/{}/set-default — user={}", id, userId);
        return ResponseEntity.ok(saved);
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    /**
     * Resolves the current authenticated user's database ID from their login.
     */
    private Long resolveCurrentUserId() {
        String login = SecurityUtils.getCurrentUserLogin()
                .orElseThrow(() -> new BadRequestAlertException("Not authenticated", ENTITY_NAME, "notauthenticated"));
        return userRepository.findOneByLogin(login)
                .orElseThrow(() -> new BadRequestAlertException("User not found", ENTITY_NAME, "usernotfound"))
                .getId();
    }
}
