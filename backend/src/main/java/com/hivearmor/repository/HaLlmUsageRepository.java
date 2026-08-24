package com.hivearmor.repository;

import com.hivearmor.domain.HaLlmUsage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the durable LLM usage ledger.
 */
@Repository
public interface HaLlmUsageRepository extends JpaRepository<HaLlmUsage, Long> {
}
