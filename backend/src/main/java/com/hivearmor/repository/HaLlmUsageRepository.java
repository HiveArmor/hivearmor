package com.hivearmor.repository;

import com.hivearmor.domain.HaLlmUsage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for the durable LLM usage ledger.
 */
@Repository
public interface HaLlmUsageRepository extends JpaRepository<HaLlmUsage, Long> {

    /**
     * Counts rows grouped by {@code cascade_decision}.
     *
     * @return rows of {@code [cascadeDecision, count]}
     */
    @Query("SELECT u.cascadeDecision, COUNT(u) FROM HaLlmUsage u GROUP BY u.cascadeDecision")
    List<Object[]> countGroupedByCascadeDecision();
}
