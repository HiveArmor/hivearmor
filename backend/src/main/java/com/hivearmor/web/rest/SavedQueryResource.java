package com.hivearmor.web.rest;

import com.hivearmor.domain.UtmSavedQuery;
import com.hivearmor.repository.UtmSavedQueryRepository;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.List;

/**
 * REST controller for backend-persisted saved queries.
 * <p>
 * GET    /api/ha-saved-queries          — own queries + shared
 * POST   /api/ha-saved-queries          — create (ANALYST+ only, READ_ONLY blocked)
 * PUT    /api/ha-saved-queries/{id}     — update (owner or ADMIN)
 * DELETE /api/ha-saved-queries/{id}     — delete (owner or ADMIN)
 * S-5B
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class SavedQueryResource {

    private static final String ENTITY_NAME = "savedQuery";

    private final UtmSavedQueryRepository savedQueryRepository;

    /**
     * GET /api/ha-saved-queries — returns own queries plus is_shared=true queries from all users.
     */
    @GetMapping("/ha-saved-queries")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    public ResponseEntity<List<UtmSavedQuery>> getAllSavedQueries() {
        String currentLogin = SecurityUtils.getCurrentUserLogin()
                .orElseThrow(() -> new BadRequestAlertException("Not authenticated", ENTITY_NAME, "notauthenticated"));

        List<UtmSavedQuery> queries = savedQueryRepository
                .findByUserLoginOrIsSharedTrueOrderByCreatedAtDesc(currentLogin);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Total-Count", String.valueOf(queries.size()));
        headers.set("Access-Control-Expose-Headers", "X-Total-Count");

        return ResponseEntity.ok().headers(headers).body(queries);
    }

    /**
     * POST /api/ha-saved-queries — create a new saved query.
     * READ_ONLY is excluded from the PreAuthorize — they get 403.
     */
    @PostMapping("/ha-saved-queries")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    public ResponseEntity<UtmSavedQuery> createSavedQuery(
            @Valid @RequestBody UtmSavedQuery query
    ) throws URISyntaxException {
        if (query.getId() != null) {
            throw new BadRequestAlertException("A new saved query cannot already have an ID", ENTITY_NAME, "idexists");
        }

        String currentLogin = SecurityUtils.getCurrentUserLogin()
                .orElseThrow(() -> new BadRequestAlertException("Not authenticated", ENTITY_NAME, "notauthenticated"));

        query.setUserLogin(currentLogin);
        if (query.getIsShared() == null) {
            query.setIsShared(false);
        }
        query.setCreatedAt(Instant.now());
        query.setUpdatedAt(Instant.now());

        UtmSavedQuery saved = savedQueryRepository.save(query);
        log.debug("Created saved query id={} for user={}", saved.getId(), currentLogin);

        return ResponseEntity
                .created(new URI("/api/ha-saved-queries/" + saved.getId()))
                .body(saved);
    }

    /**
     * PUT /api/ha-saved-queries/{id} — update an existing saved query.
     * Only the owner or an ADMIN may update.
     */
    @PutMapping("/ha-saved-queries/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    public ResponseEntity<UtmSavedQuery> updateSavedQuery(
            @PathVariable Long id,
            @Valid @RequestBody UtmSavedQuery query,
            Authentication authentication
    ) {
        UtmSavedQuery existing = savedQueryRepository.findById(id)
                .orElse(null);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        String currentLogin = SecurityUtils.getCurrentUserLogin().orElse("");
        boolean isAdmin = authentication != null &&
                authentication.getAuthorities().contains(new SimpleGrantedAuthority("ROLE_ADMIN"));

        if (!isAdmin && !currentLogin.equals(existing.getUserLogin())) {
            return ResponseEntity.status(403).build();
        }

        // Preserve ownership — owner_login cannot be changed
        query.setId(id);
        query.setUserLogin(existing.getUserLogin());
        query.setCreatedAt(existing.getCreatedAt());
        query.setUpdatedAt(Instant.now());

        UtmSavedQuery saved = savedQueryRepository.save(query);
        log.debug("Updated saved query id={} by user={}", id, currentLogin);
        return ResponseEntity.ok(saved);
    }

    /**
     * DELETE /api/ha-saved-queries/{id} — delete a saved query.
     * Only the owner or an ADMIN may delete.
     */
    @DeleteMapping("/ha-saved-queries/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER')")
    public ResponseEntity<Void> deleteSavedQuery(
            @PathVariable Long id,
            Authentication authentication
    ) {
        UtmSavedQuery existing = savedQueryRepository.findById(id)
                .orElse(null);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        String currentLogin = SecurityUtils.getCurrentUserLogin().orElse("");
        boolean isAdmin = authentication != null &&
                authentication.getAuthorities().contains(new SimpleGrantedAuthority("ROLE_ADMIN"));

        if (!isAdmin && !currentLogin.equals(existing.getUserLogin())) {
            return ResponseEntity.status(403).build();
        }

        savedQueryRepository.deleteById(id);
        log.debug("Deleted saved query id={} by user={}", id, currentLogin);
        return ResponseEntity.noContent().build();
    }
}
