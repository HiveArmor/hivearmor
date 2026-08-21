package com.hivearmor.web.rest;

import com.hivearmor.domain.HaSavedHunt;
import com.hivearmor.repository.HaSavedHuntRepository;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.dto.SavedHuntDTO;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

/**
 * REST controller for saved hunt CRUD operations.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>GET    /api/ha-saved-hunts        — own hunts + shared hunts
 *   <li>POST   /api/ha-saved-hunts        — create a new saved hunt
 *   <li>PUT    /api/ha-saved-hunts/{id}   — update an existing saved hunt (owner or ADMIN)
 *   <li>DELETE /api/ha-saved-hunts/{id}   — delete; non-owner non-ADMIN receives 404 (Requirement 5.6)
 * </ul>
 *
 * <p>All endpoints are protected by
 * {@code @PreAuthorize("hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')")}.
 *
 * <p>Entity↔DTO mapping is performed inline — no service layer is introduced for this
 * thin CRUD surface.  User input is never string-concatenated into queries; all repository
 * access goes through parameterised JPQL methods (SEC-05 compliance).
 */
@RestController
@RequestMapping("/api")
public class HaSavedHuntResource {

    private static final Logger log = LoggerFactory.getLogger(HaSavedHuntResource.class);
    private static final String ENTITY_NAME = "haSavedHunt";

    private final HaSavedHuntRepository savedHuntRepository;

    public HaSavedHuntResource(HaSavedHuntRepository savedHuntRepository) {
        this.savedHuntRepository = savedHuntRepository;
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-saved-hunts
    // -------------------------------------------------------------------------

    /**
     * Returns the caller's own saved hunts plus every hunt whose {@code is_shared} flag
     * is {@code true}.  Implements Requirement 5.5.
     *
     * @return 200 OK with a JSON array of {@link SavedHuntDTO}
     */
    @GetMapping("/ha-saved-hunts")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ANALYST + "') or hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<List<SavedHuntDTO>> getAllSavedHunts() {
        String currentLogin = SecurityUtils.getCurrentUserLogin()
                .orElseThrow(() -> new BadRequestAlertException("Not authenticated", ENTITY_NAME, "notauthenticated"));

        List<HaSavedHunt> hunts = savedHuntRepository.findAccessibleByLogin(currentLogin);
        List<SavedHuntDTO> result = hunts.stream()
                .map(HaSavedHuntResource::toDto)
                .collect(Collectors.toList());

        log.debug("GET /api/ha-saved-hunts — user={} returned {} hunts", currentLogin, result.size());
        return ResponseEntity.ok(result);
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-saved-hunts
    // -------------------------------------------------------------------------

    /**
     * Creates a new saved hunt.  Sets {@code createdBy} to the current user login and
     * {@code createdAt} to {@link Instant#now()}.  Implements Requirement 5.3.
     *
     * @param dto the saved hunt data supplied by the caller (id must be null)
     * @return 201 Created with the persisted {@link SavedHuntDTO}
     */
    @PostMapping("/ha-saved-hunts")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ANALYST + "') or hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<SavedHuntDTO> createSavedHunt(@Valid @RequestBody SavedHuntDTO dto) throws URISyntaxException {
        if (dto.getId() != null) {
            throw new BadRequestAlertException("A new saved hunt cannot already have an ID", ENTITY_NAME, "idexists");
        }

        String currentLogin = SecurityUtils.getCurrentUserLogin()
                .orElseThrow(() -> new BadRequestAlertException("Not authenticated", ENTITY_NAME, "notauthenticated"));

        HaSavedHunt entity = toEntity(dto);
        entity.setCreatedBy(currentLogin);
        entity.setCreatedAt(Instant.now());
        if (entity.getIsShared() == null) {
            entity.setIsShared(false);
        }

        HaSavedHunt saved = savedHuntRepository.save(entity);
        log.debug("POST /api/ha-saved-hunts — created id={} for user={}", saved.getId(), currentLogin);

        return ResponseEntity
                .created(new URI("/api/ha-saved-hunts/" + saved.getId()))
                .body(toDto(saved));
    }

    // -------------------------------------------------------------------------
    // PUT /api/ha-saved-hunts/{id}
    // -------------------------------------------------------------------------

