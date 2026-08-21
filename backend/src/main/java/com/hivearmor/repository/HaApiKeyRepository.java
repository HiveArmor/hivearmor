package com.hivearmor.repository;

import com.hivearmor.domain.HaApiKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for the {@link HaApiKey} entity.
 *
 * <p>Extends {@link JpaRepository} to provide standard CRUD operations plus a
 * derived query that narrows candidate rows by their key prefix — used during
 * API-key authentication to avoid a full-table scan before the more expensive
 * bcrypt verification step.
 *
 * <p>The {@code key_prefix} column holds the first 8 characters of the plaintext
 * token. Multiple rows sharing the same prefix are theoretically possible (though
 * unlikely); the caller is responsible for iterating results and bcrypt-verifying
 * each one until a match is found or the list is exhausted.
 */
@Repository
public interface HaApiKeyRepository extends JpaRepository<HaApiKey, UUID> {

    /**
     * Finds the API key record whose {@code key_prefix} matches the given value.
     *
     * <p>The prefix is the first 8 characters of the plaintext token (e.g.
     * {@code "ha_XXXXX"}). In practice, prefix collisions are rare because the
     * token body is generated from a 64-character URL-safe alphabet via
     * {@code SecureRandom}, making the probability of two live keys sharing the
     * same 8-character prefix negligible. The method returns an
     * {@link Optional} so callers handle the absent case cleanly.
     *
     * @param keyPrefix the first 8 characters of the plaintext API-key token;
     *                  must not be {@code null}
     * @return an {@link Optional} containing the matching {@link HaApiKey}, or
     *         {@link Optional#empty()} if no row has the given prefix
     */
    Optional<HaApiKey> findByKeyPrefix(String keyPrefix);
}
