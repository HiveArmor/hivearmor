package com.hivearmor.repository;

import com.hivearmor.domain.HuntHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

/**
 * Spring Data JPA repository for {@link HuntHistory}.
 *
 * Provides access to per-user query execution history, ordered by
 * execution time. Supports counting and pruning operations.
 *
 * Backs GET/DELETE /api/ha-hunts/history
 */
@Repository
public interface HuntHistoryRepository extends JpaRepository<HuntHistory, String> {

    List<HuntHistory> findByUserIdOrderByExecutedAtDesc(String userId);

    long countByUserId(String userId);

    void deleteByUserIdAndExecutedAtBefore(String userId, Instant before);
}
