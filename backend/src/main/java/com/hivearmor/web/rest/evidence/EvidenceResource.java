package com.hivearmor.web.rest.evidence;

import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.dto.EvidenceBoardDTO;
import com.hivearmor.service.dto.EvidenceItemDTO;
import com.hivearmor.service.dto.EvidencePlacementDTO;
import com.hivearmor.service.dto.EvidenceRelationshipDTO;
import com.hivearmor.service.evidence.EvidenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * REST controller for the investigation evidence board.
 * All endpoints are scoped under /api/ha-incidents/{incidentId}/.
 * S-4A
 */
@RestController
@RequestMapping("/api/ha-incidents/{incidentId}")
@RequiredArgsConstructor
@Slf4j
public class EvidenceResource {

    private final EvidenceService evidenceService;

    // ── Evidence items ──────────────────────────────────────────────────────

    /**
     * POST /api/ha-incidents/{incidentId}/evidence-items
     * Create a new evidence item.
     */
    @PostMapping("/evidence-items")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')")
    public ResponseEntity<EvidenceItemDTO> addItem(
            @PathVariable Long incidentId,
            @RequestBody EvidenceItemDTO dto) {
        String currentUser = SecurityUtils.getCurrentUserLogin().orElse("system");
        EvidenceItemDTO created = evidenceService.addItem(incidentId, dto, currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * GET /api/ha-incidents/{incidentId}/evidence-items
     * List all evidence items for an incident.
     */
    @GetMapping("/evidence-items")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    public ResponseEntity<List<EvidenceItemDTO>> listItems(@PathVariable Long incidentId) {
        return ResponseEntity.ok(evidenceService.listItems(incidentId));
    }

    /**
     * PUT /api/ha-incidents/{incidentId}/evidence-items/{itemId}
     * Update an evidence item.
     */
    @PutMapping("/evidence-items/{itemId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')")
    public ResponseEntity<EvidenceItemDTO> updateItem(
            @PathVariable Long incidentId,
            @PathVariable Long itemId,
            @RequestBody EvidenceItemDTO dto) {
        return ResponseEntity.ok(evidenceService.updateItem(itemId, dto));
    }

    /**
     * DELETE /api/ha-incidents/{incidentId}/evidence-items/{itemId}
     * Delete an evidence item (placements are cascade-deleted by DB FK).
     */
    @DeleteMapping("/evidence-items/{itemId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')")
    public ResponseEntity<Void> deleteItem(
            @PathVariable Long incidentId,
            @PathVariable Long itemId) {
        evidenceService.deleteItem(itemId);
        return ResponseEntity.noContent().build();
    }

    // ── Boards ──────────────────────────────────────────────────────────────

    /**
     * GET /api/ha-incidents/{incidentId}/evidence-boards/main
     * Get (or lazily create) the main board for an incident, including all placements.
     */
    @GetMapping("/evidence-boards/main")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    public ResponseEntity<EvidenceBoardDTO> getMainBoard(@PathVariable Long incidentId) {
        return ResponseEntity.ok(evidenceService.getOrCreateMainBoard(incidentId));
    }

    /**
     * GET /api/ha-incidents/{incidentId}/evidence-boards/{boardId}/placements
     * List all placements for a specific board.
     */
    @GetMapping("/evidence-boards/{boardId}/placements")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    public ResponseEntity<EvidenceBoardDTO> getBoardPlacements(
            @PathVariable Long incidentId,
            @PathVariable Long boardId) {
        return ResponseEntity.ok(evidenceService.getBoard(incidentId, boardId));
    }

    /**
     * PUT /api/ha-incidents/{incidentId}/evidence-boards/{boardId}/placements
     * Batch-save all placements for a board.
     * Request body: { "placements": [...], "version": N }
     * Returns 200 with new version on success, 409 on version conflict.
     */
    @PutMapping("/evidence-boards/{boardId}/placements")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')")
    public ResponseEntity<Map<String, Integer>> savePlacements(
            @PathVariable Long incidentId,
            @PathVariable Long boardId,
            @RequestBody PlacementSaveRequest request) {
        try {
            int newVersion = evidenceService.savePlacements(boardId, request.placements(), request.version());
            return ResponseEntity.ok(Map.of("version", newVersion));
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode() == HttpStatus.CONFLICT) {
                return ResponseEntity.status(HttpStatus.CONFLICT).build();
            }
            throw ex;
        }
    }

    // ── Relationships ───────────────────────────────────────────────────────

    /**
     * GET /api/ha-incidents/{incidentId}/evidence-relationships
     * List all evidence relationships for an incident.
     */
    @GetMapping("/evidence-relationships")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    public ResponseEntity<List<EvidenceRelationshipDTO>> listRelationships(@PathVariable Long incidentId) {
        return ResponseEntity.ok(evidenceService.listRelationships(incidentId));
    }

    /**
     * POST /api/ha-incidents/{incidentId}/evidence-relationships
     * Create a new relationship between two evidence items.
     */
    @PostMapping("/evidence-relationships")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')")
    public ResponseEntity<EvidenceRelationshipDTO> addRelationship(
            @PathVariable Long incidentId,
            @RequestBody EvidenceRelationshipDTO dto) {
        String currentUser = SecurityUtils.getCurrentUserLogin().orElse("system");
        EvidenceRelationshipDTO created = evidenceService.addRelationship(incidentId, dto, currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * DELETE /api/ha-incidents/{incidentId}/evidence-relationships/{relId}
     * Delete a relationship.
     */
    @DeleteMapping("/evidence-relationships/{relId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')")
    public ResponseEntity<Void> deleteRelationship(
            @PathVariable Long incidentId,
            @PathVariable Long relId) {
        evidenceService.deleteRelationship(relId);
        return ResponseEntity.noContent().build();
    }

    // ── Inner request record ─────────────────────────────────────────────────

    /**
     * Request body for the batch-save placements endpoint.
     */
    public record PlacementSaveRequest(
            List<EvidencePlacementDTO> placements,
            int version
    ) {}
}
