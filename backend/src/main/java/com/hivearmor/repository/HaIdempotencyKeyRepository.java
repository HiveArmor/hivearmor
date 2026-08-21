package com.hivearmor.repository;

import com.hivearmor.domain.HaIdempotencyKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * Spring Data JPA repository for the {@link HaIdempotencyKey} entity.
 *
 * <p>Provides lookup by (idempotency_key, tenant_id) and cleanup of expired records.
 *
 * <p>Sprint 49 — HAR-003: Idempotency-Key extension for bulk operations.
 */
@Repository
public interface HaIdempotencyKeyRepository extends JpaRepository<HaIdempotencyKey, Long> {

    /**
     * Finds an existing idempotency key record by its key and tenant ID.
     *
     * @param idempotencyKey the client-provided idempotency key
     * @param tenantId       the current tenant identifier
     * @return an Optional containing the record if found
     */
    Optional<HaIdempotencyKey> findByIdempotencyKeyAndTenantId(String idempotencyKey, String tenantId);

    /**
     * Deletes all idempotency key records that have expired (expires_at < cutoff).
     *
     * @param cutoff the cutoff timestamp — records with expires_at before this are deleted
     */
    @Modifying
    @Transactional
    void deleteByExpiresAtBefore(Instant cutoff);
}
