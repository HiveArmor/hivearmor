package com.hivearmor.repository;

import com.hivearmor.domain.RuleApproval;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for the {@link RuleApproval} entity.
 *
 * <p>Provides lookup by rule ID for approval history and review
 * workflow status tracking.
 *
 * <p>Sprint 47 — Detection Rules (DET-016).
 */
@Repository
public interface RuleApprovalRepository extends JpaRepository<RuleApproval, String> {

    /**
     * Finds all approval records for a specific rule ordered by creation time.
     */
    List<RuleApproval> findByRuleIdOrderByCreatedAtDesc(String ruleId);

    /**
     * Finds approval records for a specific rule and version.
     */
    List<RuleApproval> findByRuleIdAndVersion(String ruleId, Integer version);
}
