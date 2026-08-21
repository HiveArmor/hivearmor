package com.hivearmor.service.hunt;

import com.hivearmor.domain.SavedHunt;
import com.hivearmor.repository.SavedHuntRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for saved hunt CRUD operations.
 *
 * <p>Provides list, create, update, delete, and incrementRunCount operations
 * for saved hunts stored in PostgreSQL. Enforces ownership and role-based
 * access control (owner or ROLE_SOC_MANAGER required for update/delete).
 *
 * <p>Backs GET/POST/PATCH/DELETE /api/ha-hunts/saved
 */
@Service
public class SavedHuntService {

    private static final Logger log = LoggerFactory.getLogger(SavedHuntService.class);
    private static final String CLASSNAME = "SavedHuntService";

    private final SavedHuntRepository savedHuntRepository;

    public SavedHuntService(SavedHuntRepository savedHuntRepository) {
        this.savedHuntRepository = savedHuntRepository;
    }

    /**
     * Lists saved hunts visible to the user: owned hunts + shared hunts for the tenant.
     * Applies optional search (name contains) and tag filters.
     * Results ordered by updatedAt DESC.
     *
     * @param tenantId the tenant ID for scoping
     * @param userId   the current user login
     * @param search   optional name search term
     * @param tags     optional comma-separated tag filter
     * @return list of matching saved hunts ordered by updatedAt DESC
     */
    @Transactional(readOnly = true)
    public List<SavedHunt> list(Long tenantId, String userId, String search, String tags) {
        final String ctx = CLASSNAME + ".list";
        log.debug("{}: tenantId={}, userId={}, search={}, tags={}", ctx, tenantId, userId, search, tags);

        List<SavedHunt> hunts;

        if (search != null && !search.isBlank()) {
            // Filter by name containing search term within tenant
            hunts = savedHuntRepository.findByTenantIdAndNameContaining(tenantId, search);
        } else if (tags != null && !tags.isBlank()) {
            // Filter by tags containing the provided tag
            hunts = savedHuntRepository.findByTenantIdAndTagsContaining(tenantId, tags);
        } else {
            // Return all visible hunts: shared hunts in the tenant + owned hunts
            hunts = savedHuntRepository.findByTenantIdAndSharedTrueOrCreatedBy(tenantId, userId);
        }

        // Filter to only include shared hunts or hunts owned by the user
        hunts = hunts.stream()
            .filter(h -> Boolean.TRUE.equals(h.getShared()) || userId.equals(h.getCreatedBy()))
            .sorted(Comparator.comparing(SavedHunt::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .collect(Collectors.toList());

        return hunts;
    }

    /**
     * Creates a new saved hunt.
     *
     * @param name        hunt name (required)
     * @param description optional description
     * @param query       hunt query (required)
     * @param filters     optional JSON filters
     * @param tags        optional comma-separated tags
     * @param shared      whether the hunt is visible to all tenant users
     * @param userId      the creating user
     * @param tenantId    the tenant ID
     * @return the created SavedHunt entity
     */
    @Transactional
    public SavedHunt create(String name, String description, String query,
                            String filters, String tags, boolean shared,
                            String userId, Long tenantId) {
        final String ctx = CLASSNAME + ".create";
        log.debug("{}: name='{}', userId={}, tenantId={}", ctx, name, userId, tenantId);

        SavedHunt hunt = new SavedHunt();
        hunt.setId(UUID.randomUUID().toString());
        hunt.setName(name);
        hunt.setDescription(description);
        hunt.setQuery(query);
        hunt.setFilters(filters);
        hunt.setTags(tags);
        hunt.setShared(shared);
        hunt.setCreatedBy(userId);
        hunt.setTenantId(tenantId);
        hunt.setCreatedAt(Instant.now());
        hunt.setUpdatedAt(Instant.now());
        hunt.setRunCount(0);

        return savedHuntRepository.save(hunt);
    }

    /**
     * Updates an existing saved hunt. Only the owner or a user with ROLE_SOC_MANAGER
     * can update.
     *
     * @param huntId        the hunt ID to update
     * @param partialUpdate map of field names to new values
     * @param userId        the current user login
     * @param tenantId      the tenant ID
     * @return the updated SavedHunt entity
     * @throws IllegalArgumentException if hunt not found
     * @throws SecurityException if user is not authorized to update
     */
    @Transactional
    public SavedHunt update(String huntId, Map<String, Object> partialUpdate,
                            String userId, Long tenantId) {
        final String ctx = CLASSNAME + ".update";
        log.debug("{}: huntId={}, userId={}", ctx, huntId, userId);

        SavedHunt hunt = savedHuntRepository.findById(huntId)
            .orElseThrow(() -> new IllegalArgumentException("Saved hunt not found: " + huntId));

        // Verify ownership or ROLE_SOC_MANAGER
        if (!hunt.getCreatedBy().equals(userId) && !hasRole("ROLE_SOC_MANAGER")) {
            throw new SecurityException("Only the owner or SOC Manager can update this hunt");
        }

        // Apply partial update
        if (partialUpdate.containsKey("name")) {
            hunt.setName((String) partialUpdate.get("name"));
        }
        if (partialUpdate.containsKey("description")) {
            hunt.setDescription((String) partialUpdate.get("description"));
        }
        if (partialUpdate.containsKey("query")) {
            hunt.setQuery((String) partialUpdate.get("query"));
        }
        if (partialUpdate.containsKey("filters")) {
            hunt.setFilters((String) partialUpdate.get("filters"));
        }
        if (partialUpdate.containsKey("tags")) {
            hunt.setTags((String) partialUpdate.get("tags"));
        }
        if (partialUpdate.containsKey("shared")) {
            hunt.setShared((Boolean) partialUpdate.get("shared"));
        }

        hunt.setUpdatedAt(Instant.now());
        return savedHuntRepository.save(hunt);
    }

    /**
     * Deletes a saved hunt. Only the owner or a user with ROLE_SOC_MANAGER can delete.
     *
     * @param huntId   the hunt ID to delete
     * @param userId   the current user login
     * @param tenantId the tenant ID
     * @throws IllegalArgumentException if hunt not found
     * @throws SecurityException if user is not authorized to delete
     */
    @Transactional
    public void delete(String huntId, String userId, Long tenantId) {
        final String ctx = CLASSNAME + ".delete";
        log.debug("{}: huntId={}, userId={}", ctx, huntId, userId);

        SavedHunt hunt = savedHuntRepository.findById(huntId)
            .orElseThrow(() -> new IllegalArgumentException("Saved hunt not found: " + huntId));

        // Verify ownership or ROLE_SOC_MANAGER
        if (!hunt.getCreatedBy().equals(userId) && !hasRole("ROLE_SOC_MANAGER")) {
            throw new SecurityException("Only the owner or SOC Manager can delete this hunt");
        }

        savedHuntRepository.delete(hunt);
    }

    /**
     * Increments the run count and updates lastRunAt for a saved hunt.
     * Called when a saved hunt is executed via search.
     *
     * @param huntId the hunt ID to increment
     */
    @Transactional
    public void incrementRunCount(String huntId) {
        final String ctx = CLASSNAME + ".incrementRunCount";
        log.debug("{}: huntId={}", ctx, huntId);

        savedHuntRepository.findById(huntId).ifPresent(hunt -> {
            hunt.setRunCount(hunt.getRunCount() + 1);
            hunt.setLastRunAt(Instant.now());
            hunt.setUpdatedAt(Instant.now());
            savedHuntRepository.save(hunt);
        });
    }

    /**
     * Checks if the current user has the specified role.
     */
    private boolean hasRole(String role) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return false;
        }
        return auth.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .anyMatch(a -> a.equals(role));
    }
}
