package com.hivearmor.web.rest.session;

import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.dto.InvestigationSessionDTO;
import com.hivearmor.service.dto.SessionItemDTO;
import com.hivearmor.service.dto.SessionTaskDTO;
import com.hivearmor.service.session.InvestigationSessionService;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Map;

/**
 * REST controller for investigation sessions.
 * <p>
 * POST   /api/ha-investigation-sessions              → 201
 * GET    /api/ha-investigation-sessions              → 200 + X-Total-Count
 * GET    /api/ha-investigation-sessions/{id}         → 200
 * PUT    /api/ha-investigation-sessions/{id}         → 200
 * DELETE /api/ha-investigation-sessions/{id}         → 204
 * POST   /api/ha-investigation-sessions/{id}/items   → 201
 * GET    /api/ha-investigation-sessions/{id}/items   → 200
 * DELETE /api/ha-investigation-sessions/{id}/items/{itemId} → 204
 * GET    /api/ha-investigation-sessions/{id}/tasks   → 200
 * POST   /api/ha-investigation-sessions/{id}/tasks   → 201
 * PUT    /api/ha-investigation-sessions/{id}/tasks/{taskId} → 200
 * DELETE /api/ha-investigation-sessions/{id}/tasks/{taskId} → 204
 * POST   /api/ha-investigation-sessions/{id}/convert-to-incident → 200 {incidentId}
 * S-5C
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Investigations", description = "Investigation management, timeline, SSE (INV-001)")
public class InvestigationSessionResource {

    private static final String ENTITY_NAME = "investigationSession";

    private final InvestigationSessionService sessionService;

    // ── Sessions ──────────────────────────────────────────────────────────────

    /**
     * POST /api/ha-investigation-sessions — create a new investigation session.
     */
    @PostMapping("/ha-investigation-sessions")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    @Operation(
        summary = "Create investigation session",
        description = "Creates a new investigation session for the current user. The session can be used to collect "
            + "evidence items and track investigation progress. (INV-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Session created successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid request body"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<InvestigationSessionDTO> createSession(
            @Valid @RequestBody InvestigationSessionDTO dto
    ) throws URISyntaxException {
        String currentUser = getCurrentUser();
        InvestigationSessionDTO created = sessionService.createSession(dto, currentUser);
        log.debug("REST: created investigation session id={} for user={}", created.id(), currentUser);
        return ResponseEntity
                .created(new URI("/api/ha-investigation-sessions/" + created.id()))
                .body(created);
    }

    /**
     * GET /api/ha-investigation-sessions — list sessions.
     * ADMIN/SOC_MANAGER see all; ANALYST/USER see own only.
     */
    @GetMapping("/ha-investigation-sessions")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    @Operation(
        summary = "List investigation sessions",
        description = "Returns a paginated list of investigation sessions. Admins and SOC managers see all sessions; "
            + "analysts and users see only their own. Includes X-Total-Count header. (INV-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Session list with X-Total-Count header"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<List<InvestigationSessionDTO>> listSessions(
            Pageable pageable,
            Authentication authentication
    ) {
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");

        Pageable boundedPageable = PageRequest.of(
            pageable.getPageNumber(),
            Math.min(Math.max(pageable.getPageSize(), 1), 100),
            pageable.getSort()
        );
        Page<InvestigationSessionDTO> page = sessionService.listSessions(currentUser, isAdminOrManager, boundedPageable);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Total-Count", String.valueOf(page.getTotalElements()));
        headers.set("Access-Control-Expose-Headers", "X-Total-Count");

        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * GET /api/ha-investigation-sessions/{id} — get a single session.
     */
    @GetMapping("/ha-investigation-sessions/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    @Operation(
        summary = "Get investigation session by ID",
        description = "Returns a single investigation session including its metadata and item count. (INV-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Session details"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Session not found")
    })
    public ResponseEntity<InvestigationSessionDTO> getSession(@PathVariable Long id, Authentication authentication) {
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        return ResponseEntity.ok(sessionService.getSession(id, currentUser, isAdminOrManager));
    }

    /**
     * PUT /api/ha-investigation-sessions/{id} — update a session.
     * Owner or ADMIN; others get 403.
     */
    @PutMapping("/ha-investigation-sessions/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    @Operation(
        summary = "Update investigation session",
        description = "Updates an existing investigation session. Only the session owner or an admin can update. (INV-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Session updated successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid request body"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Not session owner or admin"),
        @ApiResponse(responseCode = "404", description = "Session not found"),
        @ApiResponse(responseCode = "409", description = "Optimistic version conflict"),
        @ApiResponse(responseCode = "428", description = "Expected version is required")
    })
    public ResponseEntity<InvestigationSessionDTO> updateSession(
            @PathVariable Long id,
            @Valid @RequestBody InvestigationSessionDTO dto,
            Authentication authentication
    ) {
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        InvestigationSessionDTO updated = sessionService.updateSessionAuthorized(id, dto, currentUser, isAdminOrManager);
        return ResponseEntity.ok(updated);
    }

    /**
     * DELETE /api/ha-investigation-sessions/{id} — delete a session.
     * Owner or ADMIN; others get 403.
     */
    @DeleteMapping("/ha-investigation-sessions/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    @Operation(
        summary = "Delete investigation session",
        description = "Deletes an investigation session and all its pinned items. Only the session owner or an admin can delete. (INV-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Session deleted"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Not session owner or admin"),
        @ApiResponse(responseCode = "404", description = "Session not found")
    })
    public ResponseEntity<Void> deleteSession(
            @PathVariable Long id,
            Authentication authentication
    ) {
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        sessionService.deleteSession(id, currentUser, isAdminOrManager);
        return ResponseEntity.noContent().build();
    }

    // ── Session items ─────────────────────────────────────────────────────────

    /**
     * POST /api/ha-investigation-sessions/{id}/items — pin an item to a session.
     */
    @PostMapping("/ha-investigation-sessions/{id}/items")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    @Operation(
        summary = "Pin item to investigation session",
        description = "Pins an evidence item (log event, alert, entity, etc.) to an investigation session for tracking. (INV-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Item pinned successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid request or missing itemType"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Session not found")
    })
    public ResponseEntity<SessionItemDTO> pinItem(
            @PathVariable Long id,
            @Valid @RequestBody SessionItemDTO dto,
            Authentication authentication
    ) throws URISyntaxException {
        if (dto.itemType() == null || dto.itemType().isBlank()) {
            throw new BadRequestAlertException("itemType is required", "sessionItem", "itemtypemissing");
        }
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        SessionItemDTO pinned = sessionService.pinItem(id, dto, currentUser, isAdminOrManager);
        return ResponseEntity
                .created(new URI("/api/ha-investigation-sessions/" + id + "/items/" + pinned.id()))
                .body(pinned);
    }

    /**
     * GET /api/ha-investigation-sessions/{id}/items — list all pinned items.
     * Optional query param ?type=LOG_EVENT|ALERT|... for filtering.
     */
    @GetMapping("/ha-investigation-sessions/{id}/items")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    @Operation(
        summary = "List pinned items in session",
        description = "Returns all items pinned to an investigation session. Optionally filter by item type "
            + "(LOG_EVENT, ALERT, ENTITY, etc.). (INV-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "List of pinned items"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Session not found")
    })
    public ResponseEntity<List<SessionItemDTO>> listItems(
            @PathVariable Long id,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            Authentication authentication
    ) {
        if (page < 0 || size < 1 || size > 200) {
            throw new BadRequestAlertException("page must be >= 0 and size must be between 1 and 200",
                "sessionItem", "invalidpagination");
        }
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        Page<SessionItemDTO> itemPage = (type != null && !type.isBlank())
                ? sessionService.listItemsByType(id, type, currentUser, isAdminOrManager, PageRequest.of(page, size))
                : sessionService.listItems(id, currentUser, isAdminOrManager, PageRequest.of(page, size));
        HttpHeaders responseHeaders = new HttpHeaders();
        responseHeaders.set("X-Total-Count", String.valueOf(itemPage.getTotalElements()));
        responseHeaders.set("Access-Control-Expose-Headers", "X-Total-Count");
        return ResponseEntity.ok().headers(responseHeaders).body(itemPage.getContent());
    }

    /**
     * DELETE /api/ha-investigation-sessions/{id}/items/{itemId} — unpin an item.
     * Owner of the item or ADMIN; others get 403.
     */
    @DeleteMapping("/ha-investigation-sessions/{id}/items/{itemId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    @Operation(
        summary = "Unpin item from investigation session",
        description = "Removes a pinned item from an investigation session. Only the item owner or an admin can unpin. (INV-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Item unpinned"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Not item owner or admin"),
        @ApiResponse(responseCode = "404", description = "Session or item not found")
    })
    public ResponseEntity<Void> unpinItem(
            @PathVariable Long id,
            @PathVariable Long itemId,
            Authentication authentication
    ) {
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        sessionService.unpinItem(id, itemId, currentUser, isAdminOrManager);
        return ResponseEntity.noContent().build();
    }

    // ── Session case tasks (P1 STAGING CANDIDATE) ─────────────────────────────

    /**
     * GET /api/ha-investigation-sessions/{id}/tasks — list case tasks.
     */
    @GetMapping("/ha-investigation-sessions/{id}/tasks")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    @Operation(
        summary = "List session case tasks",
        description = "Returns case tasks for an investigation session. Tenant and ownership checks match session access. (STAGING CANDIDATE)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Task list"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Session not found")
    })
    public ResponseEntity<List<SessionTaskDTO>> listTasks(
            @PathVariable Long id,
            Authentication authentication
    ) {
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        return ResponseEntity.ok(sessionService.listTasks(id, currentUser, isAdminOrManager));
    }

    /**
     * POST /api/ha-investigation-sessions/{id}/tasks — create a case task.
     */
    @PostMapping("/ha-investigation-sessions/{id}/tasks")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    @Operation(
        summary = "Create session case task",
        description = "Creates a case task on an investigation session. Optional externalTicketUrl links an external tracker. (STAGING CANDIDATE)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Task created"),
        @ApiResponse(responseCode = "400", description = "Invalid request body"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Session not found")
    })
    public ResponseEntity<SessionTaskDTO> createTask(
            @PathVariable Long id,
            @Valid @RequestBody SessionTaskDTO dto,
            Authentication authentication
    ) throws URISyntaxException {
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        SessionTaskDTO created = sessionService.createTask(id, dto, currentUser, isAdminOrManager);
        return ResponseEntity
                .created(new URI("/api/ha-investigation-sessions/" + id + "/tasks/" + created.id()))
                .body(created);
    }

    /**
     * PUT /api/ha-investigation-sessions/{id}/tasks/{taskId} — update a case task.
     */
    @PutMapping("/ha-investigation-sessions/{id}/tasks/{taskId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    @Operation(
        summary = "Update session case task",
        description = "Updates title, status, assignee, or external ticket URL for a session case task. (STAGING CANDIDATE)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Task updated"),
        @ApiResponse(responseCode = "400", description = "Invalid request body"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Session or task not found")
    })
    public ResponseEntity<SessionTaskDTO> updateTask(
            @PathVariable Long id,
            @PathVariable Long taskId,
            @Valid @RequestBody SessionTaskDTO dto,
            Authentication authentication
    ) {
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        return ResponseEntity.ok(sessionService.updateTask(id, taskId, dto, currentUser, isAdminOrManager));
    }

    /**
     * DELETE /api/ha-investigation-sessions/{id}/tasks/{taskId} — delete a case task.
     */
    @DeleteMapping("/ha-investigation-sessions/{id}/tasks/{taskId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    @Operation(
        summary = "Delete session case task",
        description = "Deletes a case task from an investigation session. (STAGING CANDIDATE)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Task deleted"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Session or task not found")
    })
    public ResponseEntity<Void> deleteTask(
            @PathVariable Long id,
            @PathVariable Long taskId,
            Authentication authentication
    ) {
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        sessionService.deleteTask(id, taskId, currentUser, isAdminOrManager);
        return ResponseEntity.noContent().build();
    }

    // ── Convert to incident ───────────────────────────────────────────────────

    /**
     * POST /api/ha-investigation-sessions/{id}/convert-to-incident
     * Creates a formal UtmIncident from the session.
     * Returns: { "incidentId": 123 }
     */
    @PostMapping("/ha-investigation-sessions/{id}/convert-to-incident")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')")
    @Operation(
        summary = "Convert session to incident",
        description = "Promotes an investigation session to a formal incident. Creates a new UtmIncident "
            + "with the session name and description, marks the session as CONVERTED. (INV-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Incident created, returns incidentId"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Session not found"),
        @ApiResponse(responseCode = "409", description = "Session already converted")
    })
    @Deprecated(since = "2026-08-13", forRemoval = true)
    public ResponseEntity<Map<String, Long>> convertToIncident(@PathVariable Long id, Authentication authentication) {
        String currentUser = getCurrentUser();
        boolean isAdminOrManager = hasAnyRole(authentication, "ROLE_ADMIN", "ROLE_SOC_MANAGER");
        Long incidentId = sessionService.convertToIncident(id, currentUser, isAdminOrManager);
        log.info("REST: converted session id={} to incident id={} by user={}", id, incidentId, currentUser);
        return ResponseEntity.ok()
            .header("Deprecation", "true")
            .header("Sunset", "Sat, 13 Feb 2027 00:00:00 GMT")
            .header("Link", "</api/ha-investigation-sessions/" + id + "/promotion-preview>; rel=\"successor-version\"")
            .body(Map.of("incidentId", incidentId));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String getCurrentUser() {
        return SecurityUtils.getCurrentUserLogin()
                .orElseThrow(() -> new BadRequestAlertException("Not authenticated", ENTITY_NAME, "notauthenticated"));
    }

    private boolean hasAnyRole(Authentication authentication, String... roles) {
        if (authentication == null) return false;
        for (String role : roles) {
            if (authentication.getAuthorities().contains(new SimpleGrantedAuthority(role))) {
                return true;
            }
        }
        return false;
    }
}
