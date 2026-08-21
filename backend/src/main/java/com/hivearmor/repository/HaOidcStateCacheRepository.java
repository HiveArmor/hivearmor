package com.hivearmor.repository;

import com.hivearmor.domain.HaOidcStateCache;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for the {@link HaOidcStateCache} entity.
 *
 * Provides standard CRUD operations via {@link JpaRepository} plus two derived
 * queries used by {@code HaOidcService} during the PKCE callback flow and
 * periodic state-cache cleanup.
 */
@Repository
public interface HaOidcStateCacheRepository extends JpaRepository<HaOidcStateCache, Long> {

    /**
     * Looks up a PKCE state cache entry by its random state value.
     *
     * Called during {@code GET /api/ha-oidc/callback} to retrieve the
     * {@code code_verifier} and {@code redirect_uri} that were stored when the
     * flow was initiated. Returns empty when the state is unknown or has already
     * been consumed.
     *
     * @param stateValue the opaque state string from the IdP callback
     * @return the matching cache entry wrapped in {@link Optional}, or empty
     */
    Optional<HaOidcStateCache> findByStateValue(String stateValue);

    /**
     * Returns all state cache entries whose {@code created_at} timestamp is
     * strictly before the given cutoff instant.
     *
     * Used for periodic cleanup of expired PKCE state rows (entries older than
     * 600 seconds are considered expired per the spec).
     *
     * @param cutoff entries created before this instant are returned
     * @return list of expired cache entries; never {@code null}, may be empty
     */
    List<HaOidcStateCache> findByCreatedAtBefore(Instant cutoff);
}
