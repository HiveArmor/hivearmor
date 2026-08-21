package com.hivearmor.web.rest;

import com.hivearmor.domain.HiveIncidentEntity;
import com.hivearmor.repository.HiveIncidentEntityRepository;
import com.hivearmor.web.rest.validation.ValidEntityType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.time.Instant;
import java.util.List;

/**
 * REST controller — attach/remove entities from an incident (INV-04 investigation panel).
 *
 * POST   /api/ha-incidents/{incidentId}/entities
 * GET    /api/ha-incidents/{incidentId}/entities
 * DELETE /api/ha-incidents/{incidentId}/entities/{entityId}
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")
public class HaIncidentEntitiesResource {

    private static final Logger log = LoggerFactory.getLogger(HaIncidentEntitiesResource.class);

    private final HiveIncidentEntityRepository repo;

    public HaIncidentEntitiesResource(HiveIncidentEntityRepository repo) {
        this.repo = repo;
    }

    /** Request body for adding an entity to an incident */
    @Schema(description = "Request body for attaching an entity to an incident")
    public record AddEntityRequest(
        @Schema(description = "Entity identifier to attach", example = "ip:10.0.1.45", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank @Size(max = 150) String entityId,

        @Schema(description = "Entity type: user, host, ip, process, file, domain", example = "ip", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank @Size(max = 20) @ValidEntityType String entityType
    ) {}

    /** Response shape */
    @Schema(description = "View of an entity attached to an incident")
    public record IncidentEntityView(
        @Schema(description = "Unique link identifier", example = "1")
        Long   id,

        @Schema(description = "Parent incident identifier", example = "101")
        Long   incidentId,

        @Schema(description = "Entity identifier", example = "ip:10.0.1.45")
        String entityId,

        @Schema(description = "Entity type: user, host, ip, process, file, domain", example = "ip")
        String entityType,

        @Schema(description = "Username of the analyst who attached this entity", example = "analyst1")
        String addedBy,

        @Schema(description = "ISO 8601 timestamp when the entity was attached", example = "2026-08-20T10:15:00Z")
        String addedAt
    ) {}

    /**
     * POST /api/ha-incidents/{incidentId}/entities
     * Returns 201 Created with the new link, or 409 Conflict if already attached.
     */
    @PostMapping("/ha-incidents/{incidentId}/entities")
    public ResponseEntity<IncidentEntityView> addEntity(
            @PathVariable("incidentId") @NotNull Long incidentId,
            @Valid @RequestBody AddEntityRequest body,
            Authentication auth) {
        log.debug("POST /api/ha-incidents/{}/entities {}", incidentId, body.entityId());

        if (repo.existsByIncidentIdAndEntityId(incidentId, body.entityId())) {
            return ResponseEntity.status(409).build();
        }

        HiveIncidentEntity entity = new HiveIncidentEntity();
        entity.setIncidentId(incidentId);
        entity.setEntityId(body.entityId());
        entity.setEntityType(body.entityType());
        entity.setAddedBy(auth != null ? auth.getName() : "system");
        entity.setAddedAt(Instant.now());

        HiveIncidentEntity saved = repo.save(entity);

        IncidentEntityView view = toView(saved);
        return ResponseEntity
            .created(URI.create("/api/ha-incidents/" + incidentId + "/entities/" + saved.getId()))
            .body(view);
    }

    /**
     * GET /api/ha-incidents/{incidentId}/entities
     */
    @GetMapping("/ha-incidents/{incidentId}/entities")
    public ResponseEntity<List<IncidentEntityView>> listEntities(
            @PathVariable("incidentId") @NotNull Long incidentId) {
        log.debug("GET /api/ha-incidents/{}/entities", incidentId);
        List<IncidentEntityView> list = repo.findAllByIncidentId(incidentId)
            .stream().map(this::toView).toList();
        return ResponseEntity.ok(list);
    }

    /**
     * DELETE /api/ha-incidents/{incidentId}/entities/{entityId}
     */
    @DeleteMapping("/ha-incidents/{incidentId}/entities/{entityId}")
    public ResponseEntity<Void> removeEntity(
            @PathVariable("incidentId") @NotNull Long incidentId,
            @PathVariable("entityId")   String entityId) {
        log.debug("DELETE /api/ha-incidents/{}/entities/{}", incidentId, entityId);
        var opt = repo.findByIncidentIdAndEntityId(incidentId, entityId);
        if (opt.isPresent()) {
            repo.delete(opt.get());
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }

    private IncidentEntityView toView(HiveIncidentEntity e) {
        return new IncidentEntityView(
            e.getId(),
            e.getIncidentId(),
            e.getEntityId(),
            e.getEntityType(),
            e.getAddedBy(),
            e.getAddedAt() != null ? e.getAddedAt().toString() : null
        );
    }
}
