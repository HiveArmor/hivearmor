package com.hivearmor.repository;

import com.hivearmor.domain.FindingIdempotency;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

/**
 * Spring Data JPA repository for the {@link FindingIdempotency} entity.
 *
 * <p>Provides lookup by idempotency key for duplicate request detection and
 * a cleanup method for expired records.
 *
 * <p>Sprint 44 — Correlated findings lifecycle mutations (COR-004).
 */
@Repository
public interface FindingIdempotencyRepository extends JpaRepository<FindingIdempotency, String> {

    /**
     * Finds an existing idempotency record by its key.
     *
     * @param idempotencyKey the client-provided idempotency key
     * @return an Optional containing the cached record if found
     */
    Optional<FindingIdempotency> findByIdempotencyKey(String idempotencyKey);

    /**
     * Deletes all expired idempotency records. Called by a scheduled cleanup job.
     *
     * @param now the current timestamp — records with expires_at before this are removed
     * @return number of records deleted
     */
    @Modifying
    int deleteByExpiresAtBefore(Instant now);
}
