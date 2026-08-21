package com.hivearmor.repository;

import com.hivearmor.domain.RuleExecution;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

/**
 * Spring Data JPA repository for the {@link RuleExecution} entity.
 *
 * <p>Provides lookup by rule ID, tenant, and time range for execution history
 * monitoring and health computation.
 *
 * <p>Sprint 47 — Detection Rules (DET-009).
 */
@Repository
public interface RuleExecutionRepository extends JpaRepository<RuleExecution, String> {

    /**
     * Finds executions for a specific rule ordered by started_at descending.
     */
    Page<RuleExecution> findByRuleIdOrderByStartedAtDesc(String ruleId, Pageable pageable);

    /**
     * Finds the most recent executions for a rule (for health computation).
     */
    List<RuleExecution> findTop10ByRuleIdOrderByStartedAtDesc(String ruleId);

    /**
     * Finds executions for a rule within a time range.
     */
    List<RuleExecution> findByRuleIdAndStartedAtBetween(String ruleId, Instant from, Instant to);

    /**
     * Finds executions by tenant ordered by started_at descending.
     */
    Page<RuleExecution> findByTenantIdOrderByStartedAtDesc(Long tenantId, Pageable pageable);
}
