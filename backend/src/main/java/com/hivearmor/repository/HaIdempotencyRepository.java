package com.hivearmor.repository;

import com.hivearmor.domain.HaIdempotencyRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

/**
 * Spring Data JPA repository for the {@link HaIdempotencyRecord} entity.
 *
 * <p>Provides lookup by the unique triple (idempotency_key, tenant_prefix, user_id)
 * and a cleanup method for expired records.
 *
 * <p>Sprint 36 — Bulk assignment idempotency (S36-T04).
 */
@Repository
public interface HaIdempotencyRepository extends JpaRepository<HaIdempotencyRecord, Long> {

    /**
     * Finds an existing idempotency record by its key, tenant prefix, and user ID.
     * Returns only non-expired records (expires_at > now).
     *
     * @param idempotencyKey the client-provided idempotency key
     * @param tenantPrefix   the current tenant prefix (may be null for non-MSSP)
     * @param userId         the authenticated user's ID
     * @return an Optional containing the cached record if found and not expired
     */
    @Query("SELECT r FROM HaIdempotencyRecord r " +
           "WHERE r.idempotencyKey = :key " +
           "AND (r.tenantPrefix = :tenant OR (r.tenantPrefix IS NULL AND :tenant IS NULL)) " +
           "AND r.userId = :userId " +
           "AND r.expiresAt > :now")
    Optional<HaIdempotencyRecord> findByKeyAndTenantAndUser(
            @Param("key") String idempotencyKey,
            @Param("tenant") String tenantPrefix,
            @Param("userId") Long userId,
            @Param("now") Instant now);

    /**
     * Deletes all expired idempotency records. Called by a scheduled cleanup job.
     *
     * @param now the current timestamp
     * @return number of records deleted
     */
    @Modifying
    @Query("DELETE FROM HaIdempotencyRecord r WHERE r.expiresAt <= :now")
    int deleteExpired(@Param("now") Instant now);
}