    /**
     * Updates an existing saved hunt.  Only the owner or an ADMIN may update.
     * Non-owners that are not ADMIN receive 403.  Implements Requirement 5.3.
     *
     * @param id             the hunt id from the path
     * @param dto            the updated hunt data
     * @param authentication the Spring Security authentication object (injected)
     * @return 200 OK with the updated {@link SavedHuntDTO}, 404 if not found, 403 if unauthorised
     */
    @PutMapping("/ha-saved-hunts/{id}")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ANALYST + "') or hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<SavedHuntDTO> updateSavedHunt(
            @PathVariable Long id,
            @Valid @RequestBody SavedHuntDTO dto,
            Authentication authentication
    ) {
        HaSavedHunt existing = savedHuntRepository.findById(id).orElse(null);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        String currentLogin = SecurityUtils.getCurrentUserLogin().orElse("");
        boolean isAdmin = authentication != null &&
                authentication.getAuthorities().contains(new SimpleGrantedAuthority(AuthoritiesConstants.ADMIN));

        if (!isAdmin && !currentLogin.equals(existing.getCreatedBy())) {
            return ResponseEntity.status(403).build();
        }

        // Apply incoming fields but preserve immutable ownership metadata.
        existing.setHuntName(dto.getHuntName());
        existing.setQueryDsl(dto.getQueryDsl());
        existing.setNlQuery(dto.getNlQuery());
        existing.setFilterJson(dto.getFilterJson());
        existing.setIsShared(dto.getIsShared() != null ? dto.getIsShared() : existing.getIsShared());
        existing.setLastUsedAt(dto.getLastUsedAt());
        // createdBy and createdAt are intentionally NOT overwritten.

        HaSavedHunt saved = savedHuntRepository.save(existing);
        log.debug("PUT /api/ha-saved-hunts/{} — updated by user={}", id, currentLogin);
        return ResponseEntity.ok(toDto(saved));
    }

    // -------------------------------------------------------------------------
    // DELETE /api/ha-saved-hunts/{id}
    // -------------------------------------------------------------------------

    /**
     * Deletes a saved hunt.  Per Requirement 5.6, a non-owner caller that does not hold
     * the {@code ROLE_ADMIN} authority receives HTTP 404 (not 403) — this prevents
     * information leakage about hunts the caller does not own.
     *
     * @param id             the hunt id from the path
     * @param authentication the Spring Security authentication object (injected)
     * @return 204 No Content on success, 404 if not found or caller is unauthorised
     */
    @DeleteMapping("/ha-saved-hunts/{id}")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ANALYST + "') or hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<Void> deleteSavedHunt(
            @PathVariable Long id,
            Authentication authentication
    ) {
        HaSavedHunt existing = savedHuntRepository.findById(id).orElse(null);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        String currentLogin = SecurityUtils.getCurrentUserLogin().orElse("");
        boolean isAdmin = authentication != null &&
                authentication.getAuthorities().contains(new SimpleGrantedAuthority(AuthoritiesConstants.ADMIN));

        // Requirement 5.6: non-owner non-ADMIN → 404 (not 403).
        if (!isAdmin && !currentLogin.equals(existing.getCreatedBy())) {
            return ResponseEntity.notFound().build();
        }

        savedHuntRepository.deleteById(id);
        log.debug("DELETE /api/ha-saved-hunts/{} — deleted by user={}", id, currentLogin);
        return ResponseEntity.noContent().build();
    }

    // -------------------------------------------------------------------------
    // Mapping helpers
    // -------------------------------------------------------------------------

    /**
     * Maps a {@link HaSavedHunt} entity to a {@link SavedHuntDTO}.
     *
     * @param entity the source entity
     * @return the populated DTO
     */
    private static SavedHuntDTO toDto(HaSavedHunt entity) {
        return new SavedHuntDTO(
                entity.getId(),
                entity.getHuntName(),
                entity.getQueryDsl(),
                entity.getNlQuery(),
                entity.getFilterJson(),
                entity.getCreatedBy(),
                entity.getCreatedAt(),
                entity.getIsShared(),
                entity.getLastUsedAt()
        );
    }

    /**
     * Maps a {@link SavedHuntDTO} to a new {@link HaSavedHunt} entity.
     * The {@code id} field is copied as-is; callers are responsible for setting or
     * clearing it before persistence.
     *
     * @param dto the source DTO
     * @return a new entity populated from the DTO
     */
    private static HaSavedHunt toEntity(SavedHuntDTO dto) {
        HaSavedHunt entity = new HaSavedHunt();
        entity.setId(dto.getId());
        entity.setHuntName(dto.getHuntName());
        entity.setQueryDsl(dto.getQueryDsl());
        entity.setNlQuery(dto.getNlQuery());
        entity.setFilterJson(dto.getFilterJson());
        entity.setCreatedBy(dto.getCreatedBy());
        entity.setCreatedAt(dto.getCreatedAt());
        entity.setIsShared(dto.getIsShared());
        entity.setLastUsedAt(dto.getLastUsedAt());
        return entity;
    }
}
