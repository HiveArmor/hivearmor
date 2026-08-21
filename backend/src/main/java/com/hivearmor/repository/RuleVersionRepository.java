package com.hivearmor.repository;

import com.hivearmor.domain.RuleVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for the {@link RuleVersion} entity.
 *
 * <p>Provides lookup by rule ID and version number for version history,
 * diff viewing, and revert operations.
 *
 * <p>Sprint 47 — Detection Rules (DET-016).
 */
@Repository
public interface RuleVersionRepository extends JpaRepository<RuleVersion, String> {

    /**
     * Finds all versions of a specific rule ordered by version descending.
     */
    List<RuleVersion> findByRuleIdOrderByVersionDesc(String ruleId);

    /**
     * Finds a specific version of a rule.
     */
    Optional<RuleVersion> findByRuleIdAndVersion(String ruleId, Integer version);
}
